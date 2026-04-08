import { useEffect, useRef } from "react";
import type ReactPlayer from "react-player";
import { getAudioContext, resumeAudioContext } from "@/lib/audioContext";
import { useAudioReactiveStore } from "@/stores/useAudioReactiveStore";
import { useAudioShaderSettingsStore } from "@/stores/useAudioShaderSettingsStore";

const analyserByMedia = new WeakMap<HTMLMediaElement, AnalyserNode>();
const mediaSourceFailed = new WeakSet<HTMLMediaElement>();

function findHtmlMedia(internal: unknown): HTMLMediaElement | null {
  if (internal instanceof HTMLVideoElement || internal instanceof HTMLAudioElement) {
    return internal;
  }
  return null;
}

function getOrCreateAnalyser(media: HTMLMediaElement): AnalyserNode | null {
  if (mediaSourceFailed.has(media)) return null;
  const existing = analyserByMedia.get(media);
  if (existing) return existing;
  try {
    const ctx = getAudioContext();
    const source = ctx.createMediaElementSource(media);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant =
      useAudioShaderSettingsStore.getState().fftSmoothing;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    analyserByMedia.set(media, analyser);
    return analyser;
  } catch {
    mediaSourceFailed.add(media);
    return null;
  }
}

function bandAverage(data: Uint8Array, start: number, end: number): number {
  let sum = 0;
  for (let i = start; i < end; i++) sum += data[i];
  return sum / (end - start) / 255;
}

function smooth(prev: number, next: number, alpha: number): number {
  return prev * (1 - alpha) + next * alpha;
}

export type AmbientFallbackMode = "none" | "breath";

interface UsePlaybackAudioReactiveOptions {
  url: string | undefined;
  isPlaying: boolean;
  isFullScreen: boolean;
  windowPlayerRef: React.RefObject<ReactPlayer | null>;
  fullScreenPlayerRef: React.RefObject<ReactPlayer | null>;
  /** Karaoke uses lyrics-based pulses for YouTube; iPod uses subtle motion when FFT is unavailable. */
  ambientFallback: AmbientFallbackMode;
}

const BEAT_ONSET_BASE = 7.5;

/**
 * Drives `useAudioReactiveStore` from Web Audio when the active ReactPlayer uses an HTML5
 * media element. Emits every animation frame when FFT is active (smooth beat decay).
 * YouTube iframe playback cannot be analyzed; use `KaraokeLyricAudioReactiveBridge` or
 * `ambientFallback: "breath"` instead.
 */
export function usePlaybackAudioReactive({
  url,
  isPlaying,
  isFullScreen,
  windowPlayerRef,
  fullScreenPlayerRef,
  ambientFallback,
}: UsePlaybackAudioReactiveOptions): void {
  const smoothedRef = useRef({ bass: 0, mid: 0, treble: 0, energy: 0, beat: 0 });
  const prevLowRef = useRef(0);
  const prevMidRef = useRef(0);
  const lastBreathEmitRef = useRef(0);

  useEffect(() => {
    useAudioReactiveStore.getState().reset();
    smoothedRef.current = { bass: 0, mid: 0, treble: 0, energy: 0, beat: 0 };
    prevLowRef.current = 0;
    prevMidRef.current = 0;
  }, [url]);

  useEffect(() => {
    if (!isPlaying) {
      useAudioReactiveStore.getState().reset();
      smoothedRef.current = { bass: 0, mid: 0, treble: 0, energy: 0, beat: 0 };
      prevLowRef.current = 0;
      prevMidRef.current = 0;
      return;
    }

    let raf = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);

      const active =
        (isFullScreen ? fullScreenPlayerRef.current : windowPlayerRef.current) ?? null;
      const internal = active?.getInternalPlayer?.();
      const media = findHtmlMedia(internal);

      if (media) {
        void resumeAudioContext();
        const analyser = getOrCreateAnalyser(media);
        if (analyser) {
          const shaderAudio = useAudioShaderSettingsStore.getState();
          analyser.smoothingTimeConstant = shaderAudio.fftSmoothing;
          const BEAT_DECAY = shaderAudio.beatTail;
          const BEAT_ONSET_GAIN = BEAT_ONSET_BASE * shaderAudio.beatSensitivity;
          const alpha = shaderAudio.bandSmoothing;
          const bins = analyser.frequencyBinCount;
          const data = new Uint8Array(bins);
          analyser.getByteFrequencyData(data);
          const n = bins;
          const bass = bandAverage(data, 0, Math.min(12, n));
          const mid = bandAverage(data, Math.min(12, n), Math.min(48, n));
          const treble = bandAverage(data, Math.min(48, n), n);
          const rawEnergy = (bass * 1.15 + mid * 0.95 + treble * 0.75) / 2.85;

          const lowBand = bandAverage(data, 0, Math.min(8, n));
          const midBand = bandAverage(data, Math.min(8, n), Math.min(32, n));
          const lowDelta = Math.max(0, lowBand - prevLowRef.current);
          const midDelta = Math.max(0, midBand - prevMidRef.current);
          prevLowRef.current = lowBand;
          prevMidRef.current = midBand;

          const onset = lowDelta * 1.25 + midDelta * 0.45;
          const s = smoothedRef.current;
          s.bass = smooth(s.bass, bass, alpha);
          s.mid = smooth(s.mid, mid, alpha);
          s.treble = smooth(s.treble, treble, alpha);
          s.energy = smooth(s.energy, rawEnergy, alpha);
          s.beat = Math.min(
            1,
            s.beat * BEAT_DECAY + onset * BEAT_ONSET_GAIN + (onset > 0.12 ? onset * 2 : 0)
          );

          useAudioReactiveStore.getState().setFromFft({
            bass: s.bass,
            mid: s.mid,
            treble: s.treble,
            energy: s.energy,
            beat: s.beat,
          });
          return;
        }
      }

      if (
        ambientFallback === "breath" &&
        now - lastBreathEmitRef.current >= 1000 / 24
      ) {
        lastBreathEmitRef.current = now;
        const t = now / 1000;
        const wobble =
          0.09 * Math.sin(t * 2.4) * Math.sin(t * 0.41) + 0.05 * Math.sin(t * 5.1 + 1.2);
        const energy = Math.min(1, Math.max(0, 0.1 + wobble));
        const beat = Math.min(1, energy * 1.05 + Math.abs(Math.cos(t * 4.2)) * 0.08);
        useAudioReactiveStore.getState().setAmbientFallback({
          bass: energy * 0.75,
          mid: energy * 0.55,
          treble: energy * 0.4,
          energy,
          beat,
        });
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [
    isPlaying,
    isFullScreen,
    url,
    windowPlayerRef,
    fullScreenPlayerRef,
    ambientFallback,
  ]);
}
