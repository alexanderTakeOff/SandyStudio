// ──────────────────────────────────────────────────────────────────────────────
// app/api/assets/[id]/enrich/route.ts
// Generic enrichment endpoint — runs the appropriate first-pass agent on a
// DRAFT asset that has no `metadata.image_prompt` history yet.
//
// Routes by file_type:
//   SBL-character/location/object/style   → EXEC-BIBLE-AUTHOR (Sonnet description + gpt-image-2)
//   IMG-episode_ref_*                     → (deferred to Slice D — call EREF runner with shot context)
//   IMG-thumbnail                         → (deferred — calls EXEC-THUMB runner)
//
// Mode-gated via `enforceMode('ENRICH_ASSET')`:
//   - Mode 1: requires `directorConfirm: true`
//   - Mode 2-4: pipeline auto-fire allowed
//
// Refuses:
//   - LOCKED status
//   - already-enriched (image_prompt history non-empty) — use /regenerate-image instead
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { runBibleAuthor, BibleAuthorError, type BibleSection } from '@/lib/agents/runners/bible-author';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { recordCost } from '@/lib/budget';
import { enforceMode } from '@/lib/governance';
import {
  bibleSlugFromFileType,
  type AssetMetadataDoc,
  type GovernanceModeNum,
} from '@/lib/api/series-bible';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z
  .object({
    directorConfirm: z.boolean().optional(),
  })
  .optional();

interface AssetRow {
  id: string;
  series_id: string | null;
  episode_id: string | null;
  filename: string;
  file_type: string;
  status: string;
  description: string | null;
  metadata: AssetMetadataDoc | null;
}

async function resolveMode(
  sb: ReturnType<typeof createSupabaseServiceRoleClient>,
  asset: AssetRow,
): Promise<GovernanceModeNum> {
  if (asset.episode_id) {
    const { data } = await sb
      .from('episodes')
      .select('governance_mode')
      .eq('id', asset.episode_id)
      .maybeSingle();
    const mode = (data as { governance_mode?: number } | null)?.governance_mode;
    if (mode === 1 || mode === 2 || mode === 3) return mode;
  }
  return 1; // Bible default = manual
}

export const POST = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const assetId = params?.id;
  if (!assetId) throw new NotFoundError('Asset');

  const { user } = await requireDirector();
  const body = (await parseJson(req, Body)) ?? {};
  const sb = createSupabaseServiceRoleClient();

  const { data: assetRaw, error } = await sb
    .from('assets')
    .select('*')
    .eq('id', assetId)
    .maybeSingle();
  if (error) throw new Error(`asset fetch: ${error.message}`);
  if (!assetRaw) throw new NotFoundError(`Asset ${assetId}`);
  const asset = assetRaw as unknown as AssetRow;

  if (asset.status === 'LOCKED') {
    throw new ValidationError('Asset is LOCKED — cannot enrich');
  }
  if (asset.metadata?.image_prompt && asset.metadata.image_prompt.history.length > 0) {
    throw new ValidationError(
      'Asset already enriched — use /regenerate-image to reroll the image',
    );
  }

  // ── Mode gate ──────────────────────────────────────────────────────────────
  const mode = await resolveMode(sb, asset);
  const decision = enforceMode(
    'ENRICH_ASSET',
    { id: asset.episode_id ?? asset.id, governance_mode: mode },
    {
      directorConfirm: body.directorConfirm ?? false,
      confirmedBy: user.email ?? user.id,
      actor: 'director',
    },
  );
  if (!decision.allowed) {
    return apiOk(
      {
        action_blocked: true,
        reason: decision.reason ?? 'Action not allowed in this mode',
        mode_at_time: decision.modeAtTime,
        category: decision.category,
        requires_director: decision.requiresDirector,
      },
      undefined,
      { status: 403 },
    );
  }

  // ── Dispatch by file_type ──────────────────────────────────────────────────
  if (asset.file_type.startsWith('SBL-')) {
    const sb2 = bibleSlugFromFileType(asset.file_type);
    if (!sb2 || sb2.section === 'general_idea' || sb2.section === 'audio') {
      throw new ValidationError(
        `Cannot enrich ${asset.file_type} — only character/location/object/style supported`,
      );
    }
    if (!asset.series_id) throw new ValidationError('Bible asset missing series_id');

    try {
      const r = await runBibleAuthor({
        supabase: sb,
        assetId,
        seriesId: asset.series_id,
        section: sb2.section as BibleSection,
        slug: sb2.slug,
        seedDescription: asset.description ?? '',
        filename: asset.filename,
        source: 'manual_add',
      });
      // Direct Bible-enrich spend → budget_log (series-level, no episode).
      // Best-effort; money already spent. jobId=null; enforceCeiling=false.
      try {
        await recordCost(sb, {
          jobId: null,
          episodeId: null,
          agentId: 'EXEC-EREF',
          costUsd: r.costUsd,
          apiProvider: 'gpt-image-2',
          modelOrTier: 'gpt-image-2',
          operation: 'bible_enrich',
          enforceCeiling: false,
        });
      } catch {
        /* non-fatal — image already generated; accounting is best-effort */
      }
      return apiOk({
        asset_id: assetId,
        cost_usd: r.costUsd,
        width: r.imageWidth,
        height: r.imageHeight,
        style_anchor_asset_id: r.styleAnchorAssetId,
        mode_at_time: decision.modeAtTime,
      });
    } catch (err: unknown) {
      if (err instanceof BibleAuthorError) {
        throw new ValidationError(`Enrichment failed: ${err.message}`);
      }
      throw err;
    }
  }

  // Episode ref + thumbnail enrichment from this generic endpoint deferred to
  // Slice D — they need shot context / brief context that isn't available here.
  // For now: emit a clear error pointing the caller to /regenerate-image.
  throw new ValidationError(
    `Enrichment for ${asset.file_type} not yet supported via this endpoint. ` +
      `Use /regenerate-image with an explicit prompt instead.`,
  );
});
