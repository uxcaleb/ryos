import { useEffect, useRef } from "react";
import { useAudioReactiveStore } from "@/stores/useAudioReactiveStore";
import { useAudioShaderSettingsStore } from "@/stores/useAudioShaderSettingsStore";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { cn } from "@/lib/utils";

const RING_BARS = 96;
/** Samples along each radial ray when finding where the stroked outline meets the ray (higher = tighter hug, more CPU when cache rebuilds). */
const OUTLINE_RAY_SAMPLES = 208;
/** Reference radius used for layout (fraction of min canvas dimension). */
const INNER_FRACTION = 0.3;
/** Center logo is scaled to this fraction of the ring reference radius (smaller = tinier graphic). */
const LOGO_MAX_R_FACTOR = 0.49;
/** Fallback bar start radius when bbox is unavailable (fraction of ring ref). */
const FALLBACK_BAR_INNER_FACTOR = 0.88;
/**
 * Mix palette toward white on canvas — keep low so bars/logo stay close to cover-derived hexes
 * from `buildSvgRingDrawPalette` (still readable on wallpaper).
 */
const FOREGROUND_BRIGHTEN = 0.08;
/**
 * Colored glass over the wallpaper: picks the **brightest** palette swatch (front / mid / glow).
 * High alpha so the desktop wallpaper reads strongly through that hue.
 */
const WALLPAPER_OVERLAY_ALPHA = 0.7;
/** Tiny lift toward white so the wash still feels “bright” without washing out the hue. */
const WALLPAPER_OVERLAY_LIGHTEN = 0.08;
/** Soft multiply on tint + wallpaper before bars (keeps ring/readability, slightly deeper field). */
const WALLPAPER_BASE_DIM_ALPHA = 0.065;
/**
 * Gap between the stroked SVG outline and where each bar starts (fraction of min canvas side).
 * Outline radii are computed on the stroke; this adds visible padding so bars don’t sit on the circle.
 */
const BAR_GAP_FROM_OUTLINE_FRAC = 0.003;
/** Soft glow behind bar strokes (fraction of min dimension, clamped). Scaled down — neon pass carries most glow. */
const BAR_SHADOW_BLUR_FRAC = 0.022;
/** Scales combined bar wobble (0–1); lower = calmer motion vs. same layout size. */
const BAR_AUDIO_REACTIVITY = 0.9;
/** EMA blend per frame toward raw analyzer values — lower = silkier, less jitter. */
const AUDIO_INPUT_SMOOTH = 0.16;
/** EMA on each bar’s normalized amplitude after wobble — smooths length changes. */
const BAR_AMP_SMOOTH = 0.32;
/** Max bar length as fraction of min dimension (base length added separately). */
const BAR_LENGTH_MAX_FRAC = 0.225;
/** Center logo: base stroke width in path user space (`/ scale`); lower = thinner stroke. */
const LOGO_STROKE_BASE = 2.88;
/** Wide bloom pass before the crisp logo stroke (multiplier on base line width). */
const LOGO_BLOOM_WIDTH_MULT = 2.75;
const LOGO_BLOOM_ALPHA = 0.42;
/** Logo shadow blur (fraction of min dimension) + beat bump. */
const LOGO_SHADOW_BLUR_FRAC = 0.026;
const LOGO_SHADOW_BLUR_BEAT_FRAC = 0.038;
/** Logo path fill tint alpha (stroke uses gradient). */
const LOGO_FILL_ALPHA = 0.2;
/** White “tube” overlay on the stroked logo (`screen` + soft shadow). */
const LOGO_NEON_STROKE_ALPHA = 0.44;
const LOGO_NEON_SHADOW_ALPHA = 0.62;
const LOGO_NEON_BLUR_FRAC = 0.017;
const LOGO_NEON_LINE_WIDTH_MULT = 0.86;
/** Same neon tube treatment on radial bars (`screen` + white shadow). */
const BAR_NEON_STROKE_ALPHA = 0.4;
const BAR_NEON_SHADOW_ALPHA = 0.55;
const BAR_NEON_BLUR_FRAC = 0.015;
const BAR_NEON_LINE_WIDTH_MULT = 0.82;
/** When inactive, dim the canvas slightly (0 = no dim). */
const INACTIVE_DIM_ALPHA = 0.05;
/**
 * Post-render wash after bars + logo: soft-light preserves hue while lifting luminance;
 * then a whisper of `color-dodge` adds specular energy (minimal, Apple-like — keep alphas low).
 */
const BRIGHTEN_OVERLAY_WHITE_ALPHA = 0.26;
const BRIGHTEN_OVERLAY_TINT_ALPHA = 0.1;
/** `color-dodge` is strong — tiny alphas read as glow, not blown highlights. */
const COLOR_DODGE_OVERLAY_WHITE_ALPHA = 0.038;
const COLOR_DODGE_OVERLAY_TINT_ALPHA = 0.028;

/** Bump when outline math changes so cached radii are recomputed. */
const OUTLINE_RADII_CACHE_VERSION = 3;
/**
 * Cap canvas backing-store resolution. Full-screen 2× DPR = 4× pixels per frame (heavy for compositing).
 */
const VISUALIZER_MAX_DPR = 1.5;

/** Union bbox of path `d` strings in SVG user units (same as `unionPathBounds`). */
interface PathBoundsBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Distance from origin to axis-aligned ellipse x²/a² + y²/b² = 1 along ray angle θ (from +x axis).
 * Used only when outline ray-casting finds no stroke hit for a direction.
 */
function ellipseRadiusAtAngle(theta: number, a: number, b: number): number {
  const aa = Math.max(a, 1e-9);
  const bb = Math.max(b, 1e-9);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return 1 / Math.sqrt((c * c) / (aa * aa) + (s * s) / (bb * bb));
}

function applyLogoTransform(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  bb: PathBoundsBox | null,
  viewBox: [number, number, number, number],
  logoMaxR: number,
): void {
  ctx.translate(cx, cy);
  const [vbx, vby, vbw, vbh] = viewBox;
  if (bb && bb.maxX > bb.minX + 1e-9) {
    const bw = bb.maxX - bb.minX;
    const bh = bb.maxY - bb.minY;
    const denom = Math.max(bw, bh, 1e-6);
    const scale = (logoMaxR * 2) / denom;
    ctx.scale(scale, scale);
    ctx.translate(-(bb.minX + bb.maxX) / 2, -(bb.minY + bb.maxY) / 2);
  } else {
    const denom = Math.max(vbw, vbh, 1e-6);
    const scale = logoMaxR / denom;
    ctx.scale(scale, scale);
    ctx.translate(-vbx - vbw / 2, -vby - vbh / 2);
  }
}

function logoStrokeLineWidth(ctx: CanvasRenderingContext2D): number {
  return Math.max(1.2, 2 / (ctx.getTransform().a || 1));
}

/**
 * Stroke hit-test along a ray. `isPointInStroke` applies `inverse(CTM)` internally (per spec), so pass
 * **device/canvas coordinates in the same space as `cx, cy`** — do not pre-multiply by `inverse(CTM)`
 * or hits (and outline radii) become wrong.
 */
function isPointOnAnyStroke(
  ctx: CanvasRenderingContext2D,
  pathDs: string[],
  x: number,
  y: number,
): boolean {
  for (const d of pathDs) {
    try {
      const p = new Path2D(d);
      if (ctx.isPointInStroke(p, x, y)) return true;
    } catch {
      /* skip invalid */
    }
  }
  return false;
}

/**
 * Outer-edge distance along one ray: coarse-scan for stroke hits, take the **first** contiguous run
 * from the center (main logo shell). Ignores later hits from extra path fragments / ornaments that
 * sit farther out — those were causing a handful of bars to jump to huge radii.
 */
function outerStrokeMaxTAlongRay(
  ctx: CanvasRenderingContext2D,
  pathDs: string[],
  cx: number,
  cy: number,
  ux: number,
  uy: number,
  tSearchMax: number,
): number | null {
  const isHit = (t: number) => {
    const u = Math.max(0, Math.min(tSearchMax, t));
    const x = cx + u * ux;
    const y = cy + u * uy;
    return isPointOnAnyStroke(ctx, pathDs, x, y);
  };

  const n = OUTLINE_RAY_SAMPLES;
  let runStart = -1;
  let firstSeg: [number, number] | null = null;
  for (let s = 0; s <= n; s++) {
    const hit = isHit((s / n) * tSearchMax);
    if (hit && runStart < 0) runStart = s;
    if (!hit && runStart >= 0) {
      firstSeg = [runStart, s - 1];
      break;
    }
  }
  if (firstSeg == null && runStart >= 0) firstSeg = [runStart, n];
  if (!firstSeg) return null;

  const [a, b] = firstSeg;
  const tLo = (a / n) * tSearchMax;
  const tHi = b >= n ? tSearchMax : Math.min(tSearchMax, ((b + 1) / n) * tSearchMax);
  if (!isHit(tLo)) return null;
  if (isHit(tHi)) return tSearchMax;

  let lo = tLo;
  let hi = tHi;
  for (let k = 0; k < 52; k++) {
    const mid = (lo + hi) / 2;
    if (isHit(mid)) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-4) break;
  }
  return lo;
}

/** Light circular smoothing to remove one-off spikes when fallback ellipse differs from neighbors. */
function smoothRingRadiiCircular(r: Float64Array): void {
  const n = r.length;
  const tmp = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = r[(i - 1 + n) % n]!;
    const b = r[i]!;
    const c = r[(i + 1) % n]!;
    const avg = 0.25 * a + 0.5 * b + 0.25 * c;
    const spread = Math.max(Math.abs(a - c), 1e-6);
    if (Math.abs(b - avg) > spread * 3.4) tmp[i] = avg;
    else tmp[i] = b;
  }
  for (let i = 0; i < n; i++) r[i] = tmp[i]!;
}

/** Pulls a few runaway samples back toward the local median (guards bad ray hits / NaN). */
function snapRingRadiiOutliers(r: Float64Array, aPix: number, bPix: number): void {
  const n = r.length;
  const maxR = Math.hypot(aPix, bPix) * 1.22;
  const tmp = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const v = [r[(i + n - 2) % n]!, r[(i + n - 1) % n]!, r[i]!, r[(i + 1) % n]!, r[(i + 2) % n]!].sort(
      (a, b) => a - b,
    );
    const med = v[2]!;
    let x = r[i]!;
    if (!Number.isFinite(x) || x <= 0) x = med;
    x = Math.min(x, maxR);
    const rel = Math.abs(x - med) / Math.max(med, 1e-6);
    tmp[i] = rel > 0.2 ? 0.42 * x + 0.58 * med : x;
  }
  for (let i = 0; i < n; i++) r[i] = tmp[i]!;
}

/**
 * For each bar direction, distance from (cx,cy) to the outer stroked contour along that ray.
 * Falls back per bar to bbox ellipse when no hit.
 */
function computeBarStartRadiiAlongOutline(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  bb: PathBoundsBox | null,
  viewBox: [number, number, number, number],
  logoMaxR: number,
  pathDs: string[],
  tSearchMax: number,
  aPix: number,
  bPix: number,
): Float64Array {
  const radii = new Float64Array(RING_BARS);

  ctx.save();
  applyLogoTransform(ctx, cx, cy, bb, viewBox, logoMaxR);
  /** Slightly wider than draw stroke so ray casts reliably hit the outline. */
  ctx.lineWidth = logoStrokeLineWidth(ctx) * 1.22;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  for (let i = 0; i < RING_BARS; i++) {
    const ang = (i / RING_BARS) * Math.PI * 2 - Math.PI / 2;
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    const ell = ellipseRadiusAtAngle(ang, aPix, bPix);
    /** Hard cap: multi-path SVGs can register stray strokes far outside the main mark. */
    const shellCap = ell * 1.1 + Math.max(aPix, bPix) * 0.04;
    const best = outerStrokeMaxTAlongRay(ctx, pathDs, cx, cy, ux, uy, Math.min(tSearchMax, shellCap * 1.25));
    let r = best != null ? Math.min(best, shellCap) : ell;
    if (r < ell * 0.82) r = ell;
    radii[i] = r;
  }

  smoothRingRadiiCircular(radii);
  snapRingRadiiOutliers(radii, aPix, bPix);

  ctx.restore();
  return radii;
}

function parseHexRgb(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return [200, 220, 255];
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

function mixHexTowardWhite(hex: string, t: number): string {
  const [r, g, b] = parseHexRgb(hex);
  const u = Math.max(0, Math.min(1, t));
  const lr = Math.round(r + (255 - r) * u);
  const lg = Math.round(g + (255 - g) * u);
  const lb = Math.round(b + (255 - b) * u);
  return `#${[lr, lg, lb]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("")}`;
}

function mixRgbTowardWhite(r: number, g: number, b: number, t: number): [number, number, number] {
  const u = Math.max(0, Math.min(1, t));
  return [
    Math.round(r + (255 - r) * u),
    Math.round(g + (255 - g) * u),
    Math.round(b + (255 - b) * u),
  ];
}

function lerpRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  const u = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * u),
    Math.round(a[1] + (b[1] - a[1]) * u),
    Math.round(a[2] + (b[2] - a[2]) * u),
  ];
}

const WHITE_RGB: [number, number, number] = [255, 255, 255];

function isNearWhiteRgb(r: number, g: number, b: number): boolean {
  return r > 250 && g > 250 && b > 250;
}

function linearLuminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Brightest of front / mid / (glow if not white) — drives the wallpaper color cast. */
function pickBrightestPaletteHex(front: string, mid: string, glow: string): string {
  const candidates: string[] = [front, mid];
  const [gr, gg, gb] = parseHexRgb(glow);
  if (!isNearWhiteRgb(gr, gg, gb)) candidates.push(glow);
  let best = candidates[0]!;
  let bestL = linearLuminance(...parseHexRgb(best));
  for (let i = 1; i < candidates.length; i++) {
    const [r, g, b] = parseHexRgb(candidates[i]!);
    const L = linearLuminance(r, g, b);
    if (L > bestL) {
      best = candidates[i]!;
      bestL = L;
    }
  }
  return best;
}

/**
 * Root → tip: mid → front, then into glow (or white); tips read hottest.
 * Linear along each bar — restored after perf work (DPR cap + Path2D cache + visibility RAF ease cost).
 */
function createBarGlowGradient(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rootRgb: [number, number, number],
  frontRgb: [number, number, number],
  glowRgb: [number, number, number],
): CanvasGradient {
  const [r0, g0, b0] = rootRgb;
  const [rf, gf, bf] = frontRgb;
  const [rg, gg, bg] = glowRgb;
  const glowW = isNearWhiteRgb(rg, gg, bg);
  const tip: [number, number, number] = glowW ? WHITE_RGB : mixRgbTowardWhite(rg, gg, bg, 0.28);
  const [rA, gA, bA] = lerpRgb([rf, gf, bf], glowW ? WHITE_RGB : [rg, gg, bg], 0.42);
  const [rB, gB, bB] = lerpRgb([rf, gf, bf], glowW ? WHITE_RGB : [rg, gg, bg], 0.74);
  const [rT, gT, bT] = tip;
  const grd = ctx.createLinearGradient(x1, y1, x2, y2);
  grd.addColorStop(0, `rgba(${r0},${g0},${b0},0.78)`);
  grd.addColorStop(0.26, `rgba(${rf},${gf},${bf},0.88)`);
  grd.addColorStop(0.52, `rgba(${rA},${gA},${bA},0.93)`);
  grd.addColorStop(0.78, `rgba(${rB},${gB},${bB},0.97)`);
  grd.addColorStop(1, `rgba(${rT},${gT},${bT},1)`);
  return grd;
}

/**
 * Same palette story as bars, in bbox-local coords (origin = logo center). Softer hand-off to glow.
 */
function createLogoFaceGradient(
  ctx: CanvasRenderingContext2D,
  hx: number,
  hy: number,
  midRgb: [number, number, number],
  frontRgb: [number, number, number],
  glowRgb: [number, number, number],
): CanvasGradient {
  const [rM, gM, bM] = midRgb;
  const [rF, gF, bF] = frontRgb;
  const [rG, gG, bG] = glowRgb;
  const glowW = isNearWhiteRgb(rG, gG, bG);
  const gEnd: [number, number, number] = glowW ? WHITE_RGB : [rG, gG, bG];
  const [rN, gN, bN] = lerpRgb([rF, gF, bF], gEnd, 0.48);
  const grd = ctx.createLinearGradient(-hx, -hy, hx * 0.72, hy * 0.88);
  grd.addColorStop(0, `rgba(${rM},${gM},${bM},0.98)`);
  grd.addColorStop(0.42, `rgba(${rF},${gF},${bF},1)`);
  grd.addColorStop(0.78, `rgba(${rN},${gN},${bN},1)`);
  grd.addColorStop(1, `rgba(${gEnd[0]},${gEnd[1]},${gEnd[2]},1)`);
  return grd;
}

function unionPathBounds(paths: string[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  if (typeof document === "undefined" || paths.length === 0) return null;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;";
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  try {
    for (const d of paths) {
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", d);
      svg.appendChild(p);
    }
    document.body.appendChild(svg);
    for (const el of svg.querySelectorAll("path")) {
      const bb = (el as SVGPathElement).getBBox();
      minX = Math.min(minX, bb.x);
      minY = Math.min(minY, bb.y);
      maxX = Math.max(maxX, bb.x + bb.width);
      maxY = Math.max(maxY, bb.y + bb.height);
    }
  } catch {
    return null;
  } finally {
    svg.remove();
  }
  if (!Number.isFinite(minX) || minX === Infinity) return null;
  return { minX, minY, maxX, maxY };
}

export type SvgOutlineRingAppearance = "default" | "lightMono";

interface SvgOutlineRingVisualizerProps {
  paths: string[];
  viewBox: [number, number, number, number];
  isActive: boolean;
  /** Accent for ring + outline (hex). */
  colorFront: string;
  colorMid: string;
  colorBack: string;
  /** Second-brightest album/cover swatch: bar glow + logo gradient terminus. */
  colorGlow: string;
  className?: string;
  /**
   * `lightMono`: white bars + logo with soft white glow, neutral veil (no cover hue); for desktop mesh + ring.
   */
  appearance?: SvgOutlineRingAppearance;
}

/**
 * Ring of audio-reactive bars around a center stroked from SVG path data (YouTube Shorts–style).
 */
export function SvgOutlineRingVisualizer({
  paths,
  viewBox,
  isActive,
  colorFront,
  colorMid,
  colorBack,
  colorGlow,
  className = "",
  appearance = "default",
}: SvgOutlineRingVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** Keep latest palette without listing colors in the RAF effect deps — lerped colors update every frame and would restart the loop (visible flicker). */
  const colorsRef = useRef({ colorFront, colorMid, colorBack, colorGlow });
  colorsRef.current = { colorFront, colorMid, colorBack, colorGlow };
  const appearanceRef = useRef<SvgOutlineRingAppearance>(appearance);
  appearanceRef.current = appearance;

  const musicShadersOn = useDisplaySettingsStore((s) => s.musicShaderEffectsEnabled ?? true);
  const motion = useAudioShaderSettingsStore((s) => s.visualMotion);

  const boundsRef = useRef<ReturnType<typeof unionPathBounds>>(null);
  /** Recomputed only when size, paths, or layout key changes — outline sampling is too heavy for every frame. */
  const outlineRadiiCacheRef = useRef<{ key: string; radii: Float64Array } | null>(null);
  /** Avoid `new Path2D(d)` every frame for each logo pass. */
  const path2dCacheRef = useRef<{ key: string; list: Path2D[] }>({ key: "", list: [] });
  /** Reused x1,y1,x2,y2 per bar (two stroke passes read from here, no duplicate trig). */
  const barCoordsBuf = useRef<Float32Array>(new Float32Array(RING_BARS * 4));

  useEffect(() => {
    /** Same commit + same `paths` as this effect — avoids bar ellipse using stale/null bounds from a separate effect. */
    boundsRef.current = unionPathBounds(paths);

    const canvas = canvasRef.current;
    if (!canvas || !musicShadersOn) return;
    const parentEl = canvas.parentElement;
    if (!parentEl) return;

    const ctx =
      canvas.getContext("2d", {
        alpha: true,
        desynchronized: true,
      }) ?? canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const startMs = performance.now();
    let smoothE = 0;
    let smoothB = 0;
    let smoothM = 0;
    let smoothTr = 0;
    let smoothBt = 0;
    let lastOutlineKeyForAmp = "";
    const barAmpSmoothed = new Float64Array(RING_BARS);

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(VISUALIZER_MAX_DPR, window.devicePixelRatio || 1);
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(parentEl);
    resize();

    const draw = () => {
      const w = canvas.parentElement?.clientWidth ?? 1;
      const h = canvas.parentElement?.clientHeight ?? 1;
      const cx = w / 2;
      const cy = h / 2;
      const minDim = Math.min(w, h);
      const ringRefR = minDim * INNER_FRACTION;
      const logoMaxR = ringRefR * LOGO_MAX_R_FACTOR;
      const maxBar = minDim * BAR_LENGTH_MAX_FRAC;

      const bb = boundsRef.current;
      const [vbx, vby, vbw, vbh] = viewBox;

      let aPix = ringRefR * FALLBACK_BAR_INNER_FACTOR;
      let bPix = ringRefR * FALLBACK_BAR_INNER_FACTOR;
      if (bb && bb.maxX > bb.minX + 1e-9) {
        const bw = bb.maxX - bb.minX;
        const bh = bb.maxY - bb.minY;
        const denom = Math.max(bw, bh, 1e-9);
        const scale = (logoMaxR * 2) / denom;
        aPix = (bw / 2) * scale;
        bPix = (bh / 2) * scale;
      } else {
        const denom = Math.max(vbw, vbh, 1e-9);
        const scale = logoMaxR / denom;
        aPix = (vbw / 2) * scale;
        bPix = (vbh / 2) * scale;
      }

      const tSearchMax = minDim * 0.78;
      const bbKey = bb
        ? `${bb.minX},${bb.minY},${bb.maxX},${bb.maxY}`
        : `vb:${vbx},${vby},${vbw},${vbh}`;
      /** Rounded so subpixel layout doesn’t thrash the cache and reset bar smoothing every frame. */
      const outlineKey = `${Math.round(w)}x${Math.round(h)}|${logoMaxR.toFixed(4)}|${bbKey}|${viewBox.join(",")}|${paths.join("\0")}|v${OUTLINE_RADII_CACHE_VERSION}`;
      let outlineCache = outlineRadiiCacheRef.current;
      if (!outlineCache || outlineCache.key !== outlineKey) {
        const radii = computeBarStartRadiiAlongOutline(
          ctx,
          cx,
          cy,
          bb,
          viewBox,
          logoMaxR,
          paths,
          tSearchMax,
          aPix,
          bPix,
        );
        outlineRadiiCacheRef.current = { key: outlineKey, radii };
        outlineCache = outlineRadiiCacheRef.current;
      }
      if (outlineKey !== lastOutlineKeyForAmp) {
        lastOutlineKeyForAmp = outlineKey;
        barAmpSmoothed.fill(0);
      }
      const barStartRadii = outlineCache.radii;

      const { energy, bass, mid, treble, beat } = useAudioReactiveStore.getState();
      const rawE = Math.min(1, energy * motion);
      const rawB = Math.min(1, bass * motion);
      const rawM = Math.min(1, mid * motion);
      const rawTr = Math.min(1, treble * motion);
      const rawBt = Math.min(1, beat * motion);
      const k = AUDIO_INPUT_SMOOTH;
      smoothE += (rawE - smoothE) * k;
      smoothB += (rawB - smoothB) * k;
      smoothM += (rawM - smoothM) * k;
      smoothTr += (rawTr - smoothTr) * k;
      smoothBt += (rawBt - smoothBt) * k;
      const e0 = smoothE;
      const b0 = smoothB;
      const m0 = smoothM;
      const tr0 = smoothTr;
      const bt = smoothBt;

      const animT = (performance.now() - startMs) / 1000;

      const pathJoin = paths.join("\0");
      if (path2dCacheRef.current.key !== pathJoin) {
        const list: Path2D[] = [];
        for (const d of paths) {
          try {
            list.push(new Path2D(d));
          } catch {
            /* skip invalid */
          }
        }
        path2dCacheRef.current = { key: pathJoin, list };
      }
      const logoPath2DList = path2dCacheRef.current.list;

      const { colorFront: cf, colorMid: cm, colorGlow: cg } = colorsRef.current;
      const lightMono = appearanceRef.current === "lightMono";
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, w, h);
      const brightest = pickBrightestPaletteHex(cf, cm, cg);
      const wallpaperTint = mixHexTowardWhite(brightest, WALLPAPER_OVERLAY_LIGHTEN);
      const [wr, wg, wb] = parseHexRgb(wallpaperTint);
      if (lightMono) {
        ctx.fillStyle = "rgba(255,255,255,0.07)";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "rgba(0,0,0,0.035)";
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.fillStyle = `rgba(${wr},${wg},${wb},${WALLPAPER_OVERLAY_ALPHA})`;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = `rgba(0,0,0,${WALLPAPER_BASE_DIM_ALPHA})`;
        ctx.fillRect(0, 0, w, h);
      }

      const cfB = mixHexTowardWhite(cf, FOREGROUND_BRIGHTEN);
      const cmB = mixHexTowardWhite(cm, FOREGROUND_BRIGHTEN);
      const cgB = mixHexTowardWhite(cg, FOREGROUND_BRIGHTEN * 0.9);
      const [r0, g0, b00] = parseHexRgb(cmB);
      const [r1, g1, b1] = parseHexRgb(cfB);
      const [rG, gG, bG] = parseHexRgb(cgB);
      const glowIsWhite = isNearWhiteRgb(rG, gG, bG);
      const [rGlowShadow, gGlowShadow, bGlowShadow] = glowIsWhite
        ? [255, 255, 255]
        : mixRgbTowardWhite(rG, gG, bG, 0.18);
      const barGapPx = minDim * BAR_GAP_FROM_OUTLINE_FRAC;
      const barShadowBlur = lightMono
        ? Math.max(5, minDim * 0.018 + bt * minDim * 0.014)
        : Math.max(4, minDim * BAR_SHADOW_BLUR_FRAC + bt * minDim * 0.022);
      const baseBarLineW = lightMono
        ? Math.max(1.85, minDim * 0.0058)
        : Math.max(2.4, minDim * 0.007);
      const buf = barCoordsBuf.current;

      for (let i = 0; i < RING_BARS; i++) {
        const ang = (i / RING_BARS) * Math.PI * 2 - Math.PI / 2;
        const phase = (i / RING_BARS) * 12;
        const wobbleRaw =
          e0 * 0.48 +
          b0 * 0.38 * (0.5 + 0.5 * Math.sin(phase + animT * 1.45)) +
          m0 * 0.27 +
          tr0 * 0.2 * Math.sin(phase * 2 + animT * 2.1) +
          bt * 0.54 * (0.58 + 0.42 * Math.sin(i * 0.65 + animT * 1.05));
        let amp = Math.min(1, Math.max(0, wobbleRaw * BAR_AUDIO_REACTIVITY));
        barAmpSmoothed[i] += (amp - barAmpSmoothed[i]) * BAR_AMP_SMOOTH;
        amp = barAmpSmoothed[i]!;
        const barLen = 4 + amp * maxBar;
        const rRoot = barStartRadii[i]! + barGapPx;
        const c = Math.cos(ang);
        const s = Math.sin(ang);
        const o = i * 4;
        buf[o] = cx + c * rRoot;
        buf[o + 1] = cy + s * rRoot;
        buf[o + 2] = cx + c * (rRoot + barLen);
        buf[o + 3] = cy + s * (rRoot + barLen);
      }

      ctx.save();
      ctx.shadowColor = lightMono
        ? "rgba(255,255,255,0.55)"
        : `rgba(${rGlowShadow},${gGlowShadow},${bGlowShadow},${glowIsWhite ? 0.62 : 0.78})`;
      ctx.shadowBlur = barShadowBlur;
      ctx.lineWidth = baseBarLineW;
      ctx.lineCap = "round";

      for (let i = 0; i < RING_BARS; i++) {
        const o = i * 4;
        const x1 = buf[o]!;
        const y1 = buf[o + 1]!;
        const x2 = buf[o + 2]!;
        const y2 = buf[o + 3]!;
        ctx.strokeStyle = lightMono
          ? "rgba(255,255,255,0.92)"
          : createBarGlowGradient(ctx, x1, y1, x2, y2, [r0, g0, b00], [r1, g1, b1], [
              rG,
              gG,
              bG,
            ]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      if (!lightMono) {
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.shadowColor = `rgba(255,255,255,${BAR_NEON_SHADOW_ALPHA + bt * 0.16})`;
        ctx.shadowBlur = minDim * BAR_NEON_BLUR_FRAC + (isActive ? bt * 8 : 0);
        ctx.strokeStyle = `rgba(255,255,255,${BAR_NEON_STROKE_ALPHA})`;
        ctx.lineWidth = baseBarLineW * BAR_NEON_LINE_WIDTH_MULT;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        for (let i = 0; i < RING_BARS; i++) {
          const o = i * 4;
          ctx.beginPath();
          ctx.moveTo(buf[o]!, buf[o + 1]!);
          ctx.lineTo(buf[o + 2]!, buf[o + 3]!);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
        ctx.shadowColor = "transparent";
        ctx.globalCompositeOperation = "source-over";
        ctx.restore();
      }

      ctx.restore();

      ctx.save();
      applyLogoTransform(ctx, cx, cy, bb, viewBox, logoMaxR);

      const hx = bb && bb.maxX > bb.minX + 1e-9 ? (bb.maxX - bb.minX) / 2 : vbw / 2;
      const hy = bb && bb.maxY > bb.minY + 1e-9 ? (bb.maxY - bb.minY) / 2 : vbh / 2;
      const logoFaceGrd = createLogoFaceGradient(ctx, hx, hy, [r0, g0, b00], [r1, g1, b1], [rG, gG, bG]);
      const [rLo, gLo, bLo] = glowIsWhite ? [255, 255, 255] : mixRgbTowardWhite(rG, gG, bG, 0.1);
      const scaleA = ctx.getTransform().a || 1;
      const baseLogoLw = Math.max(1.45, LOGO_STROKE_BASE / scaleA);
      const bloomBlur =
        minDim * (LOGO_SHADOW_BLUR_FRAC + LOGO_SHADOW_BLUR_BEAT_FRAC * bt * 0.88) + (isActive ? bt * 15 : 0);

      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      if (lightMono) {
        ctx.strokeStyle = "rgba(255,255,255,0.28)";
        ctx.shadowColor = "rgba(255,255,255,0.4)";
        ctx.shadowBlur = bloomBlur * 0.4 + minDim * 0.012;
        ctx.lineWidth = baseLogoLw * (LOGO_BLOOM_WIDTH_MULT * 0.72);
        for (const p of logoPath2DList) {
          ctx.stroke(p);
        }
        ctx.strokeStyle = "rgba(255,255,255,0.96)";
        ctx.shadowBlur = Math.max(4, minDim * LOGO_SHADOW_BLUR_FRAC * 0.65) + (isActive ? bt * 6 : 0);
        ctx.shadowColor = "rgba(255,255,255,0.5)";
        ctx.lineWidth = baseLogoLw;
        for (const p of logoPath2DList) {
          ctx.stroke(p);
        }
        ctx.shadowBlur = 0;
        ctx.shadowColor = "transparent";
        ctx.globalAlpha = LOGO_FILL_ALPHA * 0.45;
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        for (const p of logoPath2DList) {
          ctx.fill(p);
        }
        ctx.globalAlpha = 1;
      } else {
        ctx.strokeStyle = `rgba(${r1},${g1},${b1},${LOGO_BLOOM_ALPHA})`;
        ctx.shadowColor = `rgba(${r1},${g1},${b1},${0.55 + bt * 0.32})`;
        ctx.shadowBlur = bloomBlur + minDim * 0.022;
        ctx.lineWidth = baseLogoLw * LOGO_BLOOM_WIDTH_MULT;
        for (const p of logoPath2DList) {
          ctx.stroke(p);
        }

        ctx.strokeStyle = logoFaceGrd;
        ctx.shadowColor = `rgba(${rLo},${gLo},${bLo},${glowIsWhite ? 0.42 : 0.58})`;
        ctx.shadowBlur = Math.max(3, minDim * LOGO_SHADOW_BLUR_FRAC) + (isActive ? bt * 14 : 0);
        ctx.lineWidth = baseLogoLw;
        for (const p of logoPath2DList) {
          ctx.stroke(p);
        }
        ctx.shadowBlur = 0;
        ctx.shadowColor = "transparent";
        ctx.globalAlpha = LOGO_FILL_ALPHA;
        ctx.fillStyle = logoFaceGrd;
        for (const p of logoPath2DList) {
          ctx.fill(p);
        }
        ctx.globalAlpha = 1;

        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.shadowColor = `rgba(255,255,255,${LOGO_NEON_SHADOW_ALPHA + bt * 0.18})`;
        ctx.shadowBlur = minDim * LOGO_NEON_BLUR_FRAC + (isActive ? bt * 9 : 0);
        ctx.strokeStyle = `rgba(255,255,255,${LOGO_NEON_STROKE_ALPHA})`;
        ctx.lineWidth = baseLogoLw * LOGO_NEON_LINE_WIDTH_MULT;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        for (const p of logoPath2DList) {
          ctx.stroke(p);
        }
        ctx.shadowBlur = 0;
        ctx.shadowColor = "transparent";
        ctx.globalCompositeOperation = "source-over";
        ctx.restore();
      }

      ctx.restore();

      if (!lightMono) {
        ctx.save();
        ctx.globalCompositeOperation = "soft-light";
        ctx.fillStyle = `rgba(255,255,255,${BRIGHTEN_OVERLAY_WHITE_ALPHA})`;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = `rgba(${wr},${wg},${wb},${BRIGHTEN_OVERLAY_TINT_ALPHA})`;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = "color-dodge";
        ctx.fillStyle = `rgba(255,255,255,${COLOR_DODGE_OVERLAY_WHITE_ALPHA})`;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = `rgba(${wr},${wg},${wb},${COLOR_DODGE_OVERLAY_TINT_ALPHA})`;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = "source-over";
        ctx.restore();
      }

      if (!isActive && INACTIVE_DIM_ALPHA > 0) {
        ctx.fillStyle = `rgba(0,0,0,${INACTIVE_DIM_ALPHA})`;
        ctx.fillRect(0, 0, w, h);
      }
    };

    const onFrame = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        raf = 0;
        return;
      }
      draw();
      raf = requestAnimationFrame(onFrame);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible" && raf === 0) {
        raf = requestAnimationFrame(onFrame);
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    raf = requestAnimationFrame(onFrame);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [paths, viewBox, isActive, musicShadersOn, motion]);

  if (!musicShadersOn) return null;

  return (
    <canvas
      ref={canvasRef}
      className={cn("absolute inset-0 h-full w-full", className)}
      aria-hidden
    />
  );
}
