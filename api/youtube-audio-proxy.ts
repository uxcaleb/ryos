import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { apiHandler } from "./_utils/api-handler.js";
import { checkCounterLimit, getClientIp, makeKey } from "./_utils/_rate-limit.js";
import { resolveYoutubeAudioStreamUrl } from "./_utils/youtube-piped-audio.js";

export const runtime = "nodejs";
/** Long-lived streaming responses while the client reads audio. */
export const maxDuration = 300;

function forwardHeaders(
  from: Headers,
  to: { setHeader: (k: string, v: string | number | readonly string[]) => void },
): void {
  const pass = [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "cache-control",
  ];
  for (const key of pass) {
    const v = from.get(key);
    if (v) to.setHeader(key, v);
  }
}

export default apiHandler(
  { methods: ["GET", "HEAD"], auth: "none", contentType: null },
  async ({ req, res, logger, startTime }) => {
    const rawId = req.query?.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id || typeof id !== "string" || !/^[a-zA-Z0-9_-]{11}$/.test(id)) {
      res.status(400).json({ error: "Invalid or missing id (11-char video id)" });
      return;
    }

    const ip = getClientIp(req);
    const burstKey = makeKey(["rl", "youtube-audio-proxy", "burst", "ip", ip]);
    const burst = await checkCounterLimit({
      key: burstKey,
      windowSeconds: 60,
      limit: 45,
    });
    if (!burst.allowed) {
      res.status(429).json({ error: "Too many requests" });
      return;
    }

    const range =
      typeof req.headers.range === "string" ? req.headers.range : undefined;

    let upstreamUrl: string | null = null;
    try {
      upstreamUrl = await resolveYoutubeAudioStreamUrl(id);
    } catch (e) {
      logger.error("youtube-audio-proxy: resolve failed", e);
    }
    if (!upstreamUrl) {
      res.status(502).json({ error: "Could not resolve audio stream" });
      return;
    }

    const method = (req.method || "GET").toUpperCase();
    if (method === "HEAD") {
      res.status(200);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Type", "audio/mp4");
      logger.response(200, Date.now() - startTime);
      res.end();
      return;
    }

    let upstream: Response;
    try {
      upstream = await fetch(upstreamUrl, {
        headers: range ? { Range: range } : undefined,
      });
    } catch (e) {
      logger.error("youtube-audio-proxy: upstream fetch failed", e);
      res.status(502).json({ error: "Upstream fetch failed" });
      return;
    }

    if (!upstream.body) {
      res.status(502).json({ error: "Empty upstream body" });
      return;
    }

    res.status(upstream.status);
    forwardHeaders(upstream.headers, res);
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");

    const nodeReadable = Readable.fromWeb(
      upstream.body as import("stream/web").ReadableStream,
    );

    try {
      await pipeline(nodeReadable, res);
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code !== "ERR_STREAM_PREMATURE_CLOSE") {
        logger.error("youtube-audio-proxy: pipeline error", e);
      }
    }
    logger.response(upstream.status, Date.now() - startTime);
  },
);
