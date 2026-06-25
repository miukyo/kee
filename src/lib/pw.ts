import type { PasswordEntry } from "./types";

export const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const LOWER = "abcdefghijklmnopqrstuvwxyz";
export const DIGITS = "0123456789";
export const SYMBOLS = "!@#$%^&*()_+-=[]{}|;:,.<>?";
export const AMB = "0O1lI|";

export function generatePassword(
    len: number,
    upper: boolean,
    lower: boolean,
    digits: boolean,
    symbols: boolean,
    amb: boolean,
): string {
    let pool = "";
    if (upper) pool += UPPER;
    if (lower) pool += LOWER;
    if (digits) pool += DIGITS;
    if (symbols) pool += SYMBOLS;
    if (!pool) return "";
    if (amb) for (const c of AMB) pool = pool.replaceAll(c, "");
    if (!pool) return "";
    const buf = new Uint32Array(len);
    crypto.getRandomValues(buf);
    let out = "";
    for (let i = 0; i < len; i++) out += pool[buf[i] % pool.length];
    return out;
}

export async function addPwFn(
    label: string,
    value: string,
    entries: PasswordEntry[],
): Promise<PasswordEntry[]> {
    const entry: PasswordEntry = {
        id: crypto.randomUUID(),
        label,
        value,
        createdAt: Date.now(),
    };
    return [...entries, entry];
}

export async function deletePwFn(
    id: string,
    entries: PasswordEntry[],
): Promise<PasswordEntry[]> {
    return entries.filter((e) => e.id !== id);
}
