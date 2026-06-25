<script lang="ts">
    import { onMount } from "svelte";
    import { generateTOTP } from "./lib/crypto";
    import { loadTfa, loadPasswords, saveTfa, savePassword } from "./lib/db";
    import TextScramble from "./components/TextScramble.svelte";
    import AsciiWaves from "./components/AsciiWaves.svelte";
    import type { TwoFactorEntry, PasswordEntry } from "./lib/types";
    import { remaining, progress } from "./lib/time";
    import { allowOnlyNumbers } from "./lib/helpers";
    import { addTfaFn, deleteTfaFn } from "./lib/tfa";
    import { tickFn } from "./lib/tick";
    import { generatePassword, addPwFn, deletePwFn } from "./lib/pw";
    import { copyToClipboard } from "./lib/clipboard";
    import { startQrScannerFn, stopQrScannerFn } from "./lib/scanner";
    import {
        initGoogle,
        signIn,
        signOut as googleSignOut,
        uploadBackup,
        downloadBackup,
        tryRestoreSession,
    } from "./lib/google";
    import {
        buildBackupPayload,
        parseBackupPayload,
        encryptBackup,
        decryptBackup,
    } from "./lib/backup";
    import { GOOGLE_CLIENT_ID } from "./lib/config";

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

    let tokens = $state<Record<string, string>>({});
    let now = $state(Date.now());
    let lastWindow = $state(-1);
    let showQrScanner = $state(false);
    let googleSub = $state<string | null>(null);
    let googleLoading = $state(false);
    let backupMsg = $state("");

    let backupTimeout: ReturnType<typeof setTimeout> | undefined;

    onMount(() => {
        const init = async () => {
            tfaEntries = await loadTfa();
            pwEntries = await loadPasswords();
            for (const e of tfaEntries) {
                if (e.secret) tokens[e.id] = await generateTOTP(e.secret);
            }

            await initGoogle();
            const sub = await tryRestoreSession();
            if (sub) {
                googleSub = sub;
                await autoRestore();
                autoBackup();
            }
        };
        init();

        lastWindow = Math.floor(Date.now() / 30000);
        const id = setInterval(tick, 1000);

        return () => clearInterval(id);
    });

    async function tick() {
        const r = await tickFn(tfaEntries, lastWindow, tokens);
        now = r.now;
        lastWindow = r.lastWindow;
        tokens = r.tokens;
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
        const r = await addTfaFn(label, secret, tfaEntries, tokens);
        tfaEntries = r.entries;
        tokens = r.tokens;
        newTfaLabel = "";
        newTfaSecret = "";
        showAddTfa = false;
        autoBackup();
    }

    async function deleteTfa(id: string) {
        const r = await deleteTfaFn(id, tfaEntries, tokens);
        tfaEntries = r.entries;
        tokens = r.tokens;
        autoBackup();
    }

    function genPw() {
        const pw = generatePassword(
            pwLen,
            pwUpper,
            pwLower,
            pwDigits,
            pwSymbols,
            pwAmb,
        );
        newPwValue = pw;
    }

    async function addPw() {
        const label = newPwLabel.trim();
        if (!label || !newPwValue) return;
        pwEntries = await addPwFn(label, newPwValue, pwEntries);
        newPwLabel = "";
        newPwValue = "";
        showAddPw = false;
        autoBackup();
    }

    async function deletePw(id: string) {
        pwEntries = await deletePwFn(id, pwEntries);
        autoBackup();
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
        const ok = await copyToClipboard(value);
        if (ok) {
            copiedId = id;
            setTimeout(() => {
                if (copiedId === id) copiedId = null;
            }, 1200);
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

    async function startQrScanner() {
        if (!showAddTfa) return;
        showQrScanner = true;
        await startQrScannerFn((label, secret) => {
            newTfaLabel = label;
            newTfaSecret = secret;
            showQrScanner = false;
        });
    }

    async function stopQrScanner() {
        await stopQrScannerFn();
        showQrScanner = false;
    }

    function showMsg(msg: string) {
        backupMsg = msg;
        if (backupTimeout) clearTimeout(backupTimeout);
        backupTimeout = setTimeout(() => {
            backupMsg = "";
        }, 2000);
    }

    let backupTimer: ReturnType<typeof setTimeout> | undefined;

    async function autoBackup() {
        if (backupTimer) clearTimeout(backupTimer);
        backupTimer = setTimeout(async () => {
            try {
                if (!googleSub) return;
                const payload = buildBackupPayload(tfaEntries, pwEntries);
                const encrypted = await encryptBackup(payload, googleSub);
                await uploadBackup(encrypted);
                showMsg("BACKED UP");
            } catch (e: any) {
                console.error("Auto-backup:", e.message);
            }
        }, 100);
    }

    async function autoRestore() {
        if (!googleSub) return;
        try {
            const encrypted = await downloadBackup();
            if (!encrypted) {
                showMsg("NO BACKUP");
                return;
            }
            const decrypted = await decryptBackup(encrypted, googleSub);
            const payload = parseBackupPayload(decrypted);

            const existingTfaIds = new Set(tfaEntries.map((e) => e.id));
            const existingPwIds = new Set(pwEntries.map((e) => e.id));
            let added = 0;

            if (payload.tfa) {
                for (const e of payload.tfa) {
                    if (existingTfaIds.has(e.id)) continue;
                    await saveTfa(e);
                    tfaEntries = [...tfaEntries, e];
                    if (e.secret) tokens[e.id] = await generateTOTP(e.secret);
                    added++;
                }
            }
            if (payload.passwords) {
                for (const e of payload.passwords) {
                    if (existingPwIds.has(e.id)) continue;
                    await savePassword(e);
                    pwEntries = [...pwEntries, e];
                    added++;
                }
            }
            showMsg(`RESTORED`);
        } catch (e: any) {
            showMsg(`RESTORE FAILED`);
        }
    }

    function handleSignIn() {
        if (!GOOGLE_CLIENT_ID) {
            showMsg("ERROR");
            console.error(
                "Google Client ID is not set. Please set it in src/lib/config.ts.",
            );
            return;
        }
        googleLoading = true;
        try {
            signIn()
                .then(async ({ sub }) => {
                    googleSub = sub;
                    showMsg("SIGNED IN");
                    await autoRestore();
                    autoBackup();
                })
                .catch((e: any) => {
                    showMsg(`SIGN IN FAILED`);
                    console.error("Google Sign-In Error:", e);
                })
                .finally(() => {
                    googleLoading = false;
                });
        } catch (e: any) {
            showMsg(`SIGN IN FAILED`);
            console.error("Google Sign-In Error:", e);
            googleLoading = false;
        }
    }

    function handleSignOut() {
        googleSignOut();
        googleSub = null;
        showMsg("SIGNED OUT");
    }
</script>

<AsciiWaves />

<div
    class="min-h-dvh bg-black text-white font-mono px-4 uppercase flex flex-col items-center"
>
    <div class="w-full max-w-xl">
        <div class="sticky top-0 z-10 bg-black pt-4">
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
                <span class="shrink-0 ml-2">&gt;</span>
                <input
                    type="text"
                    bind:value={searchQuery}
                    class="bg-transparent text-white flex-1 min-w-1/3 outline-none text-xs"
                    placeholder="SEARCH"
                    spellcheck="false"
                />
                {#if googleSub}
                    <button
                        onclick={handleSignOut}
                        class="bg-transparent text-white/50 hover:text-white cursor-pointer px-1 shrink-0"
                        >SIGN OUT</button
                    >
                {:else}
                    <button
                        onclick={handleSignIn}
                        disabled={googleLoading}
                        class="bg-transparent text-white/50 hover:text-white cursor-pointer px-1 shrink-0 disabled:opacity-30"
                        >{googleLoading ? "..." : "SIGN IN"}</button
                    >
                {/if}
                <!-- {#if currentTab === "2fa" && tfaEntries.length > 0}
                <div class="flex items-center gap-1.5 ml-auto shrink-0">
                    <div class="w-16 h-2.5 bg-white/10">
                        <div
                            class="bg-white h-full"
                            style="width: {progress(now)}%"
                        ></div>
                    </div>
                    <span class="w-5 text-right">{remaining(now)}S</span>
                </div>
            {/if} -->
            </div>
        </div>

        <div>
            {#if currentTab === "2fa"}
                <div class="mb-2">
                    <div
                        class="flex items-center justify-between mb-3 flicker"
                        style="animation-delay: 160ms"
                    >
                        <span class="text-xs"
                            ><span class="text-white/50">//</span>
                            [{filteredTfa.length}] 2FA {filteredTfa.length === 1
                                ? "ENTRY"
                                : "ENTRIES"}
                        </span>
                        <div class="flex items-center justify-end gap-4">
                            <span class="w-5 text-right text-xs"
                                >[{remaining(now)}S]</span
                            >
                            <button
                                onclick={openAddTfa}
                                class="bg-transparent text-white cursor-pointer hover:bg-white hover:text-black px-2 py-0.5 text-xs"
                            >
                                {showAddTfa ? "[X] CANCEL" : "[+] ADD"}
                            </button>
                        </div>
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
                                <span class="shrink-0 text-xs">SECRET &gt;</span
                                >
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
                            <div class="flex gap-2 flex-wrap">
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
                                    {showQrScanner
                                        ? "[X] STOP SCAN"
                                        : "[QR] SCAN"}
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
                            class="flex items-center gap-2 py-3 flicker"
                            style="animation-delay: {240 + i * 60}ms"
                        >
                            <div class="flex flex-1 flex-col">
                                <span
                                    class="truncate text-xs text-white/50 shrink-0"
                                    title={entry.label}>{entry.label}</span
                                >
                                <span
                                    class="flex-1 text-2xl tracking-wider font-bold normal-case"
                                >
                                    <TextScramble
                                        text={tokens[entry.id]
                                            ? tokens[entry.id].slice(0, 3) +
                                              " " +
                                              tokens[entry.id].slice(3)
                                            : "------"}
                                    />
                                </span>
                            </div>

                            <button
                                onclick={() =>
                                    copyPw(entry.id, tokens[entry.id] || "")}
                                class="bg-transparent mt-4 text-white cursor-pointer hover:bg-white hover:text-black px-2 py-1 text-sm shrink-0 leading-none"
                            >
                                {copiedId === entry.id ? "OK" : "COPY"}
                            </button>
                            <button
                                onclick={() => deleteTfa(entry.id)}
                                class="bg-transparent mt-4 text-white cursor-pointer hover:bg-white hover:text-black px-2 py-1 text-sm leading-none shrink-0"
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
                <div class="mb-2">
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
                                class="bg-white/5 px-3 py-3 mb-2 text-lg break-all normal-case"
                            >
                                {#if newPwValue}
                                    <TextScramble text={newPwValue} />
                                {:else}
                                    SELECT AT LEAST ONE CHARACTER SET
                                {/if}
                            </div>
                            <div class="flex gap-2">
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
                            class="flex items-center gap-2 py-3 flicker"
                            style="animation-delay: {240 + i * 60}ms"
                        >
                            <div class="flex flex-1 flex-col">
                                <span
                                    class="truncate text-xs text-white/50 shrink-0"
                                    title={entry.label}>{entry.label}</span
                                >
                                {#if revealedPwId === entry.id}
                                    <span
                                        role="button"
                                        tabindex="0"
                                        onclick={() => hidePw(entry.id)}
                                        onkeydown={(e) => {
                                            if (
                                                e.key === "Enter" ||
                                                e.key === " "
                                            ) {
                                                e.preventDefault();
                                                hidePw(entry.id);
                                            }
                                        }}
                                        class="flex-1 text-left text-base normal-case cursor-pointer"
                                    >
                                        <TextScramble text={entry.value} />
                                    </span>
                                {:else}
                                    <span
                                        role="button"
                                        tabindex="0"
                                        onclick={() => revealPw(entry.id)}
                                        onkeydown={(e) => {
                                            if (
                                                e.key === "Enter" ||
                                                e.key === " "
                                            ) {
                                                e.preventDefault();
                                                revealPw(entry.id);
                                            }
                                        }}
                                        class="flex-1 text-left text-base truncate normal-case cursor-pointer"
                                        >{"*".repeat(entry.value.length)}</span
                                    >
                                {/if}
                            </div>

                            <button
                                onclick={() => copyPw(entry.id, entry.value)}
                                class="bg-transparent mt-3 text-white cursor-pointer hover:bg-white hover:text-black px-2 py-1 text-sm shrink-0 leading-none"
                            >
                                {copiedId === entry.id ? "OK" : "COPY"}
                            </button>
                            <button
                                onclick={() => deletePw(entry.id)}
                                class="bg-transparent mt-3 text-white cursor-pointer hover:bg-white hover:text-black px-2 py-1 text-sm shrink-0 leading-none"
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

            {#if backupMsg}
                <p
                    class="text-white/30 text-xs shrink-0 flicker text-center mb-6"
                >
                    [{backupMsg}]
                </p>
            {/if}
        </div>
    </div>
</div>
