import { MeshGradient } from "@paper-design/shaders-react";
import { useShallow } from "zustand/react/shallow";
import { useCoverPalette } from "@/hooks/useCoverPalette";
import { useAudioReactiveStore } from "@/stores/useAudioReactiveStore";
import { useAudioShaderSettingsStore } from "@/stores/useAudioShaderSettingsStore";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";

interface MeshGradientBackgroundProps {
  /** URL of the cover art to derive colors from; falls back to default palette when null */
  coverUrl?: string | null;
  /** Whether the background should be visible */
  isActive?: boolean;
  className?: string;
}

/**
 * Mesh gradient shader background using Paper Design's MeshGradient.
 * StaticMeshGradient does not support animation (its shader has no u_time).
 * MeshGradient animates color blobs and distortion over time.
 * Colors are extracted from cover art when provided.
 */
export function MeshGradientBackground({
  coverUrl = null,
  isActive = true,
  className = "",
}: MeshGradientBackgroundProps) {
  const musicShadersOn = useDisplaySettingsStore(
    (s) => s.musicShaderEffectsEnabled ?? true
  );
  const colors = useCoverPalette(coverUrl ?? null);
  const { energy: e0, bass: b0, mid: m0, beat: bt0 } = useAudioReactiveStore(
    useShallow((s) => ({
      energy: s.energy,
      bass: s.bass,
      mid: s.mid,
      beat: s.beat,
    }))
  );
  const motion = useAudioShaderSettingsStore((s) => s.visualMotion);
  const energy = Math.min(1, e0 * motion);
  const bass = Math.min(1, b0 * motion);
  const mid = Math.min(1, m0 * motion);
  const beat = Math.min(1, bt0 * motion);

  if (!isActive) return null;
  if (!musicShadersOn) {
    return (
      <div
        className={className}
        style={{ width: "100%", height: "100%", background: "linear-gradient(180deg, #0a0a0c 0%, #1a1a22 100%)" }}
      />
    );
  }

  const distortion = 0.38 + energy * 0.22 + bass * 0.12 + beat * 0.2;
  const swirl = 0.2 + energy * 0.35 + mid * 0.1 + beat * 0.18;
  const speed = 1 + energy * 0.9 + bass * 0.25 + beat * 0.55;

  return (
    <div className={className} style={{ width: "100%", height: "100%" }}>
      <MeshGradient
        width="100%"
        height="100%"
        colors={colors}
        distortion={distortion}
        swirl={swirl}
        grainMixer={0.06 + energy * 0.05}
        grainOverlay={0.1 + energy * 0.06}
        speed={speed}
        scale={1.16}
        rotation={90}
      />
    </div>
  );
}
