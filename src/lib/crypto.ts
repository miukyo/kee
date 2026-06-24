import { argon2id } from 'hash-wasm';
import { generate } from 'otplib';
// 1. Derive a 256-bit key from an identity input using Argon2id
export async function deriveKey(password: string, saltString: string): Promise<CryptoKey> {
    // Convert our salt string into a Uint8Array
    const encoder = new TextEncoder();
    const salt = encoder.encode(saltString);

    // Run Argon2id via WebAssembly
    const hashHex = await argon2id({
        password: password,
        salt: salt,
        iterations: 3,        // Adjust based on your target device performance
        memorySize: 65536,    // 64 MB
        parallelism: 4,
        hashLength: 32,       // 32 bytes = 256 bits
        outputType: 'binary'  // Returns Uint8Array
    });
    const cleanKeyBytes = new Uint8Array(hashHex).slice().buffer;
    // Import the raw bytes into the browser's native Web Crypto Engine
    return await window.crypto.subtle.importKey(
        'raw',
        cleanKeyBytes,
        { name: 'AES-GCM' },
        false, // The key is non-extractable out of the browser memory for security
        ['encrypt', 'decrypt']
    );
}

// 2. Encrypt plaintext data using the derived CryptoKey
export async function encryptData(plaintext: string, key: CryptoKey): Promise<{ ciphertext: string; iv: string }> {
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(plaintext);

    // Initialization Vector (IV) must be completely unique for every single encryption
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const encryptedBuffer = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        encodedData
    );

    // Convert binary data to clean Base64 strings for storage or transfer
    return {
        ciphertext: btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer))),
        iv: btoa(String.fromCharCode(...iv))
    };
}

// 3. Decrypt ciphertext using the derived CryptoKey
export async function decryptData(ciphertextBase64: string, ivBase64: string, key: CryptoKey): Promise<string> {
    // Decode Base64 strings back to Uint8Arrays
    const ciphertext = Uint8Array.from(atob(ciphertextBase64), c => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));

    const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        ciphertext
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
}

/**
 * Generates a current 6-digit 2FA token from a plaintext base32 seed string.
 * @param base32Secret The raw decrypted seed (e.g., "JBSWY3DPEHPK3PXP")
 */
export async function generateTOTP(base32Secret: string): Promise<string> {
    try {
        // Enforce fallback options if configuring customization rules later
        return await generate({secret: base32Secret});
    } catch (error) {
        console.error("Invalid TOTP Secret Key structure", error);
        return "000000";
    }
}

/**
 * Returns how many seconds remain before the current 30-second token expires.
 * Useful for updating UI progress bars dynamically.
 */
export function getTOTPTimeRemaining(): number {
    const step = 30; // Standard TOTP window
    const now = Math.floor(Date.now() / 1000);
    return step - (now % step);
}