import { createStore, get, set, del, entries, clear } from "idb-keyval";
import type { TwoFactorEntry, PasswordEntry } from "./types";

const tfaStore = createStore("kee-2fa", "store");
const pwStore = createStore("kee-passwords", "store");

export async function loadTfa(): Promise<TwoFactorEntry[]> {
    const all = await entries<string, TwoFactorEntry>(tfaStore);
    return all.map(([, v]) => v).sort((a, b) => a.createdAt - b.createdAt);
}

export async function saveTfa(e: TwoFactorEntry): Promise<void> {
    await set(e.id, e, tfaStore);
}

export async function removeTfa(id: string): Promise<void> {
    await del(id, tfaStore);
}

export async function loadPasswords(): Promise<PasswordEntry[]> {
    const all = await entries<string, PasswordEntry>(pwStore);
    return all.map(([, v]) => v).sort((a, b) => a.createdAt - b.createdAt);
}

export async function savePassword(e: PasswordEntry): Promise<void> {
    await set(e.id, e, pwStore);
}

export async function removePassword(id: string): Promise<void> {
    await del(id, pwStore);
}

export async function saveAllTfa(entries: TwoFactorEntry[]): Promise<void> {
    await clear(tfaStore);
    for (const e of entries) {
        await set(e.id, e, tfaStore);
    }
}

export async function saveAllPasswords(entries: PasswordEntry[]): Promise<void> {
    await clear(pwStore);
    for (const e of entries) {
        await set(e.id, e, pwStore);
    }
}
