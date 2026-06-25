import type { TwoFactorEntry } from "./types";
import { generateTOTP } from "./crypto";

export async function tickFn(
    tfaEntries: TwoFactorEntry[],
    lastWindow: number,
    tokens: Record<string, string>,
): Promise<{
    now: number;
    lastWindow: number;
    tokens: Record<string, string>;
}> {
    const now = Date.now();
    const w = Math.floor(now / 30000);
    if (w === lastWindow) return { now, lastWindow, tokens };

    const newTokens: Record<string, string> = { ...tokens };
    for (const e of tfaEntries) {
        if (e.secret) newTokens[e.id] = await generateTOTP(e.secret);
    }
    return { now, lastWindow: w, tokens: newTokens };
}
