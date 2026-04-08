import type { LyricLine } from "@/types/lyrics";

export type MusicalKeyMode = "major" | "minor";

export interface TrackMoodPalette {
  colorFront: string;
  colorMid: string;
  colorBack: string;
  /** Up to 10 accent colors for multi-stop shaders */
  accents: string[];
}

export interface TrackMoodProfile {
  /** Stable bucket id for palette lookup */
  moodId: string;
  bpmUsed: number;
  keyLabel: string;
  keyMode: MusicalKeyMode;
  /** -1 (negative) .. 1 (positive) */
  sentiment: number;
  palette: TrackMoodPalette;
}

const KEY_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

const POSITIVE_EN = /\b(love|happy|joy|bright|hope|dream|smile|dance|shine|free|gold|sun|heaven|baby|tonight|party)\b/gi;
const NEGATIVE_EN = /\b(sad|cry|tears|lonely|pain|hurt|die|dark|cold|broken|goodbye|alone|fear|lost|rain)\b/gi;

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function joinLyricText(lines: LyricLine[] | undefined): string {
  if (!lines?.length) return "";
  return lines
    .map((l) => l.words)
    .join(" ")
    .slice(0, 12_000);
}

/** Very light sentiment from Latin lyrics + a few common Romanized/Japanese tokens */
export function scoreLyricsSentiment(text: string): number {
  if (!text.trim()) return 0;
  const pos = (text.match(POSITIVE_EN) ?? []).length;
  const neg = (text.match(NEGATIVE_EN) ?? []).length;
  const jpSad = /[悲涙寂哀]/g;
  const jpJoy = /[愛喜楽輝]/g;
  const jn = (text.match(jpSad) ?? []).length;
  const jp = (text.match(jpJoy) ?? []).length;
  const score = pos - neg + (jp - jn) * 0.6;
  const words = Math.max(12, text.split(/\s+/).filter(Boolean).length);
  return clamp(score / (words * 0.08), -1, 1);
}

export function inferKeyMode(title: string, artist: string, lyricsText: string): MusicalKeyMode {
  const blob = `${title} ${artist} ${lyricsText}`.toLowerCase();
  if (/\b(minor|min\.|moll|小調)\b/i.test(blob)) return "minor";
  if (/\b(major|メジャー)\b/i.test(blob)) return "major";
  if (/[悲涙寂哀愁]/g.test(lyricsText)) return "minor";
  if (scoreLyricsSentiment(lyricsText) < -0.12) return "minor";
  return "major";
}

export function pickKeyRoot(title: string, artist: string): number {
  return hashString(`${title}\0${artist}`) % 12;
}

export function estimateBpmFromLyricDensity(
  durationSec: number | undefined,
  lineCount: number
): number | null {
  if (!durationSec || durationSec < 8 || lineCount < 2) return null;
  const lpm = (lineCount / durationSec) * 60;
  return clamp(68 + lpm * 5.5, 72, 168);
}

function classifyMoodId(
  bpm: number,
  sentiment: number,
  keyMode: MusicalKeyMode
): string {
  const fast = bpm > 128;
  const slow = bpm < 92;
  const minor = keyMode === "minor";

  if (fast && sentiment > 0.08 && !minor) return "electric_storm";
  if (fast && minor && sentiment <= 0.05) return "neon_rush";
  if (slow && minor && sentiment < -0.02) return "midnight_jazz";
  if (slow && !minor && sentiment > 0.06) return "sunrise_pop";
  if (slow) return "ocean_calm";
  if (sentiment > 0.14) return "sunrise_pop";
  if (sentiment < -0.14) return "ember_glow";
  if (minor && sentiment < 0) return "velvet_blue";
  return "aurora_dream";
}

const MOOD_PALETTES: Record<string, TrackMoodPalette> = {
  electric_storm: {
    colorFront: "#ff2ecd",
    colorMid: "#00e5ff",
    colorBack: "#070014",
    accents: ["#ff2ecd", "#00e5ff", "#ffd000", "#ffffff", "#7c4dff"],
  },
  neon_rush: {
    colorFront: "#ff3b30",
    colorMid: "#5e17eb",
    colorBack: "#05020a",
    accents: ["#ff3b30", "#5e17eb", "#00ffa3", "#2d1b4e"],
  },
  midnight_jazz: {
    colorFront: "#8b9cf4",
    colorMid: "#2a2f55",
    colorBack: "#05060d",
    accents: ["#8b9cf4", "#4c5cbf", "#1e2238", "#9aa7ff"],
  },
  sunrise_pop: {
    colorFront: "#ffb347",
    colorMid: "#ff6b9d",
    colorBack: "#1a0a14",
    accents: ["#ffb347", "#ff6b9d", "#ffe66d", "#ff8fab", "#fff5e6"],
  },
  ocean_calm: {
    colorFront: "#4dd0c3",
    colorMid: "#1e3a5f",
    colorBack: "#040b12",
    accents: ["#4dd0c3", "#2a6f97", "#89c2d9", "#0d1b2a"],
  },
  ember_glow: {
    colorFront: "#ff7a45",
    colorMid: "#6b2d12",
    colorBack: "#0d0604",
    accents: ["#ff7a45", "#c94b1a", "#ffd199", "#3d1810"],
  },
  velvet_blue: {
    colorFront: "#6c8cff",
    colorMid: "#2d3a8c",
    colorBack: "#060814",
    accents: ["#6c8cff", "#9db4ff", "#1b2a6b", "#4e5fc1"],
  },
  aurora_dream: {
    colorFront: "#b388ff",
    colorMid: "#00c2a8",
    colorBack: "#080c18",
    accents: ["#b388ff", "#00c2a8", "#ff6ec7", "#7afcff", "#ffd6ff"],
  },
};

export interface ComputeTrackMoodInput {
  title?: string;
  artist?: string;
  durationSec?: number;
  lyricLines?: LyricLine[];
  /** From live bass peak detection; overrides lyric-density BPM when set */
  liveBpmEstimate?: number | null;
}

export function computeTrackMood(input: ComputeTrackMoodInput): TrackMoodProfile {
  const title = input.title ?? "";
  const artist = input.artist ?? "";
  const lyricsText = joinLyricText(input.lyricLines);
  const sentiment = scoreLyricsSentiment(lyricsText);
  const keyMode = inferKeyMode(title, artist, lyricsText);
  const root = pickKeyRoot(title, artist);
  const keyLabel = `${KEY_NAMES[root]}${keyMode === "minor" ? "m" : ""}`;

  const lineCount = input.lyricLines?.length ?? 0;
  const fromLyrics = estimateBpmFromLyricDensity(input.durationSec, lineCount);
  const fromLive =
    input.liveBpmEstimate != null &&
    Number.isFinite(input.liveBpmEstimate) &&
    input.liveBpmEstimate >= 60 &&
    input.liveBpmEstimate <= 200
      ? input.liveBpmEstimate
      : null;

  const bpmUsed = Math.round(
    fromLive ?? fromLyrics ?? 112 + (hashString(title + artist) % 24)
  );

  const moodId = classifyMoodId(bpmUsed, sentiment, keyMode);
  const palette = MOOD_PALETTES[moodId] ?? MOOD_PALETTES.aurora_dream;

  return {
    moodId,
    bpmUsed,
    keyLabel,
    keyMode,
    sentiment,
    palette,
  };
}
