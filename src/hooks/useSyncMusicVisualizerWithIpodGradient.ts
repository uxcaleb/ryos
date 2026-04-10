import { useLayoutEffect } from "react";
import { useIpodStore } from "@/stores/useIpodStore";
import { useMusicVisualizerAppStore } from "@/stores/useMusicVisualizerAppStore";
import { DisplayMode } from "@/types/lyrics";

/**
 * When iPod Display is set to Gradient or Gradient (oil), the Music Visualizer preset
 * matches the neural-style viz (ring is part of the gradient display, not this app).
 */
export function useSyncMusicVisualizerWithIpodGradient(): void {
  const displayMode = useIpodStore((s) => s.displayMode);
  const setMode = useMusicVisualizerAppStore((s) => s.setMode);

  useLayoutEffect(() => {
    if (displayMode === DisplayMode.Mesh || displayMode === DisplayMode.MeshOil) {
      setMode(DisplayMode.VisualizerNeural);
    }
  }, [displayMode, setMode]);
}
