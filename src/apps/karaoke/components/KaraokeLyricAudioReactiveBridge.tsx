import { useEffect, useMemo, useRef } from "react";
import type { LyricLine } from "@/types/lyrics";
import { useKaraokeStore } from "@/stores/useKaraokeStore";
import { useAudioReactiveStore } from "@/stores/useAudioReactiveStore";
import { useAudioShaderSettingsStore } from "@/stores/useAudioShaderSettingsStore";
import { useKaraokeLyricsPlayback } from "./KaraokeLyricsPlayback";

function flattenLyricEvents(lines: LyricLine[]): number[] {
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

/**
 * When YouTube iframe playback prevents FFT analysis, drive `useAudioReactiveStore` from
 * lyric line / word onset times so visuals still pulse with the vocal.
 */
export function KaraokeLyricAudioReactiveBridge() {
  const { lyricsControls } = useKaraokeLyricsPlayback();
  const lines = lyricsControls.originalLines;
  const events = useMemo(() => flattenLyricEvents(lines), [lines]);
  const smoothingRef = useRef(0);
  const beatRef = useRef(0);
  const lastEmitRef = useRef(0);

  useEffect(() => {
    smoothingRef.current = 0;
    beatRef.current = 0;
  }, [events]);

  useEffect(() => {
    let raf = 0;

    const loop = () => {
      raf = requestAnimationFrame(loop);

      if (useAudioReactiveStore.getState().isRealAnalysis) {
        return;
      }

      const tMs = useKaraokeStore.getState().elapsedTime * 1000;
      let hit = 0;
      for (const e of events) {
        const d = Math.abs(tMs - e);
        if (d < 150) {
          hit = Math.max(hit, 1 - d / 150);
        }
      }
      smoothingRef.current = smoothingRef.current * 0.86 + hit * 0.14;
      const energy = Math.min(1, smoothingRef.current * 1.35);
      const bass = energy * 0.88;
      const mid = energy * 0.68;
      const treble = energy * 0.48;

      beatRef.current *= 0.9;
      const spike = hit * hit;
      const lyricPulse = useAudioShaderSettingsStore.getState().lyricPulse;
      beatRef.current = Math.min(
        1,
        beatRef.current + (spike * 1.1 + (hit > 0.88 ? 0.4 : 0)) * lyricPulse
      );

      const now = performance.now();
      if (now - lastEmitRef.current < 32) return;
      lastEmitRef.current = now;

      useAudioReactiveStore.getState().setFromLyrics({
        bass,
        mid,
        treble,
        energy,
        beat: beatRef.current,
      });
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [events]);

  return null;
}
