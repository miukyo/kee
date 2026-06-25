export function remaining(now: number): number {
    return 30 - (Math.floor(now / 1000) % 30);
}

export function progress(now: number): number {
    return ((Math.floor(now / 1000) % 30) / 30) * 100;
}
