import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { MeshGradientBackground } from "@/components/shared/MeshGradientBackground";
import { useAudioReactiveStore } from "@/stores/useAudioReactiveStore";
import { useAudioShaderSettingsStore } from "@/stores/useAudioShaderSettingsStore";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";

interface MeshGradientOilBackgroundProps {
  coverUrl?: string | null;
  isActive?: boolean;
  className?: string;
}

function fract(n: number): number {
  return n - Math.floor(n);
}

/** Deterministic 0–1 from index + optional time drift (small). */
function hash01(i: number, drift: number): number {
  return fract(Math.sin(i * 127.1 + drift * 0.37 + 311.7) * 43758.5453123);
}

/**
 * Same animated mesh gradient as {@link MeshGradientBackground}, with a canvas overlay of
 * soft impasto-like strokes (multiply + screen) for an oil-painting feel.
 */
export function MeshGradientOilBackground({
  coverUrl = null,
  isActive = true,
  className = "",
}: MeshGradientOilBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const musicShadersOn = useDisplaySettingsStore((s) => s.musicShaderEffectsEnabled ?? true);

  useEffect(() => {
    if (!isActive || !musicShadersOn) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    let raf = 0;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const resize = () => {
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(parent);
    resize();

    const STROKES = 52;

    const draw = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        raf = requestAnimationFrame(draw);
        return;
      }

      const w = parent.clientWidth;
      const h = parent.clientHeight;
      const motion = useAudioShaderSettingsStore.getState().visualMotion;
      const { energy: e0, bass: b0, beat: bt0 } = useAudioReactiveStore.getState();
      const energy = Math.min(1, e0 * motion);
      const bass = Math.min(1, b0 * motion);
      const beat = Math.min(1, bt0 * motion);
      const pulse = 0.65 + energy * 0.28 + bass * 0.12 + beat * 0.18;

      const t = performance.now() * 0.00011;
      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (let i = 0; i < STROKES; i++) {
        const drift = t * (0.8 + (i % 5) * 0.07);
        const x0 = hash01(i * 17 + 3, drift) * w;
        const y0 = hash01(i * 31 + 7, drift) * h;
        const x1 = hash01(i * 23 + 11, drift + 2.1) * w;
        const y1 = hash01(i * 29 + 13, drift + 1.7) * h;
        const mx = (x0 + x1) / 2 + (hash01(i * 41, drift) - 0.5) * w * 0.42;
        const my = (y0 + y1) / 2 + (hash01(i * 43, drift + 0.5) - 0.5) * h * 0.42;
        const cx = mx + Math.sin(drift * 3 + i * 0.31) * w * 0.04 * pulse;
        const cy = my + Math.cos(drift * 2.4 + i * 0.27) * h * 0.035 * pulse;

        const dark = i % 3 !== 1;
        ctx.globalCompositeOperation = dark ? "multiply" : "screen";
        const baseA = dark ? 0.055 : 0.042;
        const a = (baseA + energy * 0.035) * (0.92 + beat * 0.12);
        ctx.strokeStyle = dark ? `rgba(22,18,14,${a})` : `rgba(255,252,245,${a * 0.95})`;
        ctx.lineWidth = 5 + hash01(i * 59, drift) * 36 * (0.85 + bass * 0.2);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(cx, cy, x1, y1);
        ctx.stroke();
      }

      ctx.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [isActive, musicShadersOn]);

  if (!isActive) return null;
  if (!musicShadersOn) {
    return (
      <MeshGradientBackground coverUrl={coverUrl} isActive={isActive} className={className} />
    );
  }

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{ width: "100%", height: "100%" }}
    >
      <MeshGradientBackground
        coverUrl={coverUrl}
        isActive={isActive}
        className="absolute inset-0 h-full w-full"
      />
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 z-[1] h-full w-full mix-blend-soft-light opacity-[0.9]"
        aria-hidden
      />
    </div>
  );
}
