import type { Track } from "@/stores/useIpodStore";
import { useSvgOutlineVisualizerStore } from "@/stores/useSvgOutlineVisualizerStore";
import { DisplayMode, isMeshLikeDisplayMode } from "@/types/lyrics";
import {
  SvgOutlineRingVisualizer,
  type SvgOutlineRingAppearance,
} from "@/components/shared/SvgOutlineRingVisualizer";
import { useTrackMoodProfile } from "@/hooks/useTrackMoodProfile";
import {
  coverPaletteToNeuroTriple,
  useCoverPaletteForNeural,
} from "@/hooks/useCoverPalette";
import { useMemo } from "react";
import { useLerpedVisualizerPalette } from "@/hooks/useVisualizerColorTransition";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { useShallow } from "zustand/react/shallow";
import { useKaraokeLyricsPlayback } from "./KaraokeLyricsPlayback";
import {
  buildSvgRingDrawPalette,
  svgRingPaletteInputKey,
} from "@/utils/svgRingVisualizerPalette";

interface KaraokeSvgOutlineRingBlockProps {
  displayMode: DisplayMode;
  currentTrack: Track | null;
  coverUrl: string | null;
  duration: number;
  shouldAnimateVisuals: boolean;
  className?: string;
  appearance?: SvgOutlineRingAppearance;
}

export function KaraokeSvgOutlineRingBlock({
  displayMode,
  currentTrack,
  coverUrl,
  duration,
  shouldAnimateVisuals,
  className = "",
  appearance = "lightMono",
}: KaraokeSvgOutlineRingBlockProps) {
  const { lyricsControls } = useKaraokeLyricsPlayback();
  const { paths, viewBox, outlineRevision } = useSvgOutlineVisualizerStore(
    useShallow((s) => ({
      paths: s.paths,
      viewBox: s.viewBox,
      outlineRevision: `${s.activeEntryId}|${s.sourceLabel ?? ""}|${s.viewBox.join(",")}|${s.paths.join("\u001e")}`,
    })),
  );
  const musicShadersOn = useDisplaySettingsStore((s) => s.musicShaderEffectsEnabled ?? true);

  const mood = useTrackMoodProfile({
    title: currentTrack?.title,
    artist: currentTrack?.artist,
    durationSec: duration,
    lyricLines: lyricsControls.originalLines,
    isPlaybackActive: shouldAnimateVisuals && !!currentTrack,
  });

  const coverPalette = useCoverPaletteForNeural(coverUrl);
  const p = useMemo(() => {
    if (coverPalette && coverPalette.length >= 3) {
      return {
        ...mood.palette,
        ...coverPaletteToNeuroTriple(coverPalette),
      };
    }
    return mood.palette;
  }, [coverPalette, mood.palette]);

  const pRender = useLerpedVisualizerPalette(p, {
    enabled: musicShadersOn && shouldAnimateVisuals,
  });

  const ringDraw = useMemo(
    () => buildSvgRingDrawPalette(pRender),
    [svgRingPaletteInputKey(pRender)],
  );

  if (!isMeshLikeDisplayMode(displayMode) || !currentTrack) return null;

  return (
    <SvgOutlineRingVisualizer
      key={outlineRevision}
      paths={paths}
      viewBox={viewBox}
      isActive={shouldAnimateVisuals}
      colorFront={ringDraw.colorFront}
      colorMid={ringDraw.colorMid}
      colorBack={ringDraw.colorBack}
      colorGlow={ringDraw.colorGlow}
      className={className}
      appearance={appearance}
    />
  );
}
