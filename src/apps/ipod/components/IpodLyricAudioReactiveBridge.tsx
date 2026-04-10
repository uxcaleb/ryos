import { useEffect, useMemo, useRef } from "react";
import { useIpodStore } from "@/stores/useIpodStore";
import { useAudioReactiveStore } from "@/stores/useAudioReactiveStore";
import { useAudioShaderSettingsStore } from "@/stores/useAudioShaderSettingsStore";
import { flattenLyricEvents } from "@/utils/lyricVisualizationEvents";

/**
 * When YouTube iframe playback prevents FFT analysis, drive `useAudioReactiveStore` from
 * iPod lyric line / word onsets so the neural / mood shaders still pulse with the vocal.
 */
export function IpodLyricAudioReactiveBridge() {
  const lines = useIpodStore((s) => s.currentLyrics?.lines);
  const events = useMemo(
    () => (lines?.length ? flattenLyricEvents(lines) : []),
    [lines],
  );
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

      if (events.length === 0) {
        return;
      }

      const s = useIpodStore.getState();
      if (!s.isPlaying) return;

      const track = s.tracks.find((t) => t.id === s.currentSongId) ?? s.tracks[0];
      const offsetMs = track?.lyricOffset ?? 0;
      const tMs = s.elapsedTime * 1000 + offsetMs;

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
        beatRef.current + (spike * 1.1 + (hit > 0.88 ? 0.4 : 0)) * lyricPulse,
      );

      const now = performance.now();
      if (now - lastEmitRef.current < 16) return;
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
