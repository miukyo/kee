let qrScanner: any = null;

export function getQrScanner() {
    return qrScanner;
}

export async function startQrScannerFn(
    onDecoded: (label: string, secret: string) => void,
): Promise<void> {
    const { Html5Qrcode } = await import("html5-qrcode");

    try {
        const cameras = await Html5Qrcode.getCameras();
        if (!cameras || cameras.length === 0) {
            alert("No cameras found on this device.");
            return;
        }

        await new Promise((r) => setTimeout(r, 0));

        const video = document.getElementById("qr-video") as HTMLVideoElement;
        if (!video) return;

        qrScanner = new Html5Qrcode("qr-video");
        await qrScanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            (decodedText: string) => {
                const parsed = parseOtpAuthUri(decodedText);
                if (parsed) {
                    onDecoded(parsed.label, parsed.secret);
                    stopQrScannerFn();
                }
            },
            () => {},
        );
    } catch (e) {
        console.error("Camera access denied or scanner error:", e);
        alert("Camera access is required to scan QR codes.");
    }
}

export async function stopQrScannerFn(): Promise<void> {
    if (qrScanner) {
        try {
            await qrScanner.stop();
        } catch {
            /* ignore */
        }
        qrScanner = null;
    }
}

function parseOtpAuthUri(uri: string): { label: string; secret: string } | null {
    try {
        const url = new URL(uri);
        if (url.protocol !== "otpauth:" || url.hostname !== "totp") return null;
        const secret = url.searchParams.get("secret");
        if (!secret) return null;
        const path = url.pathname.replace(/^\//, "");
        let label = path;
        if (path.includes(":")) label = path.split(":")[1];
        return { label: decodeURIComponent(label), secret };
    } catch {
        return null;
    }
}
