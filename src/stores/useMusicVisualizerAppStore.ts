import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DisplayMode } from "@/types/lyrics";

export type MusicVisualizerMode =
  | DisplayMode.VisualizerNeural
  | DisplayMode.VisualizerBlobs
  | DisplayMode.VisualizerSwirl;

interface MusicVisualizerAppState {
  mode: MusicVisualizerMode;
  setMode: (mode: MusicVisualizerMode) => void;
}

const STORE_VERSION = 1;

export const useMusicVisualizerAppStore = create<MusicVisualizerAppState>()(
  persist(
    (set) => ({
      mode: DisplayMode.VisualizerNeural,
      setMode: (mode) => set({ mode }),
    }),
    {
      name: "ryos:music-visualizer-app",
      version: STORE_VERSION,
      partialize: (s) => ({ mode: s.mode }),
      merge: (persistedState, currentState) => {
        const merged = {
          ...currentState,
          ...(persistedState as Partial<MusicVisualizerAppState> | undefined),
        };
        const valid = new Set<MusicVisualizerMode>([
          DisplayMode.VisualizerNeural,
          DisplayMode.VisualizerBlobs,
          DisplayMode.VisualizerSwirl,
        ]);
        if (!merged.mode || !valid.has(merged.mode)) {
          merged.mode = DisplayMode.VisualizerNeural;
        }
        return merged;
      },
    }
  )
);
