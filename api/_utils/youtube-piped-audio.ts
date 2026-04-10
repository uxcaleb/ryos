/**
 * Resolve a direct YouTube audio stream URL via Piped API (used by same-origin proxy for Web Audio).
 */

export interface PipedAudioStream {
  url: string;
  bitrate?: number;
  mimeType?: string | null;
}

interface PipedStreamsResponse {
  audioStreams?: PipedAudioStream[];
}

const DEFAULT_PIPED_BASES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.in.projectsegfau.lt",
];

const cache = new Map<string, { url: string; fetched: number }>();
const CACHE_MS = 25 * 60 * 1000;

function envBases(): string[] {
  const raw = process.env.PIPED_API_BASES || process.env.PIPED_API_BASE;
  if (!raw) return DEFAULT_PIPED_BASES;
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function pickBestAudioStream(
  streams: PipedAudioStream[] | undefined,
): string | null {
  if (!streams?.length) return null;
  const sorted = [...streams].sort(
    (a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0),
  );
  const byMime = (re: RegExp) => sorted.find((s) => re.test(s.mimeType ?? ""));
  return (
    byMime(/opus|webm/i)?.url ??
    byMime(/mp4|m4a|aac/i)?.url ??
    sorted[0]?.url ??
    null
  );
}

/**
 * Returns a googlevideo (or CDN) URL suitable for server-side fetch + pipe to client.
 */
export async function resolveYoutubeAudioStreamUrl(
  videoId: string,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return null;

  const hit = cache.get(videoId);
  if (hit && Date.now() - hit.fetched < CACHE_MS) {
    return hit.url;
  }

  for (const base of envBases()) {
    try {
      const url = `${base.replace(/\/$/, "")}/streams/${encodeURIComponent(videoId)}`;
      const r = await fetch(url, {
        signal,
        headers: { Accept: "application/json" },
      });
      if (!r.ok) continue;
      const data = (await r.json()) as PipedStreamsResponse;
      const streamUrl = pickBestAudioStream(data.audioStreams);
      if (streamUrl) {
        cache.set(videoId, { url: streamUrl, fetched: Date.now() });
        return streamUrl;
      }
    } catch {
      /* try next instance */
    }
  }
  return null;
}
