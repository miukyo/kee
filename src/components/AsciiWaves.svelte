<script lang="ts">
    const CHARS = "!<>-_\\/[]{}|;:,.#$%&@+*=?";

    interface Props {
        duration?: number;
    }

    let { duration = 2000 }: Props = $props();
    let visible = $state(true);
    let fading = $state(false);
    let canvas = $state<HTMLCanvasElement>();

    $effect(() => {
        const cvs = canvas;
        if (!cvs) return;
        const ctx = cvs.getContext("2d")!;
        let killed = false;

        const dpr = devicePixelRatio || 1;

        const resize = () => {
            cvs.width = innerWidth * dpr;
            cvs.height = innerHeight * dpr;
            cvs.style.width = innerWidth + "px";
            cvs.style.height = innerHeight + "px";
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        resize();
        addEventListener("resize", resize);

        const FW = 10;
        const FH = 14;

        ctx.font = '16px "IBM Plex Mono", monospace';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const start = performance.now();

        const frame = (now: number) => {
            if (killed) return;
            const t = Math.min((now - start) / duration, 1);
            
            // Exponential ease-out
            const p = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);

            const W = innerWidth;
            const H = innerHeight + 200;
            ctx.clearRect(0, 0, W, H);

            const C = Math.ceil(W / FW);
            const R = Math.ceil(H / FH);
            
            // --- DYNAMIC U-CURVE DEPTH BASED ON WIDTH ---
            // Adjust the multiplier (0.045) or the base minimum (25) to tune the steepness.
            // Using a linear width factor ensure a massive plunge on ultra-wide viewports.
            const maxDrop = Math.max(5, Math.floor(W * 0.01)); 
            
            const revealY = p * (R + maxDrop) - maxDrop;
            const tailHeight = 10.0; 

            for (let r = 0; r < R; r++) {
                for (let c = 0; c < C; c++) {
                    const x = c * FW + FW / 2;
                    const y = r * FH + FH / 2;

                    const hash = Math.sin(c * 12.9898 + r * 78.233) * 43758.5453;
                    const pseudoRandom = hash - Math.floor(hash);

                    const normC = (c / C) * 2 - 1;
                    const uProfile = 1 - (normC * normC); 

                    const waveFreq = Math.max(3, (W / 300));
                    const waveSpeed = 6;
                    
                    let waveY = revealY 
                        + (uProfile * maxDrop) 
                        + Math.sin((c / C) * Math.PI * waveFreq + p * waveSpeed) * 2.5 * uProfile;

                    // --- Edge Bleed Logic ---
                    const distanceToWave = r - waveY;
                    
                    if (distanceToWave >= -4 && distanceToWave <= 4) {
                        const bleedIntensity = Math.max(0, 1 - p);
                        const bleedAmount = (pseudoRandom - 0.5) * 4 * bleedIntensity; 
                        waveY += bleedAmount;
                    }
                    // ------------------------

                    const dy = r - waveY;

                    if (dy < -tailHeight) continue;

                    ctx.fillStyle = "#000";
                    ctx.fillRect(c * FW, r * FH, FW, FH);

                    const intensity = Math.max(0, 1 - Math.abs(dy) / tailHeight);
                    const ci = Math.floor(pseudoRandom * CHARS.length);

                    ctx.globalAlpha = 0.2 + intensity * 0.7;
                    ctx.fillStyle = "#fff";
                    ctx.fillText(CHARS[ci], x, y);
                }
            }
            ctx.globalAlpha = 1;

            if (p < 1) {
                requestAnimationFrame(frame);
            } else {
                fading = true;
                setTimeout(() => {
                    visible = false;
                }, 600);
            }
        };

        requestAnimationFrame(frame);
        return () => {
            killed = true;
            removeEventListener("resize", resize);
        };
    });
</script>

{#if visible}
    <div class="overlay" class:fading>
        <canvas bind:this={canvas}></canvas>
    </div>
{/if}

<style>
    .overlay {
        position: fixed;
        inset: 0;
        z-index: 9999;
        pointer-events: none;
        transition: opacity 600ms ease;
    }
    .overlay.fading {
        opacity: 0;
    }
    canvas {
        display: block;
        width: 100%;
        height: 100%;
    }
</style>