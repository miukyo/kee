import { deriveKey, encryptData, decryptData } from "./crypto";
import { BACKUP_SALT } from "./config";
import type { TwoFactorEntry, PasswordEntry } from "./types";

export interface BackupPayload {
    version: 1;
    tfa: TwoFactorEntry[];
    passwords: PasswordEntry[];
}

export function buildBackupPayload(
    tfa: TwoFactorEntry[],
    passwords: PasswordEntry[],
): string {
    const payload: BackupPayload = {
        version: 1,
        tfa,
        passwords,
    };
    return JSON.stringify(payload);
}

export function parseBackupPayload(json: string): BackupPayload {
    const payload = JSON.parse(json) as BackupPayload;
    if (payload.version !== 1) throw new Error("Unknown backup version");
    return payload;
}

export async function encryptBackup(
    plaintext: string,
    sub: string,
): Promise<string> {
    const key = await deriveKey(sub, BACKUP_SALT);
    const { ciphertext, iv } = await encryptData(plaintext, key);
    return JSON.stringify({ ciphertext, iv });
}

export async function decryptBackup(
    encrypted: string,
    sub: string,
): Promise<string> {
    const { ciphertext, iv } = JSON.parse(encrypted);
    const key = await deriveKey(sub, BACKUP_SALT);
    return decryptData(ciphertext, iv, key);
}
