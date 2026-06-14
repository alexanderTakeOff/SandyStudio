// ──────────────────────────────────────────────────────────────────────────────
// lib/api/shot-identity.ts
// Single source of truth for "what shot does this asset belong to?" (Phase A2,
// 2026-06-14).
//
// shot_id used to be extracted by three divergent copies — approve/route.ts
// extractShotId (metadata.shot_id ?? content json), eref-shot-invariant
// readShotIdFromMetadata (metadata.shot_reference.shot_id only), and an inline
// block in next-events.ts (metadata.shot_id ?? content json). When they
// disagreed, slot demotion picked the wrong sibling and plans/anchors collapsed
// against the wrong shot. One resolver, one priority order, everywhere.
//
// Priority (canonical):
//   1. metadata.shot_id            — the SSOT going forward (writers set this)
//   2. metadata.shot_reference.shot_id — IMG-anchor / IMG-episode_ref shape
//   3. last fenced ```json block in content → shot_id — legacy plans
// ──────────────────────────────────────────────────────────────────────────────

export interface ShotIdentitySource {
  metadata?: unknown;
  /** Markdown body — only parsed as a legacy fallback. Pass null to skip it. */
  content?: string | null;
}

/** Pull shot_id from metadata (both shapes) then the content fenced JSON. */
export function resolveShotId(asset: ShotIdentitySource): string | null {
  const meta = asset.metadata;
  if (meta && typeof meta === 'object') {
    const direct = (meta as { shot_id?: unknown }).shot_id;
    if (typeof direct === 'string' && direct.length > 0) return direct;

    const sr = (meta as { shot_reference?: { shot_id?: unknown } | null }).shot_reference;
    if (sr && typeof sr === 'object') {
      const srId = (sr as { shot_id?: unknown }).shot_id;
      if (typeof srId === 'string' && srId.length > 0) return srId;
    }
  }

  const content = asset.content;
  if (typeof content === 'string' && content.length > 0) {
    const matches = [...content.matchAll(/```json\s*([\s\S]+?)```/g)];
    const last = matches[matches.length - 1]?.[1];
    if (last) {
      try {
        const body = JSON.parse(last.trim()) as { shot_id?: unknown };
        if (typeof body.shot_id === 'string' && body.shot_id.length > 0) {
          return body.shot_id;
        }
      } catch {
        /* malformed block — fall through to null */
      }
    }
  }

  return null;
}
