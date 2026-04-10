import { useEffect, useRef } from "react";
import type ReactPlayer from "react-player";
import { getAudioContext, resumeAudioContext } from "@/lib/audioContext";
import { useAudioReactiveStore } from "@/stores/useAudioReactiveStore";
import { useAudioShaderSettingsStore } from "@/stores/useAudioShaderSettingsStore";

interface PlaybackAudioGraph {
  analyser: AnalyserNode;
  gain: GainNode;
}

const graphByMedia = new WeakMap<HTMLMediaElement, PlaybackAudioGraph>();
const mediaSourceFailed = new WeakSet<HTMLMediaElement>();

function findHtmlMedia(internal: unknown): HTMLMediaElement | null {
  if (internal instanceof HTMLVideoElement || internal instanceof HTMLAudioElement) {
    return internal;
  }
  return null;
}

/** Larger FFT → finer bass/mid separation for wave motion. */
const ANALYSER_FFT_SIZE = 2048;

function getOrCreatePlaybackGraph(media: HTMLMediaElement): PlaybackAudioGraph | null {
  if (mediaSourceFailed.has(media)) return null;
  const existing = graphByMedia.get(media);
  if (existing) return existing;
  try {
    const ctx = getAudioContext();
    const source = ctx.createMediaElementSource(media);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = ANALYSER_FFT_SIZE;
    analyser.smoothingTimeConstant =
      useAudioShaderSettingsStore.getState().fftSmoothing;
    const gain = ctx.createGain();
    gain.gain.value = 1;
    source.connect(analyser);
    analyser.connect(gain);
    gain.connect(ctx.destination);
    const graph = { analyser, gain };
    graphByMedia.set(media, graph);
    return graph;
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
  /**
   * Same-origin HTML5 audio used for YouTube (see `/api/youtube-audio-proxy`).
   * When set and ready, FFT reads from this element instead of the ReactPlayer iframe.
   */
  analysisMediaRef?: React.RefObject<HTMLMediaElement | null>;
  /** 0–1 master output level for the Web Audio graph (parallel tap / file path). */
  getPlaybackVolume?: () => number;
}

const BEAT_ONSET_BASE = 7.5;

/**
 * Drives `useAudioReactiveStore` from Web Audio when the active ReactPlayer uses an HTML5
 * media element. Emits every animation frame when FFT is active (smooth beat decay).
 * YouTube iframe playback cannot be analyzed unless a parallel same-origin HTML5 tap is used
 * (`analysisMediaRef`). Otherwise use `KaraokeLyricAudioReactiveBridge` or `ambientFallback: "breath"`.
 */
export function usePlaybackAudioReactive({
  url,
  isPlaying,
  isFullScreen,
  windowPlayerRef,
  fullScreenPlayerRef,
  ambientFallback,
  analysisMediaRef,
  getPlaybackVolume,
}: UsePlaybackAudioReactiveOptions): void {
  const smoothedRef = useRef({ bass: 0, mid: 0, treble: 0, energy: 0, beat: 0 });
  const prevLowRef = useRef(0);
  const prevMidRef = useRef(0);
  const prevSpectrumRef = useRef<Uint8Array | null>(null);
  const lastBreathEmitRef = useRef(0);

  useEffect(() => {
    useAudioReactiveStore.getState().reset();
    smoothedRef.current = { bass: 0, mid: 0, treble: 0, energy: 0, beat: 0 };
    prevLowRef.current = 0;
    prevMidRef.current = 0;
    prevSpectrumRef.current = null;
  }, [url]);

  useEffect(() => {
    if (!isPlaying) {
      useAudioReactiveStore.getState().reset();
      smoothedRef.current = { bass: 0, mid: 0, treble: 0, energy: 0, beat: 0 };
      prevLowRef.current = 0;
      prevMidRef.current = 0;
      prevSpectrumRef.current = null;
      return;
    }

    let raf = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);

      const override = analysisMediaRef?.current;
      const overrideOk =
        override &&
        !override.error &&
        override.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;

      const active =
        (isFullScreen ? fullScreenPlayerRef.current : windowPlayerRef.current) ?? null;
      const internal = active?.getInternalPlayer?.();
      const mediaFromPlayer = findHtmlMedia(internal);
      const media = overrideOk ? override : mediaFromPlayer;

      if (media) {
        void resumeAudioContext();
        const graph = getOrCreatePlaybackGraph(media);
        if (graph) {
          const { analyser, gain } = graph;
          const vol = getPlaybackVolume?.() ?? 1;
          gain.gain.value = Math.min(1, Math.max(0, vol));
          const shaderAudio = useAudioShaderSettingsStore.getState();
          analyser.smoothingTimeConstant = shaderAudio.fftSmoothing;
          if (analyser.fftSize !== ANALYSER_FFT_SIZE) {
            analyser.fftSize = ANALYSER_FFT_SIZE;
          }
          const BEAT_DECAY = shaderAudio.beatTail;
          const BEAT_ONSET_GAIN = BEAT_ONSET_BASE * shaderAudio.beatSensitivity;
          const alpha = shaderAudio.bandSmoothing;
          const bins = analyser.frequencyBinCount;
          const data = new Uint8Array(bins);
          analyser.getByteFrequencyData(data);

          let prev = prevSpectrumRef.current;
          if (!prev || prev.length !== bins) {
            prev = new Uint8Array(bins);
            prev.set(data);
            prevSpectrumRef.current = prev;
          }
          let fluxSum = 0;
          for (let i = 0; i < bins; i++) {
            const d = data[i]! - prev[i]!;
            if (d > 0) fluxSum += d;
          }
          prev.set(data);
          const spectralFlux = Math.min(1, fluxSum / (bins * 28));

          const n = bins;
          const bassEnd = Math.min(18, n);
          const midEnd = Math.min(56, n);
          const bass = bandAverage(data, 0, bassEnd);
          const mid = bandAverage(data, bassEnd, midEnd);
          const treble = bandAverage(data, midEnd, n);
          const rawEnergy = (bass * 1.15 + mid * 0.95 + treble * 0.75) / 2.85;

          const lowBand = bandAverage(data, 0, Math.min(10, n));
          const midBand = bandAverage(data, Math.min(10, n), Math.min(40, n));
          const lowDelta = Math.max(0, lowBand - prevLowRef.current);
          const midDelta = Math.max(0, midBand - prevMidRef.current);
          prevLowRef.current = lowBand;
          prevMidRef.current = midBand;

          const onset = lowDelta * 1.35 + midDelta * 0.55 + spectralFlux * 0.42;
          const alphaBoost = Math.min(0.94, alpha + spectralFlux * 0.62 + onset * 0.35);
          const s = smoothedRef.current;
          s.bass = smooth(s.bass, bass, alphaBoost);
          s.mid = smooth(s.mid, mid, alphaBoost);
          s.treble = smooth(s.treble, treble, alphaBoost);
          s.energy = smooth(s.energy, rawEnergy, alphaBoost);
          s.beat = Math.min(
            1,
            s.beat * BEAT_DECAY +
              onset * BEAT_ONSET_GAIN * (1 + spectralFlux * 0.85) +
              (onset > 0.1 ? onset * 2.2 : 0) +
              spectralFlux * 0.55 * BEAT_ONSET_GAIN,
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

      if (ambientFallback === "breath" && now - lastBreathEmitRef.current >= 1000 / 60) {
        lastBreathEmitRef.current = now;
        const t = now / 1000;
        const wobble =
          0.14 * Math.sin(t * 2.4) * Math.sin(t * 0.41) +
          0.09 * Math.sin(t * 5.1 + 1.2) +
          0.06 * Math.sin(t * 8.2 + 0.3);
        const energy = Math.min(1, Math.max(0.12, 0.22 + wobble));
        const beat = Math.min(
          1,
          energy * 1.12 + Math.abs(Math.cos(t * 4.2)) * 0.14 + Math.abs(Math.sin(t * 6.8)) * 0.08,
        );
        useAudioReactiveStore.getState().setAmbientFallback({
          bass: energy * 0.82,
          mid: energy * 0.62,
          treble: energy * 0.48,
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
    analysisMediaRef,
    getPlaybackVolume,
  ]);
}
