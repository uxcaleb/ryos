import { create } from "zustand";

export interface AudioReactiveBands {
  bass: number;
  mid: number;
  treble: number;
  energy: number;
  /** 0–1 transient envelope: spikes on kick / spectral onsets (beat-synced motion). */
  beat: number;
}

interface AudioReactiveState extends AudioReactiveBands {
  /** True when levels come from Web Audio FFT (HTML5 video/audio). */
  isRealAnalysis: boolean;
  setFromFft: (bands: AudioReactiveBands) => void;
  setFromLyrics: (bands: AudioReactiveBands) => void;
  setAmbientFallback: (bands: AudioReactiveBands) => void;
  reset: () => void;
}

const INITIAL: AudioReactiveBands & { isRealAnalysis: boolean } = {
  bass: 0,
  mid: 0,
  treble: 0,
  energy: 0,
  beat: 0,
  isRealAnalysis: false,
};

export const useAudioReactiveStore = create<AudioReactiveState>((set) => ({
  ...INITIAL,
  setFromFft: (bands) =>
    set({
      ...bands,
      isRealAnalysis: true,
    }),
  setFromLyrics: (bands) =>
    set((s) =>
      s.isRealAnalysis
        ? s
        : {
            ...bands,
            isRealAnalysis: false,
          }
    ),
  setAmbientFallback: (bands) =>
    set((s) =>
      s.isRealAnalysis
        ? s
        : {
            ...bands,
            isRealAnalysis: false,
          }
    ),
  reset: () => set(INITIAL),
}));
