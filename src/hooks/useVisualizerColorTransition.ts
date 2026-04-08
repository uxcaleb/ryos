import { useEffect, useRef, useState } from "react";
import type { TrackMoodPalette } from "@/utils/trackMood";

const DEFAULT_DURATION_MS = 640;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function parseHexRgb(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return [128, 128, 128];
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function lerpChannel(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpHex(fromHex: string, toHex: string, t: number): string {
  const a = parseHexRgb(fromHex);
  const b = parseHexRgb(toHex);
  return rgbToHex(lerpChannel(a[0], b[0], t), lerpChannel(a[1], b[1], t), lerpChannel(a[2], b[2], t));
}

function paletteSignature(p: TrackMoodPalette): string {
  return [p.colorFront, p.colorMid, p.colorBack, ...p.accents].join("|");
}

function padAccents(acc: string[], len: number, fallback: string): string[] {
  const out = [...acc];
  while (out.length < len) {
    out.push(out[out.length - 1] ?? fallback);
  }
  return out;
}

/**
 * Smoothly interpolates shader palette when track/cover colors change (song switch, cover decode).
 */
export function useLerpedVisualizerPalette(
  target: TrackMoodPalette,
  options?: { durationMs?: number; enabled?: boolean },
): TrackMoodPalette {
  const durationMs = options?.durationMs ?? DEFAULT_DURATION_MS;
  const enabled = options?.enabled ?? true;

  const [display, setDisplay] = useState<TrackMoodPalette>(target);
  const displayRef = useRef(display);
  displayRef.current = display;

  const targetRef = useRef(target);
  targetRef.current = target;

  const sig = paletteSignature(target);

  useEffect(() => {
    const tgt = targetRef.current;
    if (!enabled) {
      setDisplay(tgt);
      return;
    }

    const from = displayRef.current;
    if (paletteSignature(from) === sig) return;

    const maxAcc = Math.max(from.accents.length, tgt.accents.length);
    const fromAcc = padAccents(from.accents, maxAcc, from.colorMid);
    const toAcc = padAccents(tgt.accents, maxAcc, tgt.colorMid);

    let start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const rawT = Math.min(1, (now - start) / durationMs);
      const t = easeOutCubic(rawT);
      const nextAccents = fromAcc.map((fromHex, i) => lerpHex(fromHex, toAcc[i]!, t));
      setDisplay({
        colorFront: lerpHex(from.colorFront, tgt.colorFront, t),
        colorMid: lerpHex(from.colorMid, tgt.colorMid, t),
        colorBack: lerpHex(from.colorBack, tgt.colorBack, t),
        accents:
          rawT >= 1
            ? tgt.accents
            : nextAccents.slice(0, tgt.accents.length || nextAccents.length),
      });
      if (rawT < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setDisplay(tgt);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sig, enabled, durationMs]);

  return enabled ? display : target;
}

function parseCssColor(s: string): [number, number, number] {
  const t = s.trim();
  const hex = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(t);
  if (hex) {
    return [parseInt(hex[1]!, 16), parseInt(hex[2]!, 16), parseInt(hex[3]!, 16)];
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(t);
  if (rgb) {
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  }
  return [128, 128, 128];
}

/**
 * Lerp any CSS color string (#rgb or rgb()) for overlays.
 */
export function useLerpedCssColor(
  targetCss: string,
  options?: { durationMs?: number; enabled?: boolean },
): string {
  const durationMs = options?.durationMs ?? DEFAULT_DURATION_MS;
  const enabled = options?.enabled ?? true;

  const [out, setOut] = useState(targetCss);
  const outRef = useRef(out);
  outRef.current = out;

  useEffect(() => {
    if (!enabled) {
      setOut(targetCss);
      return;
    }

    const from = parseCssColor(outRef.current);
    const to = parseCssColor(targetCss);
    if (from[0] === to[0] && from[1] === to[1] && from[2] === to[2]) return;

    let start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const rawT = Math.min(1, (now - start) / durationMs);
      const t = easeOutCubic(rawT);
      const r = lerpChannel(from[0], to[0], t);
      const g = lerpChannel(from[1], to[1], t);
      const b = lerpChannel(from[2], to[2], t);
      setOut(`rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`);
      if (rawT < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setOut(targetCss);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [targetCss, enabled, durationMs]);

  return enabled ? out : targetCss;
}
