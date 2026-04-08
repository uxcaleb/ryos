import type { Track } from "@/stores/useIpodStore";
import { DisplayMode } from "@/types/lyrics";
import { MoodShaderVisualizer } from "@/components/shared/MoodShaderVisualizer";
import { useTrackMoodProfile } from "@/hooks/useTrackMoodProfile";
import { useKaraokeLyricsPlayback } from "./KaraokeLyricsPlayback";

interface KaraokeMoodShaderBlockProps {
  displayMode: DisplayMode;
  currentTrack: Track | null;
  coverUrl: string | null;
  duration: number;
  shouldAnimateVisuals: boolean;
  className?: string;
}

export function KaraokeMoodShaderBlock({
  displayMode,
  currentTrack,
  coverUrl,
  duration,
  shouldAnimateVisuals,
  className = "",
}: KaraokeMoodShaderBlockProps) {
  const { lyricsControls } = useKaraokeLyricsPlayback();

  const mood = useTrackMoodProfile({
    title: currentTrack?.title,
    artist: currentTrack?.artist,
    durationSec: duration,
    lyricLines: lyricsControls.originalLines,
    isPlaybackActive: shouldAnimateVisuals && !!currentTrack,
  });

  const isMoodMode =
    displayMode === DisplayMode.VisualizerNeural ||
    displayMode === DisplayMode.VisualizerBlobs ||
    displayMode === DisplayMode.VisualizerSwirl;

  if (!isMoodMode || !currentTrack) return null;

  return (
    <MoodShaderVisualizer
      mode={displayMode}
      mood={mood}
      isActive={shouldAnimateVisuals}
      coverUrl={coverUrl}
      className={className}
    />
  );
}
