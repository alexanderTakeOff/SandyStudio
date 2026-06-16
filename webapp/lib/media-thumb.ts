// ──────────────────────────────────────────────────────────────────────────────
// lib/media-thumb.ts
// Shared thumbnail-URL helper for the dynamic `/api/media/<id|filename>` route.
//
// Grid tiles render small (≤ ~96px). Shipping a full-resolution PNG (1.5-2 MB
// each) into a 64px box wastes bandwidth and makes the gallery crawl on refresh —
// 50+ anchor tiles × 2 MB re-downloaded each load. The media route understands a
// `?w=<px>` param and returns a resized WebP (disk-cached), so we ask for one
// sized to the tile. DPR-aware: 2× the CSS size stays crisp on retina. Static
// `/staging` / `http` URLs are passed through untouched (only the media route
// understands the param). 2026-06-16 — extracted from AssetThumb so the EREF
// reference/anchor strips reuse it instead of loading full-res PNGs.
// ──────────────────────────────────────────────────────────────────────────────

const THUMB_DPR = 2;
/** Only request thumbnails for genuinely small grid tiles. */
const THUMB_GATE_PX = 96;

export function withThumbParam(src: string, cssSizePx: number): string {
  if (cssSizePx > THUMB_GATE_PX) return src;
  if (!src.startsWith('/api/media/')) return src;
  const width = Math.max(16, Math.round(cssSizePx * THUMB_DPR));
  const sep = src.includes('?') ? '&' : '?';
  return `${src}${sep}w=${width}`;
}
