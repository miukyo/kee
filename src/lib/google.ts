import { GOOGLE_CLIENT_ID, BACKUP_FILE_NAME } from "./config";

const DISCOVERY_DOC = "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest";
const SCOPES = "https://www.googleapis.com/auth/drive.appdata openid";
const SUB_STORAGE_KEY = "kee-google-sub";
const TOKEN_STORAGE_KEY = "kee-google-token";

interface StoredToken {
    accessToken: string;
    sub: string;
    expiresAt: number;
}

let tokenClient: any = null;
let initDone = false;
let initError: string | null = null;

function waitWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Timed out")), ms)),
    ]);
}

function waitForGapi(): Promise<void> {
    return new Promise((resolve) => {
        if (typeof gapi !== "undefined") {
            gapi.load("client", () => resolve());
            return;
        }
        const check = () => {
            if (typeof gapi !== "undefined") {
                gapi.load("client", () => resolve());
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
}

function waitForGis(): Promise<void> {
    return new Promise((resolve) => {
        if (typeof google !== "undefined" && google.accounts) {
            resolve();
            return;
        }
        const check = () => {
            if (typeof google !== "undefined" && google.accounts) {
                resolve();
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
}

/** Call once on app mount — pre-initialises everything so signIn can run synchronously. */
export async function initGoogle(): Promise<void> {
    if (initDone) return;
    if (initPromise) return initPromise;
    initPromise = (async () => {
        try {
            await waitWithTimeout(waitForGapi(), 15000);
            await waitWithTimeout(waitForGis(), 15000);
            await gapi.client.init({ discoveryDocs: [DISCOVERY_DOC] });
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: GOOGLE_CLIENT_ID,
                scope: SCOPES,
                callback: "",
            });
            initDone = true;
        } catch (e: any) {
            initError = e.message ?? "Init failed";
            throw e;
        }
    })();
    return initPromise;
}
let initPromise: Promise<void> | null = null;

function ensureReady(): void {
    if (!initDone) throw new Error(initError ?? "Google not initialised yet — try again");
}

export function getAccessToken(): string | null {
    try {
        const token = gapi.client.getToken();
        return token ? token.access_token : null;
    } catch {
        return null;
    }
}

function storeTokenInfo(t: StoredToken): void {
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(t));
}

function getStoredToken(): StoredToken | null {
    try {
        const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
        if (!raw) return null;
        const t: StoredToken = JSON.parse(raw);
        if (t.accessToken && t.sub && t.expiresAt) return t;
        return null;
    } catch {
        return null;
    }
}

function clearStoredToken(): void {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
}

async function verifyToken(accessToken: string): Promise<string | null> {
    try {
        const res = await fetch("https://www.googleapis.com/oauth2/v1/userinfo?alt=json", {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.id ?? null;
    } catch {
        return null;
    }
}

/** Restore session from a previously stored access token (no GIS fallback). */
export async function tryRestoreSession(): Promise<string | null> {
    const stored = getStoredToken();
    if (!stored) return null;
    if (Date.now() >= stored.expiresAt) {
        clearStoredToken();
        return null;
    }
    try {
        gapi.client.setToken({ access_token: stored.accessToken });
        const sub = await verifyToken(stored.accessToken);
        if (sub === stored.sub) {
            localStorage.setItem(SUB_STORAGE_KEY, sub);
            return sub;
        }
    } catch { /* token invalid */ }
    clearStoredToken();
    return null;
}

/** Must be called synchronously from a click handler (no await before requestAccessToken). */
export function signIn(): Promise<{ accessToken: string; sub: string }> {
    ensureReady();

    return new Promise((resolve, reject) => {
        tokenClient.callback = async (resp: any) => {
            if (resp.error) {
                reject(new Error(resp.error));
                return;
            }
            try {
                const sub = await fetchUserSub(resp.access_token);
                localStorage.setItem(SUB_STORAGE_KEY, sub);
                storeTokenInfo({
                    accessToken: resp.access_token,
                    sub,
                    expiresAt: Date.now() + (resp.expires_in ?? 3600) * 1000,
                });
                resolve({ accessToken: resp.access_token, sub });
            } catch (e: any) {
                reject(e);
            }
        };

        tokenClient.requestAccessToken({ prompt: "consent" });
    });
}

async function fetchUserSub(accessToken: string): Promise<string> {
    const res = await fetch("https://www.googleapis.com/oauth2/v1/userinfo?alt=json", {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error("Failed to fetch user info");
    const data = await res.json();
    if (!data.id) throw new Error("User info missing id");
    return data.id;
}

export function signOut(): void {
    try {
        const token = gapi.client.getToken();
        if (token) {
            google.accounts.oauth2.revoke(token.access_token);
            gapi.client.setToken("");
        }
    } catch { /* not initialised */ }
    localStorage.removeItem(SUB_STORAGE_KEY);
    clearStoredToken();
}

export async function uploadBackup(encryptedData: string): Promise<void> {
    const token = gapi.client.getToken();
    if (!token) throw new Error("Not signed in");

    const existing = await findBackupFile();
    const metadata: Record<string, any> = {
        name: BACKUP_FILE_NAME,
        mimeType: "application/octet-stream",
    };
    if (!existing) metadata.parents = ["appDataFolder"];

    const blob = new Blob([encryptedData], { type: "application/octet-stream" });
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("file", blob);

    const method = existing ? "PATCH" : "POST";
    const url = existing
        ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart`
        : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";

    const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token.access_token}` },
        body: form,
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Upload failed: ${res.status} ${text}`);
    }
}

export async function downloadBackup(): Promise<string | null> {
    const token = gapi.client.getToken();
    if (!token) throw new Error("Not signed in");

    const file = await findBackupFile();
    if (!file) return null;

    const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
        { headers: { Authorization: `Bearer ${token.access_token}` } },
    );
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    return res.text();
}

async function findBackupFile(): Promise<{ id: string } | null> {
    const res = await gapi.client.drive.files.list({
        spaces: "appDataFolder",
        pageSize: 10,
        fields: "files(id, name)",
    });
    const files = res.result.files;
    if (!files || files.length === 0) return null;
    const match = files.find((f: any) => f.name === BACKUP_FILE_NAME);
    return match ? { id: match.id } : null;
}
