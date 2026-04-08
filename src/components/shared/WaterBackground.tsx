import { Water } from "@paper-design/shaders-react";
import { useShallow } from "zustand/react/shallow";
import { useAudioReactiveStore } from "@/stores/useAudioReactiveStore";
import { useAudioShaderSettingsStore } from "@/stores/useAudioShaderSettingsStore";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";

interface WaterBackgroundProps {
  /** URL of the cover art to use as the base image */
  coverUrl?: string | null;
  /** Whether the background should be visible */
  isActive?: boolean;
  className?: string;
}

/**
 * Water shader background using Paper Design's Water.
 * Renders cover art with caustic/water effect overlay.
 */
export function WaterBackground({
  coverUrl = null,
  isActive = true,
  className = "",
}: WaterBackgroundProps) {
  const musicShadersOn = useDisplaySettingsStore(
    (s) => s.musicShaderEffectsEnabled ?? true
  );
  const { energy: e0, bass: b0, beat: bt0 } = useAudioReactiveStore(
    useShallow((s) => ({ energy: s.energy, bass: s.bass, beat: s.beat }))
  );
  const motion = useAudioShaderSettingsStore((s) => s.visualMotion);
  const energy = Math.min(1, e0 * motion);
  const bass = Math.min(1, b0 * motion);
  const beat = Math.min(1, bt0 * motion);

  if (!isActive || !coverUrl) return null;

  if (!musicShadersOn) {
    return (
      <div
        className={className}
        style={{ width: "100%", height: "100%", background: "linear-gradient(180deg, #0c0c10 0%, #1c1c24 100%)" }}
      />
    );
  }

  return (
    <div className={className} style={{ width: "100%", height: "100%" }}>
      <Water
        width="100%"
        height="100%"
        image={coverUrl}
        colorBack="#8f8f8f"
        colorHighlight="#ffffff"
        highlights={0.4 + energy * 0.15 + beat * 0.2}
        layering={energy * 0.12 + beat * 0.1}
        edges={energy * 0.08 + beat * 0.12}
        waves={energy * 0.85 + beat * 0.45}
        caustic={0.2 + energy * 0.45 + bass * 0.18 + beat * 0.25}
        size={0.7 - energy * 0.1 - beat * 0.04}
        speed={0.5 + energy * 0.75 + beat * 0.55}
        scale={1}
        fit="cover"
      />
    </div>
  );
}
