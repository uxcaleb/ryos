import type { LyricLine } from "@/types/lyrics";

/** Sorted onset times (ms) from lyric lines and word timings — for visual pulses when FFT is unavailable. */
export function flattenLyricEvents(lines: LyricLine[]): number[] {
  const events: number[] = [];
  for (const line of lines) {
    const lineStart = parseInt(line.startTimeMs, 10);
    if (!Number.isFinite(lineStart)) continue;
    events.push(lineStart);
    if (line.wordTimings) {
      for (const w of line.wordTimings) {
        events.push(lineStart + w.startTimeMs);
      }
    }
  }
  return events.sort((a, b) => a - b);
}
