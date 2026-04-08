import { useState, useEffect, useRef } from "react";

const DEFAULT_PALETTE = [
  "#274754",
  "#9c2b2b",
  "#e07c4c",
  "#f4a462",
  "#c9b896",
  "#e8dcd0",
  "#ffffff",
];

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((x) => {
        const hex = Math.round(Math.max(0, Math.min(255, x))).toString(16);
        return hex.length === 1 ? "0" + hex : hex;
      })
      .join("")
  );
}

/** Squared RGB distance for distinctness check (avoids sqrt) */
function colorDistSq(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number
): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return dr * dr + dg * dg + db * db;
}

/** Min squared distance to be considered "distinct" (≈70 in linear space; lower for 7 colors) */
const MIN_DISTINCT_SQ = 70 * 70;

/** Mid tone should differ from the vivid front (looser than MIN_DISTINCT_SQ). */
const MID_DISTINCT_FROM_FRONT_SQ = 42 * 42;

const COLOR_COUNT = 7;

function parseHexRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return null;
  return {
    r: parseInt(m[1]!, 16),
    g: parseInt(m[2]!, 16),
    b: parseInt(m[3]!, 16),
  };
}

/** HSV-style saturation × value: favors saturated, non-black colors (vivid). */
function vividScoreRgb(r: number, g: number, b: number): number {
  const r1 = r / 255;
  const g1 = g / 255;
  const b1 = b / 255;
  const mx = Math.max(r1, g1, b1);
  const mn = Math.min(r1, g1, b1);
  const sat = mx <= 1e-6 ? 0 : (mx - mn) / mx;
  return sat * mx;
}

function luminanceLinear(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Highest saturation×value swatch in a palette (same rule as neural `colorFront`). */
export function mostVividHexFromPalette(colors: string[] | null | undefined): string | null {
  if (!colors?.length) return null;
  const parsed = colors
    .map((hex) => {
      const rgb = parseHexRgb(hex);
      return rgb ? { r: rgb.r, g: rgb.g, b: rgb.b } : null;
    })
    .filter((c): c is { r: number; g: number; b: number } => c != null);
  if (parsed.length === 0) return null;
  let best = parsed[0]!;
  let bestScore = vividScoreRgb(best.r, best.g, best.b);
  for (let i = 1; i < parsed.length; i++) {
    const c = parsed[i]!;
    const s = vividScoreRgb(c.r, c.g, c.b);
    if (s > bestScore) {
      best = c;
      bestScore = s;
    }
  }
  return rgbToHex(best.r, best.g, best.b);
}

/**
 * Extracts 7 distinct main colors from cover art.
 * Samples a grid, quantizes to reduce noise, counts frequency, then greedily
 * picks the 7 most frequent colors that are visually distinct from each other.
 */
function extractPaletteFromImage(img: HTMLImageElement): string[] {
  const canvas = document.createElement("canvas");
  const size = 64;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return DEFAULT_PALETTE;

  ctx.drawImage(img, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;

  // Quantize to 16 levels per channel, build frequency map
  const step = 4; // sample every 4th pixel
  const quant = 16;
  const freq = new Map<number, { r: number; g: number; b: number; n: number }>();

  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      const i = (y * size + x) * 4;
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      const a = data[i + 3] ?? 255;
      if (a < 128) continue; // skip transparent

      const qr = Math.floor(r / (256 / quant)) * (256 / quant);
      const qg = Math.floor(g / (256 / quant)) * (256 / quant);
      const qb = Math.floor(b / (256 / quant)) * (256 / quant);
      const key = (qr << 16) | (qg << 8) | qb;

      const v = freq.get(key);
      if (v) {
        v.r += r;
        v.g += g;
        v.b += b;
        v.n++;
      } else {
        freq.set(key, { r, g, b, n: 1 });
      }
    }
  }

  // Sort by frequency (most common first)
  const sorted = [...freq.entries()]
    .map(([_, v]) => ({
      r: v.r / v.n,
      g: v.g / v.n,
      b: v.b / v.n,
      n: v.n,
    }))
    .sort((a, b) => b.n - a.n);

  if (sorted.length === 0) return DEFAULT_PALETTE;

  // Greedily pick N distinct colors
  const result: string[] = [];
  for (const c of sorted) {
    if (result.length >= COLOR_COUNT) break;
    const tooClose = result.some((hex) => {
      const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
      if (!m) return false;
      const r2 = parseInt(m[1]!, 16);
      const g2 = parseInt(m[2]!, 16);
      const b2 = parseInt(m[3]!, 16);
      return colorDistSq(c.r, c.g, c.b, r2, g2, b2) < MIN_DISTINCT_SQ;
    });
    if (!tooClose) {
      result.push(rgbToHex(c.r, c.g, c.b));
    }
  }

  // If we couldn't get enough distinct, add most frequent not yet picked
  for (const c of sorted) {
    if (result.length >= COLOR_COUNT) break;
    const hex = rgbToHex(c.r, c.g, c.b);
    if (!result.includes(hex)) result.push(hex);
  }

  return result.length >= COLOR_COUNT ? result : DEFAULT_PALETTE;
}

/**
 * Maps extracted cover colors to NeuroNoise's three-band palette: highlight from the
 * most vivid swatch, a distinct mid tone, and a dark background from the darkest swatch.
 */
export function coverPaletteToNeuroTriple(colors: string[]): {
  colorFront: string;
  colorMid: string;
  colorBack: string;
} {
  const safe = colors.length >= 3 ? colors : DEFAULT_PALETTE;

  const parsed = safe
    .map((hex) => {
      const rgb = parseHexRgb(hex);
      return rgb ? { hex, ...rgb } : null;
    })
    .filter((c): c is { hex: string; r: number; g: number; b: number } => c != null);

  if (parsed.length === 0) {
    return {
      colorFront: DEFAULT_PALETTE[0]!,
      colorMid: DEFAULT_PALETTE[2]!,
      colorBack: darkenHexRgb(DEFAULT_PALETTE[5]!, 0.22),
    };
  }

  const byVivid = [...parsed].sort(
    (a, b) => vividScoreRgb(b.r, b.g, b.b) - vividScoreRgb(a.r, a.g, a.b)
  );
  const front = byVivid[0]!;

  const mid =
    byVivid.find(
      (c) =>
        colorDistSq(c.r, c.g, c.b, front.r, front.g, front.b) >= MID_DISTINCT_FROM_FRONT_SQ
    ) ?? byVivid[1] ?? front;

  const byDark = [...parsed].sort(
    (a, b) => luminanceLinear(a.r, a.g, a.b) - luminanceLinear(b.r, b.g, b.b)
  );
  const deep = byDark[0]!;

  return {
    colorFront: rgbToHex(front.r, front.g, front.b),
    colorMid: rgbToHex(mid.r, mid.g, mid.b),
    colorBack: darkenHexRgb(deep.hex, 0.22),
  };
}

function darkenHexRgb(hex: string, factor: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return "#070714";
  const r = Math.min(255, Math.max(0, Math.round(parseInt(m[1]!, 16) * factor)));
  const g = Math.min(255, Math.max(0, Math.round(parseInt(m[2]!, 16) * factor)));
  const b = Math.min(255, Math.max(0, Math.round(parseInt(m[3]!, 16) * factor)));
  return rgbToHex(r, g, b);
}

/**
 * Loads cover art and extracts a palette for the neural shader only.
 * When `coverUrl` changes, keeps the previous palette until the new image decodes
 * so the shader does not flash mood-only colors between tracks.
 * Returns `null` when there is no cover URL, after load error, or when extraction fails.
 */
export function useCoverPaletteForNeural(coverUrl: string | null): string[] | null {
  const [palette, setPalette] = useState<string[] | null>(null);
  const loadGenerationRef = useRef(0);

  useEffect(() => {
    if (!coverUrl) {
      loadGenerationRef.current += 1;
      setPalette(null);
      return;
    }

    const generation = ++loadGenerationRef.current;

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      if (generation !== loadGenerationRef.current) return;
      try {
        const extracted = extractPaletteFromImage(img);
        setPalette(extracted.length >= 3 ? extracted : null);
      } catch {
        if (generation !== loadGenerationRef.current) return;
        setPalette(null);
      }
    };

    img.onerror = () => {
      if (generation !== loadGenerationRef.current) return;
      setPalette(null);
    };

    img.src = coverUrl;
  }, [coverUrl]);

  return palette;
}

/**
 * Extracts a 7-color palette from cover art for use in mesh gradients.
 * Returns default palette while loading or on CORS/load error.
 */
export function useCoverPalette(coverUrl: string | null): string[] {
  const [palette, setPalette] = useState<string[]>(DEFAULT_PALETTE);

  useEffect(() => {
    if (!coverUrl) {
      setPalette(DEFAULT_PALETTE);
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        setPalette(extractPaletteFromImage(img));
      } catch {
        setPalette(DEFAULT_PALETTE);
      }
    };

    img.onerror = () => {
      setPalette(DEFAULT_PALETTE);
    };

    img.src = coverUrl;
  }, [coverUrl]);

  return palette;
}
