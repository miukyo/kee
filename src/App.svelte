<script lang="ts">
    import { onMount } from "svelte";
    import { generateTOTP, getTOTPTimeRemaining } from "./lib/crypto";
    import {
        loadTfa,
        saveTfa,
        removeTfa,
        loadPasswords,
        savePassword,
        removePassword,
    } from "./lib/db";
    import TextScramble from "./lib/TextScramble.svelte";
    import type { TwoFactorEntry, PasswordEntry } from "./lib/types";

    let tfaEntries = $state<TwoFactorEntry[]>([]);
    let pwEntries = $state<PasswordEntry[]>([]);

    let currentTab = $state<"2fa" | "passwords">("2fa");
    let showAddTfa = $state(false);
    let newTfaLabel = $state("");
    let newTfaSecret = $state("");

    let showAddPw = $state(false);
    let newPwLabel = $state("");

    let pwLen = $state(24);
    let pwUpper = $state(true);
    let pwLower = $state(true);
    let pwDigits = $state(true);
    let pwSymbols = $state(false);
    let pwAmb = $state(false);
    let newPwValue = $state("");

    const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const LOWER = "abcdefghijklmnopqrstuvwxyz";
    const DIGITS = "0123456789";
    const SYMBOLS = "!@#$%^&*()_+-=[]{}|;:,.<>?";
    const AMB = "0O1lI|";

    let tokens = $state<Record<string, string>>({});
    let now = $state(Date.now());
    let lastWindow = $state(-1);
    let showQrScanner = $state(false);
    let qrScanner: any = null;
    let qrReaderId: string | null = null;

    onMount(() => {
        const init = async () => {
            tfaEntries = await loadTfa();
            pwEntries = await loadPasswords();
            for (const e of tfaEntries) {
                if (e.secret) tokens[e.id] = await generateTOTP(e.secret);
            }
        };
        init();

        lastWindow = Math.floor(Date.now() / 30000);
        const id = setInterval(tick, 1000);

        return () => clearInterval(id);
    });

    async function tick() {
        now = Date.now();
        const w = Math.floor(now / 30000);
        if (w !== lastWindow) {
            lastWindow = w;
            for (const e of tfaEntries) {
                if (e.secret) tokens[e.id] = await generateTOTP(e.secret);
            }
        }
    }

    function remaining(): number {
        return 30 - (Math.floor(now / 1000) % 30);
    }

    function progress(): number {
        return ((Math.floor(now / 1000) % 30) / 30) * 100;
    }

    let searchQuery = $state("");
    let filteredTfa = $derived(
        searchQuery
            ? tfaEntries.filter((e) =>
                  e.label.toLowerCase().includes(searchQuery.toLowerCase()),
              )
            : tfaEntries,
    );
    let filteredPw = $derived(
        searchQuery
            ? pwEntries.filter((e) =>
                  e.label.toLowerCase().includes(searchQuery.toLowerCase()),
              )
            : pwEntries,
    );

    async function addTfa() {
        const label = newTfaLabel.trim();
        const secret = newTfaSecret.trim();
        if (!label || !secret) return;
        const entry: TwoFactorEntry = {
            id: crypto.randomUUID(),
            label,
            secret,
            createdAt: Date.now(),
        };
        await saveTfa(entry);
        tokens[entry.id] = await generateTOTP(entry.secret);
        tfaEntries = [...tfaEntries, entry];
        newTfaLabel = "";
        newTfaSecret = "";
        showAddTfa = false;
    }

    async function deleteTfa(id: string) {
        await removeTfa(id);
        delete tokens[id];
        tfaEntries = tfaEntries.filter((e) => e.id !== id);
    }

    function genPw() {
        let pool = "";
        if (pwUpper) pool += UPPER;
        if (pwLower) pool += LOWER;
        if (pwDigits) pool += DIGITS;
        if (pwSymbols) pool += SYMBOLS;
        if (!pool) {
            newPwValue = "";
            return;
        }
        if (pwAmb) for (const c of AMB) pool = pool.replaceAll(c, "");
        if (!pool) {
            newPwValue = "";
            return;
        }
        const buf = new Uint32Array(pwLen);
        crypto.getRandomValues(buf);
        let out = "";
        for (let i = 0; i < pwLen; i++) out += pool[buf[i] % pool.length];
        newPwValue = out;
    }

    async function addPw() {
        const label = newPwLabel.trim();
        if (!label || !newPwValue) return;
        const entry: PasswordEntry = {
            id: crypto.randomUUID(),
            label,
            value: newPwValue,
            createdAt: Date.now(),
        };
        await savePassword(entry);
        pwEntries = [...pwEntries, entry];
        newPwLabel = "";
        newPwValue = "";
        showAddPw = false;
    }

    async function deletePw(id: string) {
        await removePassword(id);
        pwEntries = pwEntries.filter((e) => e.id !== id);
    }

    let copiedId = $state<string | null>(null);
    let revealedPwId = $state<string | null>(null);
    let revealTimer: ReturnType<typeof setTimeout> | undefined;

    function revealPw(id: string) {
        if (revealedPwId === id) return;
        if (revealTimer) clearTimeout(revealTimer);
        revealedPwId = id;
        revealTimer = setTimeout(() => {
            if (revealedPwId === id) revealedPwId = null;
        }, 30000);
    }

    function hidePw(id: string) {
        if (revealedPwId === id) revealedPwId = null;
    }

    async function copyPw(id: string, value: string) {
        try {
            await navigator.clipboard.writeText(value);
            copiedId = id;
            setTimeout(() => {
                if (copiedId === id) copiedId = null;
            }, 1200);
        } catch {
            /* ignore */
        }
    }

    function openAddTfa() {
        if (showAddTfa) {
            showAddTfa = false;
            showQrScanner = false;
            newTfaLabel = "";
            newTfaSecret = "";
        } else {
            showAddTfa = true;
            showAddPw = false;
        }
    }

    function parseOtpAuthUri(
        uri: string,
    ): { label: string; secret: string } | null {
        try {
            const url = new URL(uri);
            if (url.protocol !== "otpauth:" || url.hostname !== "totp")
                return null;

            const secret = url.searchParams.get("secret");
            if (!secret) return null;

            const path = url.pathname.replace(/^\//, "");
            let label = path;
            if (path.includes(":")) {
                label = path.split(":")[1];
            }

            return { label: decodeURIComponent(label), secret };
        } catch {
            return null;
        }
    }

    async function startQrScanner() {
        if (!showAddTfa) return;

        const { Html5Qrcode } = await import("html5-qrcode");

        try {
            const cameras = await Html5Qrcode.getCameras();

            if (!cameras || cameras.length === 0) {
                alert("No cameras found on this device.");
                return;
            }

            showQrScanner = true;
            await new Promise((r) => setTimeout(r, 0));

            const video = document.getElementById(
                "qr-video",
            ) as HTMLVideoElement;
            if (!video) return;

            qrScanner = new Html5Qrcode("qr-video");
            qrReaderId = "qr-video";
            await qrScanner.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: { width: 250, height: 250 } },
                (decodedText: string) => {
                    const parsed = parseOtpAuthUri(decodedText);
                    if (parsed) {
                        newTfaLabel = parsed.label;
                        newTfaSecret = parsed.secret;
                        stopQrScanner();
                    }
                },
                () => {},
            );
        } catch (e) {
            console.error("Camera access denied or scanner error:", e);
            alert("Camera access is required to scan QR codes.");
            showQrScanner = false;
        }
    }

    async function stopQrScanner() {
        if (qrScanner) {
            try {
                await qrScanner.stop();
            } catch {
                /* ignore */
            }
            qrScanner = null;
        }
        showQrScanner = false;
    }

    function openAddPw() {
        if (showAddPw) {
            showAddPw = false;
            newPwLabel = "";
            newPwValue = "";
        } else {
            showAddPw = true;
            showAddTfa = false;
            genPw();
        }
    }

    function allowOnlyNumbers(event: KeyboardEvent) {
        // Allow navigation/editing keys: Backspace, Delete, Arrow keys, Tab
        const allowedKeys = [
            "Backspace",
            "Delete",
            "ArrowLeft",
            "ArrowRight",
            "Tab",
        ];

        if (allowedKeys.includes(event.key)) {
            return;
        }

        // Reject any key that isn't a number (0-9)
        if (!/^[0-9]$/.test(event.key)) {
            event.preventDefault();
        }
    }
</script>

<div
    class="min-h-screen bg-black text-white font-mono p-4 uppercase flex flex-col items-center"
>
    <div class="w-full max-w-xl">
        <div
            class="text-center text-xs mb-4 flicker"
            style="animation-delay: 0ms"
        >
            <div class="mb-0.5">KEE</div>
            <div class="text-white/50">2FA &amp; PASSWORD MANAGER</div>
        </div>

        <div
            class="flex items-center gap-2 pb-3 mb-4 border-b border-white/20 text-xs flicker"
            style="animation-delay: 80ms"
        >
            <button
                onclick={() => {
                    currentTab = "2fa";
                    showAddPw = false;
                }}
                class="bg-transparent cursor-pointer px-2 py-0.5 {currentTab ===
                '2fa'
                    ? 'text-white ring-1 ring-white/30'
                    : 'text-white/50 hover:text-white'}">2FA</button
            >
            <button
                onclick={() => {
                    currentTab = "passwords";
                    showAddTfa = false;
                }}
                class="bg-transparent cursor-pointer px-2 py-0.5 {currentTab ===
                'passwords'
                    ? 'text-white ring-1 ring-white/30'
                    : 'text-white/50 hover:text-white'}">PW</button
            >
            <span class="shrink-0 ml-2">SEARCH &gt;</span>
            <input
                type="text"
                bind:value={searchQuery}
                class="bg-transparent text-white flex-1 outline-none text-xs"
                placeholder="FILTER BY LABEL"
                spellcheck="false"
            />
            {#if currentTab === "2fa" && tfaEntries.length > 0}
                <div class="flex items-center gap-1.5 ml-auto shrink-0">
                    <div class="w-16 h-2.5 bg-white/10">
                        <div
                            class="bg-white h-full"
                            style="width: {progress()}%"
                        ></div>
                    </div>
                    <span class="w-5 text-right">{remaining()}S</span>
                </div>
            {/if}
        </div>

        {#if currentTab === "2fa"}
            <div class="mb-8">
                <div
                    class="flex items-center justify-between mb-3 flicker"
                    style="animation-delay: 160ms"
                >
                    <span class="text-xs"
                        ><span class="text-white/50">//</span>
                        [{filteredTfa.length}] 2FA {filteredTfa.length === 1
                            ? "ENTRY"
                            : "ENTRIES"}</span
                    >
                    <button
                        onclick={openAddTfa}
                        class="bg-transparent text-white cursor-pointer hover:bg-white hover:text-black px-2 py-0.5 text-xs"
                    >
                        {showAddTfa ? "[X] CANCEL" : "[+] ADD"}
                    </button>
                </div>

                {#if showAddTfa}
                    <div class="pl-4 mb-3">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="shrink-0 text-xs">LABEL &gt;</span>
                            <input
                                type="text"
                                bind:value={newTfaLabel}
                                class="bg-transparent text-white flex-1 outline-none text-sm"
                                placeholder="E.G. GITHUB"
                                spellcheck="false"
                            />
                        </div>
                        <div class="flex items-center gap-2 mb-3">
                            <span class="shrink-0 text-xs">SECRET &gt;</span>
                            <input
                                type="text"
                                bind:value={newTfaSecret}
                                class="bg-transparent text-white flex-1 outline-none text-sm normal-case"
                                placeholder="BASE32 SECRET"
                                spellcheck="false"
                            />
                        </div>
                        {#if showQrScanner}
                            <div
                                id="qr-video"
                                class="w-full mb-3 bg-white/5"
                            ></div>
                        {/if}
                        <div class="flex gap-3 flex-wrap">
                            <button
                                onclick={addTfa}
                                disabled={!newTfaLabel.trim() ||
                                    !newTfaSecret.trim()}
                                class="bg-transparent text-white cursor-pointer hover:bg-white hover:text-black px-2 py-0.5 text-xs disabled:opacity-30 disabled:cursor-default"
                            >
                                SAVE
                            </button>
                            <button
                                onclick={showQrScanner
                                    ? stopQrScanner
                                    : startQrScanner}
                                class="bg-transparent text-white cursor-pointer hover:bg-white hover:text-black px-2 py-0.5 text-xs"
                            >
                                {showQrScanner ? "[X] STOP SCAN" : "[QR] SCAN"}
                            </button>
                            <button
                                onclick={() => {
                                    showAddTfa = false;
                                    showQrScanner = false;
                                    newTfaLabel = "";
                                    newTfaSecret = "";
                                }}
                                class="bg-transparent text-white cursor-pointer hover:bg-white hover:text-black px-2 py-0.5 text-xs"
                            >
                                CANCEL
                            </button>
                        </div>
                    </div>
                {/if}

                {#each filteredTfa as entry, i (entry.id)}
                    <div
                        class="flex items-center gap-3 py-3 flicker"
                        style="animation-delay: {240 + i * 60}ms"
                    >
                        <span
                            class="w-32 truncate text-base shrink-0"
                            title={entry.label}>{entry.label}</span
                        >
                        <span
                            class="flex-1 text-center text-xl tracking-wider font-bold select-all normal-case"
                        >
                            <TextScramble
                                text={tokens[entry.id]
                                    ? tokens[entry.id].slice(0, 3) +
                                      " " +
                                      tokens[entry.id].slice(3)
                                    : "------"}
                            />
                        </span>
                        <button
                            onclick={() =>
                                copyPw(entry.id, tokens[entry.id] || "")}
                            class="bg-transparent text-white cursor-pointer hover:bg-white hover:text-black px-2 py-1 text-sm shrink-0 leading-none"
                        >
                            {copiedId === entry.id ? "OK" : "COPY"}
                        </button>
                        <button
                            onclick={() => deleteTfa(entry.id)}
                            class="bg-transparent text-white cursor-pointer hover:bg-white hover:text-black px-2 py-1 text-sm leading-none shrink-0"
                        >
                            X
                        </button>
                    </div>
                {:else}
                    {#if !showAddTfa}
                        <div class="text-white/50 text-xs pl-4">
                            {searchQuery
                                ? "NO MATCHING 2FA ENTRIES"
                                : "NO 2FA ENTRIES YET"}
                        </div>
                    {/if}
                {/each}
            </div>
        {/if}

        {#if currentTab === "passwords"}
            <div class="mb-6">
                <div
                    class="flex items-center justify-between mb-3 flicker"
                    style="animation-delay: 160ms"
                >
                    <span class="text-xs"
                        ><span class="text-white/50">//</span>
                        [{filteredPw.length}]
                        {filteredPw.length === 1
                            ? "PASSWORD"
                            : "PASSWORDS"}</span
                    >
                    <button
                        onclick={openAddPw}
                        class="bg-transparent text-white cursor-pointer hover:bg-white hover:text-black px-2 py-0.5 text-xs"
                    >
                        {showAddPw ? "[X] CANCEL" : "[+] ADD"}
                    </button>
                </div>

                {#if showAddPw}
                    <div class="pl-4 mb-3">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="shrink-0 text-xs">LABEL &gt;</span>
                            <input
                                type="text"
                                bind:value={newPwLabel}
                                class="bg-transparent text-white flex-1 outline-none text-sm"
                                placeholder="E.G. WIFI"
                                spellcheck="false"
                            />
                        </div>
                        <div
                            class="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2 text-xs"
                        >
                            <span>
                                LEN [<span
                                    contenteditable="true"
                                    bind:textContent={
                                        pwLen as unknown as string
                                    }
                                    onkeydown={allowOnlyNumbers}
                                    role="textbox"
                                    tabindex="0"
                                    class="inline-block bg-transparent text-white outline-none text-center text-xs"
                                ></span>]
                            </span>
                            <button
                                class="bg-transparent text-white cursor-pointer outline-none px-0"
                                onclick={() => (pwUpper = !pwUpper)}
                            >
                                A-Z [{pwUpper ? "X" : " "}]
                            </button>
                            <button
                                class="bg-transparent text-white cursor-pointer outline-none px-0"
                                onclick={() => (pwLower = !pwLower)}
                            >
                                A-Z [{pwLower ? "X" : " "}]
                            </button>
                            <button
                                class="bg-transparent text-white cursor-pointer outline-none px-0"
                                onclick={() => (pwDigits = !pwDigits)}
                            >
                                0-9 [{pwDigits ? "X" : " "}]
                            </button>
                            <button
                                class="bg-transparent text-white cursor-pointer outline-none px-0"
                                onclick={() => (pwSymbols = !pwSymbols)}
                            >
                                !@# [{pwSymbols ? "X" : " "}]
                            </button>
                            <button
                                class="bg-transparent text-white cursor-pointer outline-none px-0"
                                onclick={() => (pwAmb = !pwAmb)}
                            >
                                AMB [{pwAmb ? "X" : " "}]
                            </button>
                        </div>
                        <div
                            class="bg-white/5 px-3 py-3 mb-2 text-lg break-all select-all normal-case"
                        >
                            {#if newPwValue}
                                <TextScramble text={newPwValue} />
                            {:else}
                                SELECT AT LEAST ONE CHARACTER SET
                            {/if}
                        </div>
                        <div class="flex gap-3">
                            <button
                                onclick={genPw}
                                class="bg-transparent text-white cursor-pointer hover:bg-white hover:text-black px-2 py-0.5 text-xs"
                            >
                                GENERATE
                            </button>
                            <button
                                onclick={() => addPw()}
                                class="bg-transparent text-white cursor-pointer hover:bg-white hover:text-black px-2 py-0.5 text-xs"
                            >
                                SAVE
                            </button>
                            <button
                                onclick={() => {
                                    showAddPw = false;
                                    newPwLabel = "";
                                    newPwValue = "";
                                }}
                                class="bg-transparent text-white cursor-pointer hover:bg-white hover:text-black px-2 py-0.5 text-xs"
                            >
                                CANCEL
                            </button>
                        </div>
                    </div>
                {/if}

                {#each filteredPw as entry, i (entry.id)}
                    <div
                        class="flex items-center gap-3 py-3 flicker"
                        style="animation-delay: {240 + i * 60}ms"
                    >
                        <span
                            class="w-32 truncate text-base shrink-0"
                            title={entry.label}>{entry.label}</span
                        >
                        {#if revealedPwId === entry.id}
                            <span
                                role="button"
                                tabindex="0"
                                onclick={() => hidePw(entry.id)}
                                onkeydown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        hidePw(entry.id);
                                    }
                                }}
                                class="flex-1 text-left text-xl select-all normal-case cursor-pointer"
                            >
                                <TextScramble text={entry.value} />
                            </span>
                        {:else}
                            <span
                                role="button"
                                tabindex="0"
                                onclick={() => revealPw(entry.id)}
                                onkeydown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        revealPw(entry.id);
                                    }
                                }}
                                class="flex-1 text-left text-xl truncate select-all normal-case cursor-pointer"
                                >{"*".repeat(entry.value.length)}</span
                            >
                        {/if}
                        <button
                            onclick={() => copyPw(entry.id, entry.value)}
                            class="bg-transparent text-white cursor-pointer hover:bg-white hover:text-black px-2 py-1 text-sm shrink-0 leading-none"
                        >
                            {copiedId === entry.id ? "OK" : "COPY"}
                        </button>
                        <button
                            onclick={() => deletePw(entry.id)}
                            class="bg-transparent text-white cursor-pointer hover:bg-white hover:text-black px-2 py-1 text-sm shrink-0 leading-none"
                        >
                            X
                        </button>
                    </div>
                {:else}
                    {#if !showAddPw}
                        <div class="text-white/50 text-xs pl-4">
                            {searchQuery
                                ? "NO MATCHING PASSWORDS"
                                : "NO PASSWORDS YET"}
                        </div>
                    {/if}
                {/each}
            </div>
        {/if}
    </div>
</div>
