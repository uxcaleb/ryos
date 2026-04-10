import { useMemo } from "react";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { MusicVisualizerMenuBar } from "./MusicVisualizerMenuBar";
import { AppProps } from "@/apps/base/types";
import { useMusicVisualizerLogic } from "../hooks/useMusicVisualizerLogic";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { appMetadata } from "..";
import { MoodShaderVisualizer } from "@/components/shared/MoodShaderVisualizer";
import { useTrackMoodProfile } from "@/hooks/useTrackMoodProfile";
import { useKaraokeStore } from "@/stores/useKaraokeStore";
import { useIpodStore } from "@/stores/useIpodStore";
import {
  useMusicVisualizerAppStore,
  type MusicVisualizerMode,
} from "@/stores/useMusicVisualizerAppStore";
import { DisplayMode } from "@/types/lyrics";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "react-i18next";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { formatKugouImageUrl, getYouTubeVideoId } from "@/apps/ipod/constants";
import { useSyncMusicVisualizerWithIpodGradient } from "@/hooks/useSyncMusicVisualizerWithIpodGradient";

export function MusicVisualizerAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
}: AppProps) {
  const { t } = useTranslation();
  const {
    translatedHelpItems,
    isXpTheme,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
  } = useMusicVisualizerLogic();

  const mode = useMusicVisualizerAppStore((s) => s.mode);
  const setMode = useMusicVisualizerAppStore((s) => s.setMode);
  useSyncMusicVisualizerWithIpodGradient();
  const musicShadersOn = useDisplaySettingsStore(
    (s) => s.musicShaderEffectsEnabled ?? true
  );

  const currentSongId = useKaraokeStore((s) => s.currentSongId);
  const karaokePlaying = useKaraokeStore((s) => s.isPlaying);
  const elapsedTime = useKaraokeStore((s) => s.elapsedTime);
  const totalTime = useKaraokeStore((s) => s.totalTime);

  const tracks = useIpodStore((s) => s.tracks);
  const ipodPlaying = useIpodStore((s) => s.isPlaying);
  const lyricLines = useIpodStore((s) => s.currentLyrics?.lines);

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

  const isPlaybackActive = karaokePlaying || ipodPlaying;

  const mood = useTrackMoodProfile({
    title: track?.title,
    artist: track?.artist,
    durationSec: totalTime > 0 ? totalTime : undefined,
    lyricLines,
    isPlaybackActive,
  });

  const menuBar = (
    <MusicVisualizerMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
    />
  );

  if (!isWindowOpen) return null;

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title={t("apps.music-visualizer.title")}
        onClose={onClose}
        isForeground={isForeground}
        appId="music-visualizer"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        menuBar={isXpTheme ? menuBar : undefined}
      >
        <div className="flex flex-col h-full bg-os-window-bg font-os-ui min-h-0">
          <div className="shrink-0 px-3 py-2 border-b border-black/10 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1 min-w-0 flex-1">
              <Label className="text-[11px]">{t("apps.music-visualizer.modeLabel")}</Label>
              <Select
                value={mode}
                onValueChange={(v) => setMode(v as MusicVisualizerMode)}
              >
                <SelectTrigger className="w-full sm:max-w-[220px] h-8 text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DisplayMode.VisualizerNeural}>
                    {t("apps.music-visualizer.modes.neural")}
                  </SelectItem>
                  <SelectItem value={DisplayMode.VisualizerBlobs}>
                    {t("apps.music-visualizer.modes.blobs")}
                  </SelectItem>
                  <SelectItem value={DisplayMode.VisualizerSwirl}>
                    {t("apps.music-visualizer.modes.swirl")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-[10px] text-neutral-600 font-geneva-12 leading-snug sm:text-right sm:max-w-[280px]">
              {t("apps.music-visualizer.hint")}
            </p>
          </div>

          <div className="flex-1 min-h-[240px] relative bg-black">
            {musicShadersOn ? (
              <MoodShaderVisualizer
                mode={mode}
                mood={mood}
                isActive={true}
                coverUrl={coverUrl}
                className="absolute inset-0"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center px-4 bg-gradient-to-b from-zinc-900 to-black">
                <p className="text-[11px] font-geneva-12 text-white/70 text-center max-w-sm">
                  {t("apps.music-visualizer.disabledInShaderSettings")}
                </p>
              </div>
            )}
            {track && (
              <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
                <p className="text-[10px] font-geneva-12 text-white/90 truncate">
                  {track.title}
                  {track.artist ? ` — ${track.artist}` : ""}
                </p>
                {isPlaybackActive && totalTime > 0 && (
                  <p className="text-[9px] font-geneva-12 text-white/60 tabular-nums">
                    {formatClock(elapsedTime)} / {formatClock(totalTime)}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </WindowFrame>
      <HelpDialog
        isOpen={isHelpDialogOpen}
        onOpenChange={setIsHelpDialogOpen}
        appId="music-visualizer"
        helpItems={translatedHelpItems}
      />
      <AboutDialog
        isOpen={isAboutDialogOpen}
        onOpenChange={setIsAboutDialogOpen}
        metadata={appMetadata}
        appId="music-visualizer"
      />
    </>
  );
}

function formatClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
