export function allowOnlyNumbers(event: KeyboardEvent) {
    const allowedKeys = [
        "Backspace",
        "Delete",
        "ArrowLeft",
        "ArrowRight",
        "Tab",
    ];

    if (allowedKeys.includes(event.key)) {
        return;
    }

    if (!/^[0-9]$/.test(event.key)) {
        event.preventDefault();
    }
}
