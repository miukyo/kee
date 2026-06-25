import { argon2id } from 'hash-wasm';
import { generate } from 'otplib';

let masterKey: CryptoKey | null = null;

export function setMasterKey(key: CryptoKey) {
    masterKey = key;
}

export function clearMasterKey() {
    masterKey = null;
}

export function getMasterKey(): CryptoKey | null {
    return masterKey;
}

export async function deriveKey(password: string, saltString: string): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const salt = encoder.encode(saltString);
    const hashHex = await argon2id({
        password: password,
        salt: salt,
        iterations: 3,
        memorySize: 65536,
        parallelism: 4,
        hashLength: 32,
        outputType: 'binary'
    });
    const cleanKeyBytes = new Uint8Array(hashHex).slice().buffer;
    return await window.crypto.subtle.importKey(
        'raw',
        cleanKeyBytes,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
    );
}

export async function encryptData(plaintext: string, key: CryptoKey): Promise<{ ciphertext: string; iv: string }> {
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(plaintext);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encryptedBuffer = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        encodedData
    );
    return {
        ciphertext: btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer))),
        iv: btoa(String.fromCharCode(...iv))
    };
}

export async function decryptData(ciphertextBase64: string, ivBase64: string, key: CryptoKey): Promise<string> {
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

export async function generateTOTP(base32Secret: string): Promise<string> {
    try {
        return await generate({secret: base32Secret});
    } catch (error) {
        console.error("Invalid TOTP Secret Key structure", error);
        return "000000";
    }
}

export function getTOTPTimeRemaining(): number {
    const step = 30;
    const now = Math.floor(Date.now() / 1000);
    return step - (now % step);
}
