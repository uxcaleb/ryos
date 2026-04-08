import type { Track } from "@/stores/useIpodStore";
import { useIpodStore } from "@/stores/useIpodStore";
import { DisplayMode } from "@/types/lyrics";
import { MoodShaderVisualizer } from "@/components/shared/MoodShaderVisualizer";
import { useTrackMoodProfile } from "@/hooks/useTrackMoodProfile";

interface IpodMoodShaderBlockProps {
  displayMode: DisplayMode;
  currentTrack: Track | null;
  /** Resolved cover image URL (Kugou or YouTube thumbnail) for neural shader tinting */
  coverUrl: string | null;
  durationSec: number;
  shouldAnimateVisuals: boolean;
  className?: string;
}

export function IpodMoodShaderBlock({
  displayMode,
  currentTrack,
  coverUrl,
  durationSec,
  shouldAnimateVisuals,
  className = "",
}: IpodMoodShaderBlockProps) {
  const lyricLines = useIpodStore((s) => s.currentLyrics?.lines);

  const mood = useTrackMoodProfile({
    title: currentTrack?.title,
    artist: currentTrack?.artist,
    durationSec,
    lyricLines,
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
