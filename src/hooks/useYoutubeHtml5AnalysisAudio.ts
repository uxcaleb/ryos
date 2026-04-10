import { useEffect, useRef, useState } from "react";
import { getYouTubeVideoId } from "@/apps/ipod/constants";

const PROXY_PATH = "/api/youtube-audio-proxy";

/**
 * Parallel same-origin HTML5 audio for YouTube tracks so Web Audio can use
 * `createMediaElementSource` (iframe playback is not tappable).
 * When ready, mute the embedded player and drive audible output via the Web Audio graph
 * in `usePlaybackAudioReactive` (GainNode). The element's own volume stays 0 to avoid
 * double playback if the browser still routes element audio to speakers.
 */
export function useYoutubeHtml5AnalysisAudio(options: {
  trackUrl: string | undefined;
  isPlaying: boolean;
  getCurrentTimeSeconds: () => number | null;
}) {
  const { trackUrl, isPlaying, getCurrentTimeSeconds } = options;
  const videoId = trackUrl ? getYouTubeVideoId(trackUrl) : null;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [tapReady, setTapReady] = useState(false);
  const [tapFailed, setTapFailed] = useState(false);

  const timeFnRef = useRef(getCurrentTimeSeconds);
  timeFnRef.current = getCurrentTimeSeconds;

  useEffect(() => {
    setTapReady(false);
    setTapFailed(false);
    if (!videoId) return;

    const el = document.createElement("audio");
    el.preload = "auto";
    el.crossOrigin = "anonymous";
    el.style.display = "none";
    el.setAttribute("data-ryos-youtube-audio-tap", "true");
    el.volume = 0;
    document.body.appendChild(el);
    audioRef.current = el;

    el.src = `${PROXY_PATH}?id=${encodeURIComponent(videoId)}`;

    const onCanPlay = () => {
      setTapReady(true);
      setTapFailed(false);
    };
    const onErr = () => {
      setTapReady(false);
      setTapFailed(true);
    };

    el.addEventListener("canplay", onCanPlay);
    el.addEventListener("error", onErr);
    el.load();

    return () => {
      el.removeEventListener("canplay", onCanPlay);
      el.removeEventListener("error", onErr);
      el.pause();
      el.removeAttribute("src");
      el.load();
      el.remove();
      audioRef.current = null;
      setTapReady(false);
    };
  }, [videoId]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !tapReady || tapFailed) return;
    if (isPlaying) {
      void el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [isPlaying, tapReady, tapFailed]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const el = audioRef.current;
      if (!el || !tapReady || tapFailed) return;
      const t = timeFnRef.current();
      if (t === null || !Number.isFinite(t)) return;
      const drift = Math.abs(el.currentTime - t);
      if (drift > 0.28) {
        el.currentTime = t;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [tapReady, tapFailed]);

  const youtubeIframeMuted = Boolean(videoId && tapReady && !tapFailed);

  return {
    analysisMediaRef: audioRef,
    youtubeIframeMuted,
    tapActive: youtubeIframeMuted,
  };
}
