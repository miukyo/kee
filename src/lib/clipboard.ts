let clearTimer: ReturnType<typeof setTimeout> | undefined;

export async function copyToClipboard(
    value: string,
): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(value);
        if (clearTimer) clearTimeout(clearTimer);
        clearTimer = setTimeout(() => {
            navigator.clipboard.writeText("").catch(() => {});
            clearTimer = undefined;
        }, 30000);
        return true;
    } catch {
        return false;
    }
}
