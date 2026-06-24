<script lang="ts">
    const CHARS = "!<>-_\\/[]{}|;:,.#$%&@+*=?";

    let { text, class: className = "" }: { text: string; class?: string } = $props();

    let display = $state("");
    let id: ReturnType<typeof setInterval> | undefined;
    let frame = 0;

    $effect(() => {
        const target = text;
        if (id) clearInterval(id);
        frame = 0;

        display = target.split("").map(() => CHARS[Math.floor(Math.random() * CHARS.length)]).join("");

        const intervalId = setInterval(() => {
            frame++;
            const p = frame / 30;
            let out = "";
            for (let i = 0; i < target.length; i++) {
                if (p > i / target.length) {
                    out += target[i];
                } else {
                    out += CHARS[Math.floor(Math.random() * CHARS.length)];
                }
            }
            display = out;
            if (frame >= 30) {
                clearInterval(intervalId);
                id = undefined;
                display = target;
            }
        }, 40);
        id = intervalId;

        return () => clearInterval(intervalId);
    });
</script>

<span class={className}>{display}</span>