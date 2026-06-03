// ──────────────────────────────────────────────────────────────────────────────
// tools/backfill-anchor-prompts.ts
//
// ONE-TIME, MONEY-FREE backfill of metadata.image_prompt for legacy IMG-anchor
// assets. Before the 2026-06-03 12:56 fix, runAnchorPairGeneration did NOT write
// metadata.image_prompt, so the asset drawer had no generation prompt to show for
// those anchors. Anchors generated after the fix carry:
//
//   metadata.image_prompt = {
//     current_version: <v>,
//     history: [{ version: <v>, prompt: <fullPrompt>, source, at, ... }]
//   }
//
// where fullPrompt = ANCHOR_LAYOUT_LOCK_PREAMBLE + the Plan's per-side prompt.
//
// This script reconstructs that exact shape for legacy anchors WITHOUT touching
// the image binary. For each anchor missing image_prompt.history it:
//   1. reads metadata.provenance.plan_asset_id + metadata.anchor_position
//   2. loads that Plan asset's content, extracts the last ```json block
//   3. picks anchor_pair.<start|end>.prompt for this side
//   4. prepends ANCHOR_LAYOUT_LOCK_PREAMBLE → fullPrompt
//   5. merges image_prompt into metadata WITHOUT clobbering other keys (read-
//      modify-write the full metadata object)
//
// Idempotent: anchors that already have image_prompt.history are skipped.
//
//   npm run backfill-anchor-prompts -- --dry-run                  # print, no writes
//   npm run backfill-anchor-prompts -- --dry-run --episode <id>   # scoped dry-run
//   npm run backfill-anchor-prompts -- --episode <id>             # apply for one episode
//   npm run backfill-anchor-prompts                               # apply for ALL episodes
//
// Read-only unless run without --dry-run. Lives under tools/ (not scripts/) per
// the naming-validator hook. No image regeneration, no provider calls, $0.
// ──────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

const ASSET_PAGE = 5000;
const ANCHOR_FILE_TYPE_PREFIX = 'IMG-anchor';
const BACKFILL_SOURCE = 'backfill';

// ── ANCHOR_LAYOUT_LOCK_PREAMBLE ──────────────────────────────────────────────
// COPIED from webapp/lib/agents/runners/episode-references.ts (TD-65a, 2026-05-26).
// Kept inline rather than imported because that file is owned by another unit and
// does not export the constant. KEEP IN SYNC with episode-references.ts: if the
// runner's preamble changes, update this copy so reconstructed prompts match what
// the provider actually received at generation time.
const ANCHOR_LAYOUT_LOCK_PREAMBLE = [
  '[ANCHOR DIRECTIVE — TD-65a softened, 2026-05-26]',
  'Among the attached references, one image shows the canonical room layout (the scene continuity master). Use it as the spatial guide for furniture placement and architectural geometry. The other attached references are CHARACTER CANON — one image per recurring character or hero object. Each character MUST be rendered in the exact body shape, palette, and silhouette of its canonical reference image. Identity preservation takes precedence over layout exactness.',
  '',
  'CRITICAL — Sandy_hourglass body shape: Sandy is a transparent two-bulb hourglass character with rubber-hose dark-grey arms, oversized mitten hands, and a Sandy-Gold sand column inside the glass. Sandy is NOT an animal, NOT a bear, NOT a cub, NOT a squirrel, NOT any furry creature. If the action prose mentions Sandy in motion (lunging, running, stretching), render the hourglass body in that motion — never substitute a different creature form. The Sandy character canon reference image is authoritative.',
  '',
].join('\n');

// ── Plan JSON helpers — mirror episode-references.ts (test-seam exports there) ─

/** Extract the last fenced ```json block. Mirrors parseLastJsonBlock. */
function parseLastJsonBlock(content: string): Record<string, unknown> | null {
  const matches = [...content.matchAll(/```json\s*([\s\S]+?)```/g)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1]?.[1];
  if (!last) return null;
  try {
    return JSON.parse(last.trim()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Pull the per-side prompt for the given anchor position out of a Plan body's
 * `anchor_pair` block. Permissive: only requires a non-empty string prompt for
 * the requested side. Mirrors parseAnchorSide's `prompt` extraction.
 */
function promptForSide(
  body: Record<string, unknown>,
  position: 'start' | 'end',
): string | null {
  const raw = body.anchor_pair;
  if (!raw || typeof raw !== 'object') return null;
  const side = (raw as Record<string, unknown>)[position];
  if (!side || typeof side !== 'object') return null;
  const prompt = (side as Record<string, unknown>).prompt;
  return typeof prompt === 'string' && prompt.trim().length > 0 ? prompt : null;
}

// ── Metadata shapes (read-side only — we never assert on full asset schema) ───

interface AnchorMetadata {
  anchor_position?: unknown;
  provenance?: { plan_asset_id?: unknown } | null;
  image_prompt?: { history?: unknown } | null;
  [key: string]: unknown;
}

interface AnchorAssetRow {
  id: string;
  file_type: string;
  version: number | null;
  staging_path: string | null;
  drive_file_id: string | null;
  created_at: string | null;
  metadata: AnchorMetadata | null;
}

function alreadyBackfilled(meta: AnchorMetadata | null): boolean {
  const hist = meta?.image_prompt?.history;
  return Array.isArray(hist) && hist.length > 0;
}

function anchorPosition(meta: AnchorMetadata | null): 'start' | 'end' | null {
  const p = meta?.anchor_position;
  return p === 'start' || p === 'end' ? p : null;
}

function planAssetId(meta: AnchorMetadata | null): string | null {
  const id = meta?.provenance?.plan_asset_id;
  return typeof id === 'string' && id.trim().length > 0 ? id.trim() : null;
}

// ── CLI args ──────────────────────────────────────────────────────────────────

interface CliArgs {
  dryRun: boolean;
  episodeId: string | null;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const dryRun = argv.includes('--dry-run');
  const epIdx = argv.indexOf('--episode');
  const episodeId =
    epIdx >= 0 && argv[epIdx + 1] && !argv[epIdx + 1]!.startsWith('--')
      ? argv[epIdx + 1]!
      : null;
  return { dryRun, episodeId };
}

async function main(): Promise<void> {
  const { dryRun, episodeId } = parseArgs(process.argv.slice(2));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env',
    );
  }
  const sb = createClient(supabaseUrl, serviceKey);

  // ── Load candidate anchors (IMG-anchor%), optionally scoped to one episode ──
  let query = sb
    .from('assets')
    .select('id,file_type,version,staging_path,drive_file_id,created_at,metadata')
    .like('file_type', `${ANCHOR_FILE_TYPE_PREFIX}%`)
    .limit(ASSET_PAGE);
  if (episodeId) query = query.eq('episode_id', episodeId);

  const { data, error } = await query;
  if (error) {
    throw new Error(`anchor scan failed: ${error.message}`);
  }
  const anchors = (data ?? []) as AnchorAssetRow[];

  console.log(`\n  BACKFILL — anchor image_prompt reconstruction`);
  console.log(`  ${dryRun ? 'DRY-RUN (no writes)' : 'APPLYING'}`);
  if (episodeId) console.log(`  scoped to episode ${episodeId}`);
  console.log(`  ${'─'.repeat(60)}`);
  console.log(`  ${anchors.length} IMG-anchor asset(s) scanned`);

  // ── Cache Plan bodies so N anchors sharing a Plan parse it once ─────────────
  const planBodyCache = new Map<string, Record<string, unknown> | null>();

  async function loadPlanBody(
    id: string,
  ): Promise<Record<string, unknown> | null> {
    if (planBodyCache.has(id)) return planBodyCache.get(id) ?? null;
    const { data: planRow, error: planErr } = await sb
      .from('assets')
      .select('content')
      .eq('id', id)
      .maybeSingle();
    if (planErr) {
      console.error(`    plan ${id} fetch failed: ${planErr.message}`);
      planBodyCache.set(id, null);
      return null;
    }
    const content = (planRow as { content?: string | null } | null)?.content;
    const body = content ? parseLastJsonBlock(content) : null;
    planBodyCache.set(id, body);
    return body;
  }

  let skippedExisting = 0;
  let skippedNoData = 0;
  let updated = 0;

  for (const a of anchors) {
    const meta = a.metadata;

    if (alreadyBackfilled(meta)) {
      skippedExisting += 1;
      continue;
    }

    const position = anchorPosition(meta);
    const planId = planAssetId(meta);
    if (!position || !planId) {
      skippedNoData += 1;
      console.error(
        `    skip ${a.file_type} (${a.id}): missing ${
          !position ? 'anchor_position' : 'plan_asset_id'
        }`,
      );
      continue;
    }

    const body = await loadPlanBody(planId);
    const sidePrompt = body ? promptForSide(body, position) : null;
    if (!sidePrompt) {
      skippedNoData += 1;
      console.error(
        `    skip ${a.file_type} (${a.id}): no anchor_pair.${position}.prompt in plan ${planId}`,
      );
      continue;
    }

    const fullPrompt = `${ANCHOR_LAYOUT_LOCK_PREAMBLE}${sidePrompt}`;
    const version = a.version ?? 1;
    const at = a.created_at ?? new Date().toISOString();

    // Build the exact image_prompt shape runAnchorPairGeneration writes, marked
    // source:'backfill' so it's traceable. cost_usd is unknown for legacy rows
    // (the original gen cost lived only in budget_log, not the asset) → omit it
    // rather than fabricate a number.
    const imagePrompt = {
      current_version: version,
      history: [
        {
          version,
          prompt: fullPrompt,
          source: BACKFILL_SOURCE,
          at,
          staging_path: a.staging_path,
          drive_file_id: a.drive_file_id,
        },
      ],
    };

    // Read-modify-write: preserve every other metadata key.
    const nextMetadata = {
      ...(meta ?? {}),
      image_prompt: imagePrompt,
    };

    if (dryRun) {
      const preview = sidePrompt.slice(0, 72).replace(/\s+/g, ' ');
      console.log(
        `    WOULD set ${a.file_type} (${a.id}) v${version} [${position}] ← "${preview}…"`,
      );
      updated += 1;
      continue;
    }

    const { error: updErr } = await sb
      .from('assets')
      .update({ metadata: nextMetadata as unknown as Record<string, unknown> } as never)
      .eq('id', a.id);
    if (updErr) {
      console.error(`    update ${a.id} failed: ${updErr.message}`);
      continue;
    }
    updated += 1;
  }

  console.log(`  ${'─'.repeat(60)}`);
  console.log(
    `    ${dryRun ? 'would update' : 'updated'}: ${updated}` +
      `   skipped(already): ${skippedExisting}   skipped(no-data): ${skippedNoData}`,
  );
  if (dryRun) {
    console.log(`\n  Dry-run only. Re-run without --dry-run to write.\n`);
  } else {
    console.log(`\n  Done.\n`);
  }
}

main().catch((err: unknown) => {
  console.error(
    `backfill-anchor-prompts failed: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
});
