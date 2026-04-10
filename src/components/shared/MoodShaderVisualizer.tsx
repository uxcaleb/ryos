import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { GodRays, NeuroNoise, Swirl } from "@paper-design/shaders-react";
import { useAudioReactiveStore } from "@/stores/useAudioReactiveStore";
import { useAudioShaderSettingsStore } from "@/stores/useAudioShaderSettingsStore";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import {
  coverPaletteToNeuroTriple,
  useCoverPaletteForNeural,
} from "@/hooks/useCoverPalette";
import { useLerpedVisualizerPalette } from "@/hooks/useVisualizerColorTransition";
import type { TrackMoodProfile } from "@/utils/trackMood";
import { DisplayMode } from "@/types/lyrics";
import { cn } from "@/lib/utils";
import { DiscoBallOverlay } from "@/components/shared/DiscoBallOverlay";

interface MoodShaderVisualizerProps {
  mode:
    | DisplayMode.VisualizerNeural
    | DisplayMode.VisualizerBlobs
    | DisplayMode.VisualizerSwirl;
  mood: TrackMoodProfile;
  isActive: boolean;
  /** When set, the neural shader tints from this cover image; blobs/swirl still use mood palettes. */
  coverUrl?: string | null;
  className?: string;
}

/**
 * Neural field: higher `scale` = finer ripple detail (Paper Shaders pattern UV).
 * Audio widens the range so kicks visibly “punch” the wave lattice.
 */
const NEURAL_VIEW_SCALE = 0.88;
const NEURAL_SCALE_MIN = 0.72;
const NEURAL_SCALE_MAX = 1.22;

/**
 * Mood shaders: palettes from {@link computeTrackMood}, with optional cover-derived tints for the neural look.
 * Neural mode: steady rotation, gentle scale sway + beat punch, flow from `speed` plus brightness/contrast.
 */
export function MoodShaderVisualizer({
  mode,
  mood,
  isActive,
  coverUrl = null,
  className = "",
}: MoodShaderVisualizerProps) {
  const musicShadersOn = useDisplaySettingsStore(
    (s) => s.musicShaderEffectsEnabled ?? true
  );
  const { energy: e0, bass: b0, mid: m0, treble: t0, beat: bt0 } = useAudioReactiveStore(
    useShallow((s) => ({
      energy: s.energy,
      bass: s.bass,
      mid: s.mid,
      treble: s.treble,
      beat: s.beat,
    }))
  );
  const motion = useAudioShaderSettingsStore((s) => s.visualMotion);
  const coverPalette = useCoverPaletteForNeural(coverUrl);
  const p = useMemo(() => {
    if (mode === DisplayMode.VisualizerNeural && coverPalette && coverPalette.length >= 3) {
      return {
        ...mood.palette,
        ...coverPaletteToNeuroTriple(coverPalette),
      };
    }
    return mood.palette;
  }, [mode, coverPalette, mood.palette]);

  const pRender = useLerpedVisualizerPalette(p, {
    enabled: musicShadersOn && isActive,
  });

  if (!musicShadersOn) return null;

  const energy = Math.min(1, e0 * motion);
  const bass = Math.min(1, b0 * motion);
  const mid = Math.min(1, m0 * motion);
  const treble = Math.min(1, t0 * motion);
  const beat = Math.min(1, bt0 * motion);

  if (!isActive) return null;

  const punch = beat;
  /** Snappier emphasis on downbeats (strong hits pop more than soft tails). */
  const beatAccent = Math.min(1, punch * 1.35 + punch * punch * 0.62);
  const react = energy * 0.72 + bass * 0.34 + beat * 0.62;

  if (mode === DisplayMode.VisualizerNeural) {
    // Shader: noise = (1 + brightness) * noise², then pow(noise, .7 + 6 * contrast) — lift both for a bright Apple-style field with readable ridges.
    const waveSpeed = Math.min(
      12,
      1.05 +
        energy * 1.35 +
        bass * 1.75 +
        mid * 1.05 +
        treble * 0.82 +
        beatAccent * 3.1
    );

    const neuralScale = Math.min(
      NEURAL_SCALE_MAX,
      Math.max(
        NEURAL_SCALE_MIN,
        NEURAL_VIEW_SCALE +
          bass * 0.095 +
          energy * 0.055 +
          mid * 0.038 +
          treble * 0.028 +
          beatAccent * 0.14
      )
    );

    const brightness = Math.min(
      0.62,
      0.3 +
        energy * 0.42 +
        treble * 0.24 +
        mid * 0.12 +
        bass * 0.1 +
        beatAccent * 0.52
    );
    const contrast = Math.min(
      0.92,
      0.38 +
        mid * 0.58 +
        bass * 0.38 +
        treble * 0.2 +
        beatAccent * 0.42
    );

    return (
      <div
        className={cn(className, "relative")}
        style={{ width: "100%", height: "100%" }}
      >
        <div className="absolute inset-0">
          <NeuroNoise
            width="100%"
            height="100%"
            colorFront={pRender.colorFront}
            colorMid={pRender.colorMid}
            colorBack={pRender.colorBack}
            brightness={brightness}
            contrast={contrast}
            speed={waveSpeed}
            scale={neuralScale}
            rotation={bass * 16 + beatAccent * 38 + mid * 9 + treble * 5}
            offsetX={bass * 0.045 - treble * 0.022}
            offsetY={beatAccent * 0.052 - mid * 0.028}
            minPixelRatio={2}
          />
        </div>
        <DiscoBallOverlay />
      </div>
    );
  }

  if (mode === DisplayMode.VisualizerBlobs) {
    const rayColors = pRender.accents.slice(0, 5);
    const colors = rayColors.length ? rayColors : [pRender.colorFront, pRender.colorMid, pRender.colorBack];
    return (
      <div className={className} style={{ width: "100%", height: "100%" }}>
        <GodRays
          width="100%"
          height="100%"
          colorBack={pRender.colorBack}
          colorBloom={pRender.colorMid}
          colors={colors}
          intensity={Math.min(1, 0.38 + punch * 0.52 + energy * 0.18)}
          midIntensity={Math.min(1, 0.26 + punch * 0.62 + energy * 0.12)}
          midSize={Math.min(1, Math.max(0.08, 0.2 + energy * 0.14 - punch * 0.06))}
          density={Math.min(1, 0.2 + mid * 0.32 + punch * 0.42)}
          spotty={Math.min(1, Math.max(0.05, 0.42 - punch * 0.28 + treble * 0.08))}
          bloom={Math.min(1, 0.32 + punch * 0.48 + energy * 0.12)}
          speed={0.5 + punch * 1.55 + energy * 0.45}
          scale={1.04 + punch * 0.18 + bass * 0.06}
          rotation={punch * 18 + mid * 6}
          offsetY={-0.08}
        />
      </div>
    );
  }

  const swirlColors = [...pRender.accents, pRender.colorMid, pRender.colorFront].slice(0, 10);
  const bands = Math.round(3 + energy * 10 + bass * 3 + punch * 4);
  return (
    <div className={className} style={{ width: "100%", height: "100%" }}>
      <Swirl
        width="100%"
        height="100%"
        colorBack={pRender.colorBack}
        colors={swirlColors}
        bandCount={Math.min(15, Math.max(0, bands))}
        twist={Math.min(1, 0.22 + energy * 0.5 + mid * 0.18 + punch * 0.35)}
        center={Math.min(1, 0.32 + treble * 0.28 + punch * 0.12)}
        proportion={Math.min(1, 0.42 + bass * 0.22 + punch * 0.15)}
        softness={Math.min(1, 0.32 + mid * 0.32 + (1 - punch) * 0.08)}
        noise={Math.min(1, 0.1 + energy * 0.5 + punch * 0.35)}
        noiseFrequency={Math.min(1, 0.16 + treble * 0.42 + punch * 0.12)}
        speed={0.52 + react * 1.15 + punch * 0.85}
        scale={1.03 + bass * 0.14 + punch * 0.12}
        rotation={energy * 22 + punch * 35}
      />
    </div>
  );
}
