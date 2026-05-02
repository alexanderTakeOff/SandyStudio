// ──────────────────────────────────────────────────────────────────────────────
// app/api/series/[id]/bible/extensions/route.ts
// Director Approves a Bible Extension Proposal — creates DRAFT SBL-* rows in
// the series Bible Library, then marks the originating Inbox event resolved.
//
// Body shape:
//   {
//     event_id: string,                       // canon_extension_proposed event
//     decisions: [
//       { name, kind, decision: 'APPROVE'|'REJECT', description?, rationale_note? }
//     ]
//   }
//
// Each APPROVE inserts an SBL-{kind}_{slug} DRAFT (Director then opens Bible
// Library to add image + LOCK via existing flow).
// REJECT only marks the proposal dispositioned (no asset created); helpful when
// the agent should rewrite without the asset.
//
// All decisions in one request → event flagged resolved when ALL proposals
// have a decision recorded.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import {
  bibleFilename,
  buildProvenance,
  type AssetMetadataDoc,
} from '@/lib/api/series-bible';
import { resolveExtensionRequest } from '@/lib/api/canon-extensions';
import { runBibleAuthor, BibleAuthorError } from '@/lib/agents/runners/bible-author';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DecisionSchema = z.object({
  name: z.string().min(1).max(60),
  kind: z.enum(['character', 'location', 'object', 'style']),
  decision: z.enum(['APPROVE', 'REJECT']),
  description: z.string().max(4000).optional(),
  rationale_note: z.string().max(500).optional(),
});

const PostBody = z.object({
  event_id: z.string().uuid(),
  decisions: z.array(DecisionSchema).min(1).max(20),
});

interface SeriesRow {
  id: string;
  code: string;
}

export const POST = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const seriesId = params?.id;
  if (!seriesId) throw new NotFoundError('Series');

  const { user, supabase } = await requireDirector();
  const body = await parseJson(req, PostBody);

  // Look up series for the code (used in filename)
  const { data: seriesRow, error: serr } = await supabase
    .from('series')
    .select('id,code')
    .eq('id', seriesId)
    .maybeSingle();
  if (serr) throw new Error(`series fetch failed: ${serr.message}`);
  if (!seriesRow) throw new NotFoundError(`Series ${seriesId}`);
  const series = seriesRow as SeriesRow;

  // Verify the event exists and isn't already resolved
  const evRes = await supabase
    .from('activity_events')
    .select('*')
    .eq('id', body.event_id)
    .maybeSingle();
  if (evRes.error) throw new Error(`event fetch failed: ${evRes.error.message}`);
  if (!evRes.data) throw new NotFoundError(`Event ${body.event_id}`);
  // Pre-types-regen cast: resolved_at column was just added in migration 0019.
  const evRow = evRes.data as unknown as {
    id: string;
    episode_id: string | null;
    event_type: string;
    resolved_at: string | null;
    metadata: Record<string, unknown> | null;
  };
  if (evRow.event_type !== 'canon_extension_proposed') {
    throw new ValidationError('Event is not a Bible extension proposal');
  }
  if (evRow.resolved_at) {
    throw new ValidationError('Event already resolved');
  }

  const created: Array<{
    name: string;
    kind: string;
    assetId: string;
    filename: string;
    enriched: boolean;
    enrichmentError?: string;
    costUsd?: number;
  }> = [];
  const rejected: Array<{ name: string; kind: string; rationale_note?: string }> = [];

  // Service-role client for the EXEC-BIBLE-AUTHOR call — needs to read style
  // anchor + write back metadata, all behind RLS.
  const serviceSupabase = createSupabaseServiceRoleClient();

  for (const d of body.decisions) {
    if (d.decision === 'APPROVE') {
      const slug = d.name.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
      const filename = bibleFilename({
        seriesCode: series.code,
        section: d.kind,
        slug,
        version: 1,
        ext: 'md',
        status: 'DRAFT',
      });
      const fileType = `SBL-${d.kind}_${slug}`;
      const description = d.description ?? '';
      const content =
        `# ${d.kind.charAt(0).toUpperCase() + d.kind.slice(1)} — ${slug}\n\n` +
        `_Bible extension approved by Director from canon proposal — awaiting EXEC-BIBLE-AUTHOR enrichment._\n\n` +
        `## Description (seed)\n\n${description || '_(none provided)_'}\n`;

      // Stamp creation provenance immediately so the asset carries audit info
      // even if enrichment later fails.
      const provenance = buildProvenance({
        by: user.email ?? user.id,
        byKind: 'director',
        source: 'canon_extension_approval',
      });
      const seedMeta: AssetMetadataDoc = { provenance };

      const ins = await supabase
        .from('assets')
        .insert({
          series_id: series.id,
          episode_id: null,
          agent_id: 'Director',
          file_type: fileType,
          filename,
          description,
          status: 'DRAFT',
          version: 1,
          content,
          metadata: seedMeta as unknown as Record<string, unknown>,
        } as never)
        .select('id,filename')
        .single();

      if (ins.error) {
        // Surface the error rather than silently dropping
        throw new Error(`extension insert failed (${slug}): ${ins.error.message}`);
      }
      const newAssetId = (ins.data as { id: string }).id;

      // ── Auto-enrichment via EXEC-BIBLE-AUTHOR ──────────────────────────────
      // Inline because Director is waiting on Approve. Wrapped in try/catch so
      // a provider failure leaves the DRAFT alive (with seed description) and
      // surfaces a blocker_raised event for retry.
      let enriched = false;
      let enrichmentError: string | undefined;
      let costUsd: number | undefined;
      try {
        const r = await runBibleAuthor({
          supabase: serviceSupabase,
          assetId: newAssetId,
          seriesId: series.id,
          section: d.kind,
          slug,
          seedDescription: description,
          filename,
          source: 'canon_extension_approval',
        });
        enriched = true;
        costUsd = r.costUsd;
      } catch (err: unknown) {
        enrichmentError =
          err instanceof BibleAuthorError ? err.message : err instanceof Error ? err.message : String(err);
        await supabase.from('activity_events').insert({
          event_type: 'blocker_raised',
          severity: 'warning',
          title: `Bible enrichment failed: ${d.kind} "${slug}"`,
          description: `EXEC-BIBLE-AUTHOR could not enrich the DRAFT — ${enrichmentError}. Director can edit description manually or trigger regenerate-image.`,
          actor: 'EXEC-BIBLE-AUTHOR',
          asset_id: newAssetId,
          episode_id: evRow.episode_id ?? null,
          metadata: {
            kind: 'bible_enrichment_failure',
            section: d.kind,
            slug,
            error: enrichmentError,
          },
        } as never);
      }

      created.push({
        name: d.name,
        kind: d.kind,
        assetId: newAssetId,
        filename: (ins.data as { filename: string }).filename,
        enriched,
        enrichmentError,
        costUsd,
      });

      // Audit row
      await supabase.from('activity_events').insert({
        event_type: 'canon_extension_resolved',
        severity: 'info',
        title: `Bible extension approved: ${d.kind} "${slug}"`,
        description: `Director ${user.email ?? user.id} approved canon extension; DRAFT created in Bible Library${enriched ? ' (enriched by EXEC-BIBLE-AUTHOR)' : ' (enrichment pending)'}`,
        actor: user.id,
        episode_id: evRow.episode_id ?? null,
        metadata: {
          source_event_id: body.event_id,
          asset_id: newAssetId,
          decision: 'APPROVE',
          name: d.name,
          kind: d.kind,
          enriched,
          cost_usd: costUsd ?? null,
        },
      } as never);
    } else {
      rejected.push({ name: d.name, kind: d.kind, rationale_note: d.rationale_note });
      await supabase.from('activity_events').insert({
        event_type: 'canon_extension_resolved',
        severity: 'info',
        title: `Bible extension rejected: ${d.kind} "${d.name}"`,
        description: d.rationale_note
          ? `Director rejected — ${d.rationale_note}`
          : `Director rejected.`,
        actor: user.id,
        episode_id: evRow.episode_id ?? null,
        metadata: {
          source_event_id: body.event_id,
          decision: 'REJECT',
          name: d.name,
          kind: d.kind,
          rationale_note: d.rationale_note ?? null,
        },
      } as never);
    }
  }

  // Mark the source event resolved (all decisions in one shot for now).
  await resolveExtensionRequest(supabase, body.event_id);

  return apiOk({
    series_id: series.id,
    series_code: series.code,
    created,
    rejected,
    event_resolved: true,
  });
});
