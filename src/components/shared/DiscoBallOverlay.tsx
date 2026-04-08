import { useEffect, useRef, useState } from "react";
import { useAudioReactiveStore } from "@/stores/useAudioReactiveStore";
import { useAudioShaderSettingsStore } from "@/stores/useAudioShaderSettingsStore";

/** Target cell size (px); lower = tiles and glints packed closer (was 14). */
const TARGET_CELL_PX = 9;
/** How much of each cell the shine fills; higher = glints nearly touch neighbors. */
const GLINT_SIZE_IN_CELL = 0.58;
/** Avoid huge cell counts on 4K / ultrawide (keeps rAF cheap). */
const MAX_DISCO_COLS = 120;
const MAX_DISCO_ROWS = 90;
/** Scroll only the facet grid lines (px / ms); tile glints stay locked to cells. */
const GRID_SCROLL_VX = 0.026;
const GRID_SCROLL_VY = 0.019;

function posMod(a: number, m: number): number {
  return ((a % m) + m) % m;
}

/**
 * Mirror-ball style facet grid: scrolling diagonal glints plus random tile sparkles.
 * Composites over the neural shader (pointer-events: none).
 */
export function DiscoBallOverlay() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;

    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let phases: number[] = [];
    let sparkles: number[] = [];
    let lastCols = 0;
    let lastRows = 0;
    let lastNow = performance.now();
    let raf = 0;

    const dpr = () => Math.min(2, window.devicePixelRatio || 1);

    const resize = () => {
      const r = dpr();
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w <= 0 || h <= 0) return;
      canvas.width = Math.floor(w * r);
      canvas.height = Math.floor(h * r);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(r, 0, 0, r, 0, 0);
    };

    const syncGrid = (cols: number, rows: number) => {
      if (cols === lastCols && rows === lastRows) return;
      lastCols = cols;
      lastRows = rows;
      const n = cols * rows;
      phases = Array.from({ length: n }, () => Math.random() * Math.PI * 2);
      sparkles = new Array(n).fill(0);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();

    const loop = (now: number) => {
      const dt = Math.min(2.8, (now - lastNow) / 16.67);
      lastNow = now;

      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w <= 2 || h <= 2) {
        raf = requestAnimationFrame(loop);
        return;
      }

      const cols = Math.min(
        MAX_DISCO_COLS,
        Math.max(10, Math.ceil(w / TARGET_CELL_PX)),
      );
      const rows = Math.min(
        MAX_DISCO_ROWS,
        Math.max(8, Math.ceil(h / TARGET_CELL_PX)),
      );
      syncGrid(cols, rows);

      const cw = w / cols;
      const ch = h / rows;

      const motion = useAudioShaderSettingsStore.getState().visualMotion;
      const beat = Math.min(1, useAudioReactiveStore.getState().beat * motion);
      const spawnP = (0.038 + beat * 0.085) * dt;

      const scrollXPx = now * GRID_SCROLL_VX;
      const scrollYPx = now * GRID_SCROLL_VY;
      const offX = posMod(scrollXPx, cw);
      const offY = posMod(scrollYPx, ch);

      const scroll = now * 0.00036;
      const scroll2 = now * -0.00027;

      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const idx = j * cols + i;
          const phase = phases[idx] ?? 0;
          const sPrev = sparkles[idx] ?? 0;

          const w1 = Math.sin(scroll * 2.35 + i * 0.6 + j * 0.46 + phase);
          const w2 = Math.sin(scroll2 * 1.95 + i * 0.36 - j * 0.68 + phase * 1.63);
          /** Slightly lower exponents = broader highlights; higher weights = brighter peaks. */
          const band =
            Math.pow(Math.max(0, w1), 11) * 1.22 + Math.pow(Math.max(0, w2), 7.5) * 0.78;

          const intensity = Math.min(1, band + sPrev);
          sparkles[idx] = sPrev * (0.922 + (1 - beat) * 0.022);

          if (intensity < 0.007) continue;

          const x = i * cw;
          const y = j * ch;
          const gw = Math.max(0.75, cw * GLINT_SIZE_IN_CELL);
          const gh = Math.max(0.75, ch * GLINT_SIZE_IN_CELL);
          const ox = x + (cw - gw) * 0.5;
          const oy = y + (ch - gh) * 0.5;
          const g = ctx.createLinearGradient(ox, oy, ox + gw, oy + gh);
          const a1 = intensity * 0.34;
          const a2 = intensity * 0.48;
          const a3 = intensity * 0.2;
          g.addColorStop(0, `rgba(255,248,235,${a1})`);
          g.addColorStop(0.42, `rgba(255,255,255,${a2})`);
          g.addColorStop(1, `rgba(225,240,255,${a3})`);
          ctx.fillStyle = g;
          ctx.fillRect(ox, oy, gw + 0.35, gh + 0.35);
        }
      }

      ctx.globalCompositeOperation = "source-over";

      ctx.strokeStyle = "rgba(255,255,255,0.078)";
      ctx.lineWidth = 1;
      for (let k = -1; k <= rows + 2; k++) {
        const y = k * ch - offY;
        if (y < -2 || y > h + 2) continue;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      for (let k = -1; k <= cols + 2; k++) {
        const x = k * cw - offX;
        if (x < -2 || x > w + 2) continue;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }

      let bursts = 0;
      if (Math.random() < spawnP) bursts += 1;
      if (Math.random() < spawnP * 0.5) bursts += 1;
      if (beat > 0.48 && Math.random() < spawnP * 0.75) bursts += 1;
      const total = cols * rows;
      for (let k = 0; k < bursts; k++) {
        const idx = Math.floor(Math.random() * total);
        sparkles[idx] = Math.min(1, (sparkles[idx] ?? 0) + 0.45 + Math.random() * 0.55);
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [reducedMotion]);

  if (reducedMotion) return null;

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 z-[1] mix-blend-soft-light opacity-[0.98]"
      aria-hidden
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
