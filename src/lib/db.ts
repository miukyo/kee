import { createStore, get, set, del } from "idb-keyval";
import type { TwoFactorEntry, PasswordEntry } from "./types";
import { encryptData, decryptData, getMasterKey } from "./crypto";

const VAULT_KEY = "vault";
const VAULT_META_KEY = "meta";
const store = createStore("kee-vault", "store");

export interface VaultData {
    tfa: TwoFactorEntry[];
    passwords: PasswordEntry[];
}

export interface VaultMeta {
    salt: string;
    testCiphertext: string;
    testIv: string;
}

export async function hasVault(): Promise<boolean> {
    const raw = await get<string>(VAULT_META_KEY, store);
    return raw != null;
}

export async function getVaultMeta(): Promise<VaultMeta | null> {
    const raw = await get<string>(VAULT_META_KEY, store);
    if (!raw) return null;
    return JSON.parse(raw);
}

export async function setVaultMeta(meta: VaultMeta): Promise<void> {
    await set(VAULT_META_KEY, JSON.stringify(meta), store);
}

export async function clearVault(): Promise<void> {
    await del(VAULT_KEY, store);
    await del(VAULT_META_KEY, store);
}

export async function loadVault(): Promise<VaultData | null> {
    const key = getMasterKey();
    if (!key) throw new Error("Vault is locked");
    const raw = await get<string>(VAULT_KEY, store);
    if (!raw) return null;
    const { ciphertext, iv } = JSON.parse(raw);
    const decrypted = await decryptData(ciphertext, iv, key);
    return JSON.parse(decrypted);
}

export async function saveVault(data: VaultData): Promise<void> {
    const key = getMasterKey();
    if (!key) throw new Error("Vault is locked");
    const plaintext = JSON.stringify(data);
    const { ciphertext, iv } = await encryptData(plaintext, key);
    await set(VAULT_KEY, JSON.stringify({ ciphertext, iv }), store);
}
