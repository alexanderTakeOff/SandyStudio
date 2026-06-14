// ──────────────────────────────────────────────────────────────────────────────
// app/api/episodes/route.ts
// Episodes list + create. Per webapp.md §5 + onboarding.md §7.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk, apiCreated } from '@/lib/api/response';
import { parseJson, parseSearchParams } from '@/lib/api/zod-helpers';
import { ConflictError, ValidationError, NotFoundError } from '@/lib/api/errors';
import type { SeriesRow } from '@/lib/supabase/types-phase5b';
import {
  buildBriefTemplate,
  generateBriefMarkdown,
  type BriefInput,
} from '@/lib/agents/providers/anthropic-brief';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ListQuery = z.object({
  series_id: z.string().optional(),       // either uuid (FK) or text code
  status: z.string().optional(),
  active: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

const ACTIVE_EXCLUDED = new Set(['COMPLETE']);

const CreateBody = z.object({
  series_id: z.string().uuid(),           // accept the series row uuid
  episode_code: z.string().regex(/^E[0-9]{1,3}$/),
  title_working: z.string().min(1).max(80),
  target_runtime_seconds: z.number().int().min(5).max(300).optional(),
  premise: z.string().min(20).max(500),
  governance_mode: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).default(1),
});

export const GET = withApiHandler(async (req) => {
  const { supabase } = await requireDirector();
  const q = parseSearchParams(req.url, ListQuery);

  let query = supabase
    .from('episodes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(q.limit);

  if (q.series_id) {
    // 0038 (2026-06-14): episodes.series_id is now the series UUID (FK). Query
    // it directly — the legacy uuid→code translation is gone. A code passed here
    // simply won't match (nothing stores code form any more).
    query = query.eq('series_id', q.series_id);
  }
  if (q.status) query = query.eq('status', q.status as never);

  const { data, error } = await query;
  if (error) throw new Error(`episodes list failed: ${error.message}`);
  let rows = data ?? [];
  if (q.active === 'true') {
    rows = rows.filter((r) => !ACTIVE_EXCLUDED.has(r.status));
  }
  return apiOk(rows, { total: rows.length });
});

export const POST = withApiHandler(async (req) => {
  const { user, supabase } = await requireDirector();
  const body = await parseJson(req, CreateBody);

  // Resolve series row (its UUID becomes episodes.series_id FK)
  const { data: srow, error: serr } = await supabase
    .from('series' as never)
    .select('*')
    .eq('id', body.series_id)
    .maybeSingle();
  if (serr) throw new Error(`series lookup failed: ${serr.message}`);
  if (!srow) throw new NotFoundError(`Series ${body.series_id}`);
  const series = srow as unknown as SeriesRow;

  const fullEpisodeCode = `${series.code}-${body.episode_code}`;

  // Brief asset filename obeys the convention: SS-S01-E01-SPC-brief-v01-DRAFT.md
  // (note: SS- prefix lives inside series.code, e.g. "SS-S01"; keep that.)
  const briefFilename = `${series.code}-${body.episode_code}-SPC-brief-v01-DRAFT.md`;

  // Insert episode
  const epPayload = {
    // 0038 (2026-06-14): store the series UUID (FK), not the code. Root fix for
    // the code-vs-UUID polymorphism that broke series/genre/thumbnail lookups.
    series_id: series.id,
    episode_code: fullEpisodeCode,
    title_working: body.title_working,
    status: 'BRIEF_PENDING' as const,
    governance_mode: body.governance_mode,
    budget_ceiling: series.episode_budget_ceiling ?? null,
    budget_spent: 0,
  };
  const { data: ep, error: epErr } = await supabase
    .from('episodes')
    .insert(epPayload)
    .select('*')
    .single();
  if (epErr) {
    if (epErr.code === '23505') {
      throw new ConflictError(`Episode ${fullEpisodeCode} already exists`);
    }
    throw new Error(`episode insert failed: ${epErr.message}`);
  }
  if (!ep) throw new Error('episode insert returned no row');

  // Insert brief asset.
  //   - file_type = 'SPC-brief' (long form) so gate.ts SPC-brief% LIKE matches.
  //   - status = 'REVIEW' so the brief surfaces in the Director Inbox immediately.
  //   - content = template markdown built from form fields (always present, even
  //     if Claude enrichment below fails). Director sees structured brief on first
  //     open of the editor — no more empty editor.
  //
  // Atomicity: if the brief insert fails CHECK (most common cause: filename
  // pattern mismatch) we roll back the episode insert so the user can retry
  // without an orphan row.
  const briefInput: BriefInput = {
    episodeCode: fullEpisodeCode,
    episodeTitle: body.title_working,
    premise: body.premise,
    runtimeSeconds: body.target_runtime_seconds ?? null,
    seriesContext: { code: series.code, title: series.title },
  };
  const templateBrief = buildBriefTemplate(briefInput);

  const { data: briefRow, error: assErr } = await supabase
    .from('assets')
    .insert({
      episode_id: ep.id,
      filename: briefFilename,
      file_type: 'SPC-brief',
      description: body.premise,
      content: templateBrief,
      version: 1,
      status: 'REVIEW' as const,
      agent_id: 'Director',
    })
    .select('id')
    .single();
  if (assErr) {
    if (assErr.code !== '23505') {
      // Best-effort rollback. Cascade FK on assets/jobs handles cleanup.
      await supabase.from('episodes').delete().eq('id', ep.id);
      throw new Error(
        `Brief asset insert failed (episode rolled back): ${assErr.message}. ` +
          `Filename was '${briefFilename}'. Check the assets.filename CHECK constraint.`,
      );
    }
  }
  const briefAssetId = briefRow?.id ?? null;

  // Sync Claude Haiku enrichment. ~3-5s. If it fails, template stays — episode
  // is still usable. Director never sees an empty brief.
  let briefSource: 'ai' | 'template' = 'template';
  if (briefAssetId) {
    try {
      const aiBrief = await generateBriefMarkdown(briefInput);
      const { error: updErr } = await supabase
        .from('assets')
        .update({ content: aiBrief } as never)
        .eq('id', briefAssetId);
      if (!updErr) briefSource = 'ai';
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[episodes POST] Claude brief generation failed (kept template): ${(err as Error).message}`,
      );
    }
  }

  await supabase.from('activity_events').insert({
    event_type: 'episode_created',
    severity: 'info',
    title: `Episode ${fullEpisodeCode} created`,
    description: `By ${user.email ?? user.id}; runtime ${body.target_runtime_seconds ?? 'unspecified'}s; brief=${briefSource}`,
    actor: user.id,
    episode_id: ep.id,
    asset_id: briefAssetId,
    metadata: {
      series_id: series.id,
      target_runtime_seconds: body.target_runtime_seconds ?? null,
      brief_source: briefSource,
    },
  } as never);

  return apiCreated(ep);
});

// Suppress unused-warning for ValidationError when not directly used
void ValidationError;
