import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { MoodShaderVisualizer } from "@/components/shared/MoodShaderVisualizer";
import { useTrackMoodProfile } from "@/hooks/useTrackMoodProfile";
import { useIpodStore } from "@/stores/useIpodStore";
import { useAppStore } from "@/stores/useAppStore";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { formatKugouImageUrl, getYouTubeVideoId } from "@/apps/ipod/constants";
import { DisplayMode } from "@/types/lyrics";
import {
  mostVividHexFromPalette,
  useCoverPaletteForNeural,
} from "@/hooks/useCoverPalette";
import { useLerpedCssColor } from "@/hooks/useVisualizerColorTransition";

const PLAYBACK_FADE_SEC = 0.48;
/** Keep shader mounted briefly after pause so opacity can animate to 0. */
const LINGER_AFTER_PAUSE_MS = Math.round(PLAYBACK_FADE_SEC * 1000) + 80;

/** Cover hue wash (`mix-blend-color`) — lower = more wallpaper visible. */
const DESKTOP_NEURAL_WASH_OPACITY = 0.24;
/** Neural layer composite strength — lower = background shines through more. */
const DESKTOP_NEURAL_SHADER_LAYER_OPACITY = 0.62;

/** Pull vivid cover/mood color toward white for a softer cast (used with hue-style blend modes). */
function blendHexTowardWhite(hex: string, t: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return hex;
  const lerp = (c: number) => Math.round(c + (255 - c) * t);
  const r = lerp(parseInt(m[1], 16));
  const g = lerp(parseInt(m[2], 16));
  const b = lerp(parseInt(m[3], 16));
  return `rgb(${r},${g},${b})`;
}

/**
 * Full-screen neural mood shader over the desktop wallpaper while iPod audio is playing.
 * Sits above video/static wallpaper, below desktop icons (pointer-events: none).
 */
export function DesktopIpodNeuralOverlay() {
  const exposeMode = useAppStore((s) => s.exposeMode);
  const isPlaying = useIpodStore((s) => s.isPlaying);
  const currentSongId = useIpodStore((s) => s.currentSongId);
  const tracks = useIpodStore((s) => s.tracks);
  const totalTime = useIpodStore((s) => s.totalTime);
  const lyricLines = useIpodStore((s) => s.currentLyrics?.lines);
  const musicShadersOn = useDisplaySettingsStore((s) => s.musicShaderEffectsEnabled ?? true);

  const track = useMemo(() => {
    if (!tracks.length) return null;
    if (!currentSongId) return tracks[0] ?? null;
    return tracks.find((t) => t.id === currentSongId) ?? null;
  }, [currentSongId, tracks]);

  const coverUrl = useMemo(() => {
    if (!track) return null;
    const videoId = getYouTubeVideoId(track.url);
    const youtubeThumbnail = videoId
      ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
      : null;
    return formatKugouImageUrl(track.cover, 400) ?? youtubeThumbnail;
  }, [track]);

  const mood = useTrackMoodProfile({
    title: track?.title,
    artist: track?.artist,
    durationSec: totalTime > 0 ? totalTime : undefined,
    lyricLines,
    isPlaybackActive: isPlaying && !!track,
  });

  const coverPalette = useCoverPaletteForNeural(coverUrl);
  const vividWashColor = useMemo(() => {
    const fromCover = mostVividHexFromPalette(coverPalette);
    if (fromCover) return fromCover;
    return mood.palette.colorFront;
  }, [coverPalette, mood.palette]);

  /** Slightly soften saturation; blend mode `color` takes hue from the overlay and keeps backdrop brightness. */
  const washColorBlend = useMemo(
    () => blendHexTowardWhite(vividWashColor, 0.22),
    [vividWashColor],
  );

  const washColorLerped = useLerpedCssColor(washColorBlend);

  const eligible =
    !exposeMode && musicShadersOn && track != null;

  const [lingerAfterPause, setLingerAfterPause] = useState(false);

  useEffect(() => {
    if (!eligible) {
      setLingerAfterPause(false);
      return;
    }
    if (isPlaying) {
      setLingerAfterPause(true);
      return;
    }
    const id = window.setTimeout(
      () => setLingerAfterPause(false),
      LINGER_AFTER_PAUSE_MS,
    );
    return () => window.clearTimeout(id);
  }, [eligible, isPlaying]);

  const shouldMount = eligible && (isPlaying || lingerAfterPause);

  if (!shouldMount) return null;

  return (
    <motion.div
      className="absolute inset-0 z-0 pointer-events-none"
      initial={false}
      animate={{ opacity: isPlaying ? 1 : 0 }}
      transition={{
        duration: PLAYBACK_FADE_SEC,
        ease: [0.4, 0, 0.2, 1],
      }}
      aria-hidden
    >
      <div
        className="absolute inset-0 mix-blend-color"
        style={{
          backgroundColor: washColorLerped,
          opacity: DESKTOP_NEURAL_WASH_OPACITY,
        }}
        aria-hidden
      />
      <div
        className="absolute inset-0 mix-blend-soft-light"
        style={{ opacity: DESKTOP_NEURAL_SHADER_LAYER_OPACITY }}
        aria-hidden
      >
        <MoodShaderVisualizer
          mode={DisplayMode.VisualizerNeural}
          mood={mood}
          isActive={isPlaying || lingerAfterPause}
          coverUrl={coverUrl}
          className="h-full w-full"
        />
      </div>
    </motion.div>
  );
}
