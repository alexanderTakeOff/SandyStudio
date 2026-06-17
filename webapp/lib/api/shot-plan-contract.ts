// ──────────────────────────────────────────────────────────────────────────────
// lib/api/shot-plan-contract.ts
//
// Single source of truth for reading (and round-trip writing) the structured
// fields of an Animator Shot Plan (`SPC-shot_plan`). The plan body is markdown
// with a fenced ```json block holding the contract the runner executes
// (prompt, provider, quality_tier, resolution, seed, end_image, anchor pair,
// duration). Before this module the runner parsed that block inline
// (lib/agents/runner.ts), and the UI showed only raw markdown — so the Director
// could neither read the fields cleanly nor edit them. The contract page
// (components/preview/ShotPlanContract.tsx) and the runner now read the block
// through ONE parser; edits serialize back through ONE serializer that
// preserves everything outside the json block verbatim.
//
// Pure + dependency-free (no DB, no async provider resolution) so it is safe to
// run in the browser and trivial to unit test. The runner keeps its own
// DB-load + status guards + provider.id→impl resolution on top of this parse.
// ──────────────────────────────────────────────────────────────────────────────

export type QualityTier = 'fast' | 'standard';
export type Resolution = '480p' | '720p' | '1080p';

export interface ShotPlanContract {
  /** Verbatim video prompt the Animator authored (decision-of-record). */
  prompt: string | null;
  /** Raw `provider.id` vocab (e.g. "seedance-with-end-image"); NOT resolved. */
  providerId: string | null;
  qualityTier: QualityTier | null;
  resolution: Resolution | null;
  seed: number | null;
  endImageAssetId: string | null;
  startAnchorAssetId: string | null;
  endAnchorAssetId: string | null;
  durationSeconds: number | null;
  /** The full parsed json body — kept so edits round-trip without data loss. */
  raw: Record<string, unknown> | null;
  /** Non-null when the json block is missing or unparseable. */
  error: string | null;
}

const JSON_BLOCK_RE = /```json\s*([\s\S]+?)```/g;

/**
 * Locate the LAST fenced ```json block in the plan markdown and return its
 * inner text + the [start, end) offsets of the block (fences included) so the
 * serializer can splice a replacement in place. Returns null when absent.
 */
function findLastJsonBlock(
  content: string,
): { inner: string; start: number; end: number } | null {
  let match: RegExpExecArray | null;
  let last: { inner: string; start: number; end: number } | null = null;
  JSON_BLOCK_RE.lastIndex = 0;
  while ((match = JSON_BLOCK_RE.exec(content)) !== null) {
    last = {
      inner: match[1] ?? '',
      start: match.index,
      end: match.index + match[0].length,
    };
  }
  return last;
}

function readAssetId(v: unknown): string | null {
  if (v && typeof v === 'object') {
    const id = (v as { asset_id?: unknown }).asset_id;
    if (typeof id === 'string' && id.length > 0) return id;
  }
  return null;
}

/**
 * Parse a Shot Plan's markdown `content` into typed contract fields. Mirrors the
 * extraction the runner does (runner.ts plan-driven branch) but stays raw — it
 * does not resolve provider.id to an impl/quality, leaving that to the runner.
 */
export function parseShotPlanContract(content: string | null | undefined): ShotPlanContract {
  const empty: ShotPlanContract = {
    prompt: null,
    providerId: null,
    qualityTier: null,
    resolution: null,
    seed: null,
    endImageAssetId: null,
    startAnchorAssetId: null,
    endAnchorAssetId: null,
    durationSeconds: null,
    raw: null,
    error: null,
  };
  if (!content) return { ...empty, error: 'Plan content is empty.' };

  const block = findLastJsonBlock(content);
  if (!block) return { ...empty, error: 'No fenced ```json block found in plan.' };

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(block.inner.trim()) as Record<string, unknown>;
  } catch (e) {
    return { ...empty, error: `Plan json block is not valid JSON (${String(e)}).` };
  }

  const provider = body.provider;
  const providerId =
    provider && typeof provider === 'object' && typeof (provider as { id?: unknown }).id === 'string'
      ? ((provider as { id: string }).id)
      : null;

  const seedStrategy = body.seed_strategy;
  const seedRaw =
    seedStrategy && typeof seedStrategy === 'object'
      ? (seedStrategy as { seed?: unknown }).seed
      : undefined;

  return {
    prompt: typeof body.prompt === 'string' && body.prompt.length > 0 ? body.prompt : null,
    providerId,
    qualityTier:
      body.quality_tier === 'fast' || body.quality_tier === 'standard'
        ? body.quality_tier
        : null,
    resolution:
      body.resolution === '480p' || body.resolution === '720p' || body.resolution === '1080p'
        ? body.resolution
        : null,
    seed: typeof seedRaw === 'number' && Number.isFinite(seedRaw) ? Math.floor(seedRaw) : null,
    endImageAssetId: readAssetId(body.end_image),
    startAnchorAssetId: readAssetId(body.start_anchor),
    endAnchorAssetId: readAssetId(body.end_anchor),
    durationSeconds:
      typeof body.duration_seconds === 'number' && body.duration_seconds > 0
        ? body.duration_seconds
        : null,
    raw: body,
    error: null,
  };
}

/** Fields the Director may edit from the contract page. */
export interface ShotPlanPatch {
  prompt?: string;
  providerId?: string;
  qualityTier?: QualityTier;
  resolution?: Resolution;
  seed?: number | null;
  durationSeconds?: number;
  /** Render-duration cost, recomputed deterministically by the producer from the
   *  provider manifest (estimateCost) rather than trusting the LLM's arithmetic. */
  estimatedCostUsd?: number;
}

/**
 * Apply `patch` to the plan's json body and splice it back into `content`,
 * preserving every byte outside the json block (prose, headings, other fences).
 * Throws when there is no json block to update — the caller should surface that
 * rather than silently creating one. Only known fields are touched; unknown
 * keys in the body are carried through untouched.
 */
export function serializeShotPlanContract(content: string, patch: ShotPlanPatch): string {
  const block = findLastJsonBlock(content);
  if (!block) {
    throw new Error('Cannot serialize: plan has no fenced ```json block to update.');
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(block.inner.trim()) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`Cannot serialize: plan json block is not valid JSON (${String(e)}).`);
  }

  const next = { ...body };
  if (patch.prompt !== undefined) next.prompt = patch.prompt;
  if (patch.qualityTier !== undefined) next.quality_tier = patch.qualityTier;
  if (patch.resolution !== undefined) next.resolution = patch.resolution;
  if (patch.durationSeconds !== undefined) next.duration_seconds = patch.durationSeconds;
  if (patch.estimatedCostUsd !== undefined) next.estimated_cost_usd = patch.estimatedCostUsd;
  if (patch.providerId !== undefined) {
    const prev = (body.provider && typeof body.provider === 'object'
      ? (body.provider as Record<string, unknown>)
      : {});
    next.provider = { ...prev, id: patch.providerId };
  }
  if (patch.seed !== undefined) {
    if (patch.seed === null) {
      delete next.seed_strategy;
    } else {
      const prev = (body.seed_strategy && typeof body.seed_strategy === 'object'
        ? (body.seed_strategy as Record<string, unknown>)
        : {});
      next.seed_strategy = { ...prev, seed: Math.floor(patch.seed) };
    }
  }

  const rebuilt = '```json\n' + JSON.stringify(next, null, 2) + '\n```';
  return content.slice(0, block.start) + rebuilt + content.slice(block.end);
}
