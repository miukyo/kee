export interface TwoFactorEntry {
    id: string;
    label: string;
    secret: string;
    createdAt: number;
}

export interface PasswordEntry {
    id: string;
    label: string;
    value: string;
    createdAt: number;
}
