import { useMemo } from "react";
import type { LyricLine } from "@/types/lyrics";
import { computeTrackMood, type TrackMoodProfile } from "@/utils/trackMood";
import { useLiveBpmEstimate } from "@/hooks/useLiveBpmEstimate";

interface UseTrackMoodProfileArgs {
  title?: string;
  artist?: string;
  durationSec?: number;
  lyricLines?: LyricLine[];
  /** When false, BPM estimation pauses */
  isPlaybackActive: boolean;
}

export function useTrackMoodProfile({
  title,
  artist,
  durationSec,
  lyricLines,
  isPlaybackActive,
}: UseTrackMoodProfileArgs): TrackMoodProfile {
  const liveBpm = useLiveBpmEstimate(isPlaybackActive);

  const lyricsFingerprint = useMemo(() => {
    if (!lyricLines?.length) return "";
    return lyricLines.map((l) => `${l.startTimeMs}:${l.words}`).join("|").slice(0, 8000);
  }, [lyricLines]);

  return useMemo(
    () =>
      computeTrackMood({
        title,
        artist,
        durationSec,
        lyricLines,
        liveBpmEstimate: liveBpm,
      }),
    [title, artist, durationSec, lyricsFingerprint, liveBpm]
  );
}
