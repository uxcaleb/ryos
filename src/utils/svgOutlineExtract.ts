/**
 * Parse an SVG file and collect path data suitable for canvas `Path2D` stroke.
 * Converts basic shapes to path `d` where needed.
 */

function parseViewBox(raw: string | null): [number, number, number, number] | null {
  if (!raw) return null;
  const p = raw.trim().split(/[\s,]+/).map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isFinite(n))) return null;
  return [p[0]!, p[1]!, p[2]!, p[3]!];
}

function circleToPath(cx: number, cy: number, r: number): string {
  return `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy}`;
}

function rectToPath(x: number, y: number, w: number, h: number, rx = 0, ry = 0): string {
  if (!rx && !ry) {
    return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
  }
  const rxi = Math.min(rx || 0, w / 2);
  const ryi = Math.min(ry || rx || 0, h / 2);
  return `M ${x + rxi} ${y} L ${x + w - rxi} ${y} Q ${x + w} ${y} ${x + w} ${y + ryi} L ${x + w} ${y + h - ryi} Q ${x + w} ${y + h} ${x + w - rxi} ${y + h} L ${x + rxi} ${y + h} Q ${x} ${y + h} ${x} ${y + h - ryi} L ${x} ${y + ryi} Q ${x} ${y} ${x + rxi} ${y} Z`;
}

function ellipseToPath(cx: number, cy: number, rx: number, ry: number): string {
  return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx - rx} ${cy}`;
}

function parsePoints(raw: string | null): [number, number][] {
  if (!raw) return [];
  const out: [number, number][] = [];
  const nums = raw.trim().split(/[\s,]+/).map(Number);
  for (let i = 0; i + 1 < nums.length; i += 2) {
    if (Number.isFinite(nums[i]) && Number.isFinite(nums[i + 1])) {
      out.push([nums[i]!, nums[i + 1]!]);
    }
  }
  return out;
}

function polylineToPath(points: [number, number][], close: boolean): string | null {
  if (points.length < 2) return null;
  const [x0, y0] = points[0]!;
  const rest = points.slice(1).map(([x, y]) => `L ${x} ${y}`).join(" ");
  return `M ${x0} ${y0} ${rest}${close ? " Z" : ""}`;
}

export interface ExtractedSvgOutline {
  paths: string[];
  viewBox: [number, number, number, number];
}

const DEFAULT_VIEWBOX: [number, number, number, number] = [0, 0, 100, 100];

function findSvgRoot(doc: Document): Element | null {
  const de = doc.documentElement;
  if (de?.tagName.toLowerCase() === "svg") return de;
  return doc.querySelector("svg");
}

/**
 * Extract outline path commands from SVG markup.
 * Prefers stroked paths; filled-only paths are still collected (rendered as stroke in the visualizer).
 */
export function extractOutlineFromSvgString(svgText: string): ExtractedSvgOutline | null {
  const trimmed = svgText.trim();
  if (!trimmed) return null;

  const doc = new DOMParser().parseFromString(trimmed, "image/svg+xml");
  let root = findSvgRoot(doc);

  if (!root) {
    const htmlDoc = new DOMParser().parseFromString(trimmed, "text/html");
    root = findSvgRoot(htmlDoc);
  }
  if (!root) {
    const wrapped = `<!DOCTYPE html><html><body>${trimmed}</body></html>`;
    const htmlDoc = new DOMParser().parseFromString(wrapped, "text/html");
    root = findSvgRoot(htmlDoc);
  }

  if (!root || root.tagName.toLowerCase() !== "svg") return null;

  const paths: string[] = [];

  root.querySelectorAll("path").forEach((el) => {
    const d = el.getAttribute("d");
    if (d && d.trim()) paths.push(d.trim());
  });

  root.querySelectorAll("circle").forEach((el) => {
    const cx = parseFloat(el.getAttribute("cx") || "0");
    const cy = parseFloat(el.getAttribute("cy") || "0");
    const r = parseFloat(el.getAttribute("r") || "0");
    if (r > 0) paths.push(circleToPath(cx, cy, r));
  });

  root.querySelectorAll("ellipse").forEach((el) => {
    const cx = parseFloat(el.getAttribute("cx") || "0");
    const cy = parseFloat(el.getAttribute("cy") || "0");
    const rx = parseFloat(el.getAttribute("rx") || "0");
    const ry = parseFloat(el.getAttribute("ry") || "0");
    if (rx > 0 && ry > 0) paths.push(ellipseToPath(cx, cy, rx, ry));
  });

  root.querySelectorAll("rect").forEach((el) => {
    const x = parseFloat(el.getAttribute("x") || "0");
    const y = parseFloat(el.getAttribute("y") || "0");
    const w = parseFloat(el.getAttribute("width") || "0");
    const h = parseFloat(el.getAttribute("height") || "0");
    const rx = parseFloat(el.getAttribute("rx") || el.getAttribute("ry") || "0");
    const ry = parseFloat(el.getAttribute("ry") || el.getAttribute("rx") || "0");
    if (w > 0 && h > 0) paths.push(rectToPath(x, y, w, h, rx, ry));
  });

  root.querySelectorAll("polygon").forEach((el) => {
    const pts = parsePoints(el.getAttribute("points"));
    const p = polylineToPath(pts, true);
    if (p) paths.push(p);
  });

  root.querySelectorAll("polyline").forEach((el) => {
    const pts = parsePoints(el.getAttribute("points"));
    const p = polylineToPath(pts, false);
    if (p) paths.push(p);
  });

  root.querySelectorAll("line").forEach((el) => {
    const x1 = parseFloat(el.getAttribute("x1") || "0");
    const y1 = parseFloat(el.getAttribute("y1") || "0");
    const x2 = parseFloat(el.getAttribute("x2") || "0");
    const y2 = parseFloat(el.getAttribute("y2") || "0");
    paths.push(`M ${x1} ${y1} L ${x2} ${y2}`);
  });

  root.querySelectorAll("use").forEach((el) => {
    const href =
      el.getAttribute("href") ||
      el.getAttribute("xlink:href") ||
      el.getAttributeNS("http://www.w3.org/1999/xlink", "href");
    if (!href?.startsWith("#")) return;
    const id = href.slice(1);
    const target = root.ownerDocument.getElementById(id);
    if (!target) return;
    const tag = target.tagName.toLowerCase();
    if (tag === "path") {
      const d = target.getAttribute("d");
      if (d?.trim()) paths.push(d.trim());
      return;
    }
    if (tag === "circle") {
      const cx = parseFloat(target.getAttribute("cx") || "0");
      const cy = parseFloat(target.getAttribute("cy") || "0");
      const r = parseFloat(target.getAttribute("r") || "0");
      if (r > 0) paths.push(circleToPath(cx, cy, r));
      return;
    }
    if (tag === "ellipse") {
      const cx = parseFloat(target.getAttribute("cx") || "0");
      const cy = parseFloat(target.getAttribute("cy") || "0");
      const rx = parseFloat(target.getAttribute("rx") || "0");
      const ry = parseFloat(target.getAttribute("ry") || "0");
      if (rx > 0 && ry > 0) paths.push(ellipseToPath(cx, cy, rx, ry));
    }
  });

  if (paths.length === 0) return null;

  let viewBox = parseViewBox(root.getAttribute("viewBox"));
  if (!viewBox) {
    const w = parseFloat(String(root.getAttribute("width") || "0").replace(/[^\d.-]/g, "")) || 0;
    const h = parseFloat(String(root.getAttribute("height") || "0").replace(/[^\d.-]/g, "")) || 0;
    if (w > 0 && h > 0) {
      viewBox = [0, 0, w, h];
    } else {
      viewBox = DEFAULT_VIEWBOX;
    }
  }

  return { paths, viewBox };
}
