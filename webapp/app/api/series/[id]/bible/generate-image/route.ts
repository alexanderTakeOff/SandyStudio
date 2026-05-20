// ──────────────────────────────────────────────────────────────────────────────
// app/api/series/[id]/bible/generate-image/route.ts
// Director-triggered gpt-image-2 generation for a Bible asset.
//
// Flow:
//   1. Director fills Add Hero modal (name, description) and clicks Generate.
//   2. This route reads the description + the Style guide entries from the
//      target series (if any LOCKED SBL-style_* exists, its content is added
//      to the prompt to keep canonical art direction).
//   3. Calls openai-image (gpt-image-2) — paid call ~$0.04.
//   4. Persists binary via persistBinary (local cache + Drive when on).
//   5. Returns staging URL for live preview. Director then POSTs to
//      /api/series/[id]/bible to persist the asset row using the staging URL.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { NotFoundError } from '@/lib/api/errors';
import { generateImageOpenAI } from '@/lib/agents/providers/openai-image';
import { persistBinary } from '@/lib/agents/persist-binary';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { logEvent } from '@/lib/api/events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  section: z.enum(['character', 'location', 'object', 'style']),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9_-]+$/i),
  description: z.string().min(1).max(20_000),
  /** Optional: caller's preferred quality tier; default 'medium'. */
  quality: z.enum(['low', 'medium', 'high']).optional(),
});

function buildPrompt(args: {
  seriesTitle: string;
  section: 'character' | 'location' | 'object' | 'style';
  description: string;
  styleGuides: string[];
}): string {
  const { seriesTitle, section, description, styleGuides } = args;
  const sectionWord =
    section === 'character'
      ? 'character'
      : section === 'location'
        ? 'location'
        : section === 'object'
          ? 'prop'
          : 'style sample frame';
  const lines = [
    `Canonical ${sectionWord} reference for the animated series "${seriesTitle}".`,
    '',
    'Description:',
    description,
  ];
  if (styleGuides.length > 0) {
    lines.push('', 'Series art direction (must follow):');
    for (const g of styleGuides) lines.push(`- ${g.slice(0, 600)}`);
  }
  lines.push(
    '',
    'Render as a clean reference image — front-facing or three-quarter view, neutral background, full-body if a character, no text overlay, no logo. Studio canon — should be reusable across many shots.',
  );
  return lines.join('\n');
}

export const POST = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const seriesId = params?.id;
  if (!seriesId) throw new NotFoundError('Series');

  const { user } = await requireDirector();
  const body = await parseJson(req, Body);

  // Always go through service-role for asset queries — we touch RLS-bound rows
  // and want to read across them deterministically.
  const sb = createSupabaseServiceRoleClient();

  const { data: series, error: serr } = await sb
    .from('series')
    .select('id,code,title')
    .eq('id', seriesId)
    .maybeSingle();
  if (serr) throw new Error(`series fetch: ${serr.message}`);
  if (!series) throw new NotFoundError(`Series ${seriesId}`);

  // Pull LOCKED Style guides (if any) to enrich the prompt — this is what
  // keeps generated character/location refs visually consistent across the
  // canon.
  const { data: styleAssets } = await sb
    .from('assets')
    .select('content,description')
    .eq('series_id', seriesId)
    .eq('status', 'LOCKED')
    .like('file_type', 'SBL-style%');
  const styleGuides = (styleAssets ?? [])
    .map((a) => a.content || a.description)
    .filter((s): s is string => Boolean(s && s.trim()))
    .slice(0, 3);

  const prompt = buildPrompt({
    seriesTitle: series.title,
    section: body.section,
    description: body.description,
    styleGuides,
  });

  const real = await generateImageOpenAI({
    prompt,
    size: '1024x1024',
    quality: body.quality ?? 'medium',
  });

  const slugSafe = body.slug.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const filename = `${series.code}-BIB-${body.section}_${slugSafe}-staging.png`;

  const persisted = await persistBinary({
    base64: real.b64_data,
    ext: 'png',
    driveFilename: filename,
    localHint: `bible-${body.section}-${slugSafe}`,
    // Director directive 2026-05-20 — Bible Library lands under series root:
    //   /SandyStudio/<series.code>/bible/images/<file>
    seriesCode: series.code,
    bucket: 'bible',
    assetType: 'images',
    supabase: sb,
  });

  // Audit — written through logEvent so the row passes the CHECK
  // constraint AND the Postgres trigger mirrors it into concierge_turns
  // AND logEvent fires `pa/notify-needed` so Polina auto-acknowledges.
  // event_type was 'asset_created' before — that value is NOT in the
  // activity_events_type_valid CHECK list, so every previous insert
  // silently failed (caught nowhere visible). Switched to 'agent_completed'
  // with actor='EXEC-BIBLE-AUTHOR' to align with other agent flows.
  await logEvent(sb, {
    event_type: 'agent_completed',
    severity: 'info',
    title: `Bible image generated: ${body.section}/${slugSafe}`,
    description: `Library reference generated via gpt-image-2 ($${real.cost_usd.toFixed(4)})`,
    actor: 'EXEC-BIBLE-AUTHOR',
    asset_id: null,
    episode_id: null,
    metadata: {
      kind: 'bible_image_staging',
      section: body.section,
      slug: body.slug,
      cost_usd: real.cost_usd,
      width: real.width,
      height: real.height,
      drive_file_id: persisted.driveFileId,
      director_id: user.id,
    },
  });

  return apiOk({
    staging_url: persisted.browserUrl,
    drive_file_id: persisted.driveFileId,
    drive_web_view_url: persisted.driveWebViewUrl,
    width: real.width,
    height: real.height,
    cost_usd: real.cost_usd,
    prompt_used: prompt,
  });
});
