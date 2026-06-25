import type { TwoFactorEntry } from "./types";
import { generateTOTP } from "./crypto";
import { saveTfa, removeTfa } from "./db";

export async function addTfaFn(
    label: string,
    secret: string,
    entries: TwoFactorEntry[],
    tokens: Record<string, string>,
): Promise<{ entries: TwoFactorEntry[]; tokens: Record<string, string> }> {
    const entry: TwoFactorEntry = {
        id: crypto.randomUUID(),
        label,
        secret,
        createdAt: Date.now(),
    };
    await saveTfa(entry);
    const token = await generateTOTP(entry.secret);
    return {
        entries: [...entries, entry],
        tokens: { ...tokens, [entry.id]: token },
    };
}

export async function deleteTfaFn(
    id: string,
    entries: TwoFactorEntry[],
    tokens: Record<string, string>,
): Promise<{ entries: TwoFactorEntry[]; tokens: Record<string, string> }> {
    await removeTfa(id);
    const { [id]: _, ...rest } = tokens;
    return { entries: entries.filter((e) => e.id !== id), tokens: rest };
}
