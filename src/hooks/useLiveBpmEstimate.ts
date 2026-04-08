import { useEffect, useRef, useState } from "react";
import { useAudioReactiveStore } from "@/stores/useAudioReactiveStore";

/**
 * Rough tempo estimate from bass transients (WMP-style live analysis).
 * Works when `usePlaybackAudioReactive` drives the audio store (HTML5 media).
 * Returns null until enough peaks; then updates ~1 Hz.
 */
export function useLiveBpmEstimate(enabled: boolean): number | null {
  const [bpm, setBpm] = useState<number | null>(null);
  const peaksRef = useRef<number[]>([]);
  const lastPeakAtRef = useRef(0);
  const prevBassRef = useRef(0);
  const lastEmitRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      peaksRef.current = [];
      setBpm(null);
      return;
    }

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const bass = useAudioReactiveStore.getState().bass;
      const now = performance.now();
      const prev = prevBassRef.current;
      prevBassRef.current = bass;

      const rising = bass > prev;
      if (
        rising &&
        bass > 0.36 &&
        now - lastPeakAtRef.current > 220 &&
        useAudioReactiveStore.getState().isRealAnalysis
      ) {
        lastPeakAtRef.current = now;
        peaksRef.current.push(now);
        if (peaksRef.current.length > 18) peaksRef.current.shift();

        if (peaksRef.current.length >= 4 && now - lastEmitRef.current > 900) {
          const p = peaksRef.current;
          const diffs: number[] = [];
          for (let i = 1; i < p.length; i++) diffs.push(p[i]! - p[i - 1]!);
          diffs.sort((a, b) => a - b);
          const mid = diffs[Math.floor(diffs.length / 2)] ?? 0;
          if (mid > 180 && mid < 1400) {
            const est = 60000 / mid;
            if (est >= 60 && est <= 200) {
              lastEmitRef.current = now;
              setBpm(Math.round(est));
            }
          }
        }
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);

  return bpm;
}
