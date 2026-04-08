import { create } from "zustand";
import { persist } from "zustand/middleware";

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export interface AudioShaderDefaults {
  /** Multiplier for kick / onset strength (FFT path). */
  beatSensitivity: number;
  /** How fast the beat envelope falls off (0.78–0.94). */
  beatTail: number;
  /** AnalyserNode frequency smoothing (0.1–0.95). */
  fftSmoothing: number;
  /** EMA alpha for bass/mid/treble/energy bands (0.15–0.55). */
  bandSmoothing: number;
  /** Scales lyric-timing beat spikes (YouTube / no FFT). */
  lyricPulse: number;
  /** Scales motion from audio in mood shaders and backgrounds. */
  visualMotion: number;
}

/** Defaults match original hardcoded analyzer / beat behavior. */
export const AUDIO_SHADER_DEFAULTS: AudioShaderDefaults = {
  beatSensitivity: 1,
  beatTail: 0.86,
  fftSmoothing: 0.45,
  bandSmoothing: 0.34,
  lyricPulse: 1,
  visualMotion: 1,
};

export interface AudioShaderSettingsState extends AudioShaderDefaults {
  setBeatSensitivity: (v: number) => void;
  setBeatTail: (v: number) => void;
  setFftSmoothing: (v: number) => void;
  setBandSmoothing: (v: number) => void;
  setLyricPulse: (v: number) => void;
  setVisualMotion: (v: number) => void;
  resetToDefaults: () => void;
}

const STORE_VERSION = 1;

export const useAudioShaderSettingsStore = create<AudioShaderSettingsState>()(
  persist(
    (set) => ({
      ...AUDIO_SHADER_DEFAULTS,
      setBeatSensitivity: (v) => set({ beatSensitivity: clamp(v, 0.25, 2) }),
      setBeatTail: (v) => set({ beatTail: clamp(v, 0.78, 0.94) }),
      setFftSmoothing: (v) => set({ fftSmoothing: clamp(v, 0.1, 0.95) }),
      setBandSmoothing: (v) => set({ bandSmoothing: clamp(v, 0.15, 0.55) }),
      setLyricPulse: (v) => set({ lyricPulse: clamp(v, 0.25, 2) }),
      setVisualMotion: (v) => set({ visualMotion: clamp(v, 0.25, 2) }),
      resetToDefaults: () => set({ ...AUDIO_SHADER_DEFAULTS }),
    }),
    {
      name: "ryos:audio-shader-settings",
      version: STORE_VERSION,
      partialize: (s) => ({
        beatSensitivity: s.beatSensitivity,
        beatTail: s.beatTail,
        fftSmoothing: s.fftSmoothing,
        bandSmoothing: s.bandSmoothing,
        lyricPulse: s.lyricPulse,
        visualMotion: s.visualMotion,
      }),
      merge: (persistedState, currentState) => {
        const merged = {
          ...currentState,
          ...(persistedState as Partial<AudioShaderSettingsState> | undefined),
        };
        (Object.keys(AUDIO_SHADER_DEFAULTS) as (keyof AudioShaderDefaults)[]).forEach(
          (key) => {
            const v = merged[key];
            if (typeof v !== "number" || Number.isNaN(v)) {
              (merged as AudioShaderDefaults)[key] = AUDIO_SHADER_DEFAULTS[key];
            }
          }
        );
        return merged;
      },
    }
  )
);
