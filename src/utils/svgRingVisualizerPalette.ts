import type { TrackMoodPalette } from "@/utils/trackMood";

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return null;
  return { r: parseInt(m[1]!, 16), g: parseInt(m[2]!, 16), b: parseInt(m[3]!, 16) };
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** s,v in 0..1; h in 0..1 */
function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d > 1e-8) {
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    else if (max === gn) h = ((bn - rn) / d + 2) / 6;
    else h = ((rn - gn) / d + 4) / 6;
  }
  const s = max <= 1e-8 ? 0 : d / max;
  const v = max;
  return { h: h % 1, s, v };
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const hh = ((h % 1) + 1) % 1;
  const i = Math.floor(hh * 6);
  const f = hh * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r = 0;
  let g = 0;
  let b = 0;
  switch (i % 6) {
    case 0:
      r = v;
      g = t;
      b = p;
      break;
    case 1:
      r = q;
      g = v;
      b = p;
      break;
    case 2:
      r = p;
      g = v;
      b = t;
      break;
    case 3:
      r = p;
      g = q;
      b = v;
      break;
    case 4:
      r = t;
      g = p;
      b = v;
      break;
    default:
      r = v;
      g = p;
      b = q;
  }
  return { r: r * 255, g: g * 255, b: b * 255 };
}

function hexFromHsv(h: number, s: number, v: number): string {
  const { r, g, b } = hsvToRgb(h, s, v);
  return rgbToHex(r, g, b);
}

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * Math.max(0, Math.min(1, t)));
}

/** Blend two hex colors — `t` is weight on `b` (0 = `a` only, 1 = `b` only). */
function lerpHex(a: string, b: string, t: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  if (!pa || !pb) return a;
  const u = Math.max(0, Math.min(1, t));
  return rgbToHex(
    lerpChannel(pa.r, pb.r, u),
    lerpChannel(pa.g, pb.g, u),
    lerpChannel(pa.b, pb.b, u),
  );
}

/** Near-white / gray-white: too light and desaturated to treat as a “color”. */
function isNearWhite(hex: string): boolean {
  const rgb = parseHex(hex);
  if (!rgb) return true;
  const { r, g, b } = rgb;
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const sat = max < 1e-6 ? 0 : (max - min) / max;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.93 && sat < 0.08;
}

/** Prefer high value + saturation: “lightest bright” chromatic swatch. */
function lightBrightScore(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return -1;
  const { r, g, b } = rgb;
  const { h, s, v } = rgbToHsv(r, g, b);
  void h;
  return v * v * (0.18 + s * 0.82);
}

/** Squared RGB distance — distinct enough to read as a separate “glow” vs. the ring front. */
function colorDeltaSq(hexA: string, hexB: string): number {
  const a = parseHex(hexA);
  const b = parseHex(hexB);
  if (!a || !b) return 0;
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

/** ~same threshold spirit as cover `MID_DISTINCT_FROM_FRONT` (looser than glow). */
const MIN_GLOW_DISTINCT_FROM_FRONT_SQ = 38 * 38;

/**
 * Second accent for tips/glows: prefer song/cover `mid`, `back`, then accents that read clearly
 * different from the ring `colorFront`. If nothing works, callers use white tips.
 */
function pickGlowAccentSourceHex(source: TrackMoodPalette, colorFront: string): string | null {
  const candidates = [source.colorMid, source.colorBack, ...(source.accents ?? [])]
    .map((c) => c?.trim())
    .filter((c): c is string => Boolean(c));
  const uniq = [...new Set(candidates)];
  const scored = uniq
    .filter((c) => !isNearWhite(c))
    .map((c) => ({ c, s: lightBrightScore(c), d: colorDeltaSq(c, colorFront) }))
    .filter((x) => x.d >= MIN_GLOW_DISTINCT_FROM_FRONT_SQ)
    .sort((a, b) => b.s - a.s);
  return scored.length > 0 ? scored[0]!.c : null;
}

/**
 * Punch for on-screen readability while staying near the sampled cover hue (gentler than legacy `boostVivid`).
 */
function boostCoverVivid(h: number, s: number, v: number): { h: number; s: number; v: number } {
  return {
    h,
    s: Math.min(1, s * 1.16 + 0.06),
    v: Math.min(1, v * 1.08 + 0.04),
  };
}

/** Glow accent: small lift only so it still reads as the cover’s second tone. */
function boostCoverGlow(h: number, s: number, v: number): { h: number; s: number; v: number } {
  return {
    h,
    s: Math.min(1, s * 1.12 + 0.05),
    v: Math.min(1, v * 1.06 + 0.03),
  };
}

const FALLBACK_VIVID = "#38a0ff";

/** Bar/logo tip glow when no distinct second swatch exists (canvas blends this in gradients). */
export const RING_GLOW_FALLBACK_WHITE = "#ffffff";

export function svgRingPaletteInputKey(p: TrackMoodPalette): string {
  return [p.colorFront, p.colorMid, p.colorBack, ...(p.accents ?? [])].join("|");
}

/** Ring visualizer output: primary draw colors + second-bright album swatch for glows. */
export interface SvgRingDrawPalette extends TrackMoodPalette {
  /** Second-brightest cover/mood color, boosted for bar tip glow / halos. */
  colorGlow: string;
}

function softBoostMid(h: number, s: number, v: number): { h: number; s: number; v: number } {
  return {
    h,
    s: Math.min(1, s * 1.1 + 0.03),
    v: Math.min(1, v * 1.05 + 0.02),
  };
}

/**
 * Ring colors track the **cover/mood triple** from `coverPaletteToNeuroTriple` + mood. We apply a
 * light vivid pass, then **blend back toward the raw hexes** so the UI still reads like the album art.
 *
 * `colorGlow` is a distinct second tone when possible; otherwise white for tips.
 */
export function buildSvgRingDrawPalette(source: TrackMoodPalette): SvgRingDrawPalette {
  const rawFront = (source.colorFront && source.colorFront.trim()) || FALLBACK_VIVID;
  const rawMid = (source.colorMid && source.colorMid.trim()) || rawFront;
  const rawBack = (source.colorBack && source.colorBack.trim()) || rawFront;

  const rgbAnchor = parseHex(rawFront) ?? parseHex(FALLBACK_VIVID)!;
  let { h, s, v } = rgbToHsv(rgbAnchor.r, rgbAnchor.g, rgbAnchor.b);
  if (s < 0.04 && v > 0.5) {
    s = 0.48;
    v = Math.min(1, v + 0.12);
  }
  const hi = boostCoverVivid(h, s, v);
  const boostedFront = hexFromHsv(hi.h, hi.s, hi.v);
  /** ~40% raw cover front, ~60% boosted — vivid on screen but still “that” cover color. */
  const colorFront = lerpHex(rawFront, boostedFront, 0.58);

  const rgbMid = parseHex(rawMid) ?? rgbAnchor;
  let hm = rgbToHsv(rgbMid.r, rgbMid.g, rgbMid.b);
  const midHi = softBoostMid(hm.h, hm.s, hm.v);
  const boostedMid = hexFromHsv(
    midHi.h,
    Math.min(1, midHi.s * 0.96),
    Math.min(1, midHi.v * 0.93),
  );
  const colorMid = lerpHex(rawMid, boostedMid, 0.55);

  const rgbBack = parseHex(rawBack) ?? rgbAnchor;
  let hb = rgbToHsv(rgbBack.r, rgbBack.g, rgbBack.b);
  const boostedBack = hexFromHsv(
    hb.h,
    Math.min(0.75, hb.s * 0.58 + 0.05),
    Math.min(0.97, hb.v * 0.82 + 0.08),
  );
  const colorBack = lerpHex(rawBack, boostedBack, 0.48);

  const glowSrc = pickGlowAccentSourceHex(source, colorFront);
  let colorGlow: string;
  if (!glowSrc) {
    colorGlow = RING_GLOW_FALLBACK_WHITE;
  } else {
    const rgbG = parseHex(glowSrc) ?? rgbAnchor;
    let { h: hg, s: sg, v: vg } = rgbToHsv(rgbG.r, rgbG.g, rgbG.b);
    if (sg < 0.04 && vg > 0.5) {
      sg = 0.45;
      vg = Math.min(1, vg + 0.1);
    }
    const gBoost = boostCoverGlow(hg, sg, vg);
    const boostedGlow = hexFromHsv(gBoost.h, gBoost.s, gBoost.v);
    const candidate = lerpHex(glowSrc, boostedGlow, 0.52);
    colorGlow =
      colorDeltaSq(candidate, colorFront) >= MIN_GLOW_DISTINCT_FROM_FRONT_SQ
        ? candidate
        : RING_GLOW_FALLBACK_WHITE;
  }

  return {
    ...source,
    colorFront,
    colorMid,
    colorBack,
    colorGlow,
    accents: [colorFront, colorMid, colorGlow, ...(source.accents ?? [])].slice(0, 10),
  };
}
