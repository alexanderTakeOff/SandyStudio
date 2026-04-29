// ──────────────────────────────────────────────────────────────────────────────
// app/api/episodes/[id]/trigger/route.ts
// Manual agent re-trigger override per webapp.md §5.3 + pipeline_view.md §7.
// Director always; EXEC-DIR-AI in Mode 2/3 (Phase 8 issues service token).
//
// Body: { agentCode, payload?, reason }    — reason is REQUIRED.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { inngest, type StudioEventName } from '@/lib/inngest/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TriggerBody = z.object({
  agentCode: z.string().min(1),
  reason: z.string().min(3).max(500),
  payload: z.record(z.string(), z.unknown()).optional(),
});

const AGENT_TO_EVENT: Record<string, StudioEventName> = {
  'EXEC-SW':    'sandystudio/exec-sw/write-script',
  'EXEC-SREV':  'sandystudio/exec-srev/review-script',
  'EXEC-SB':    'sandystudio/exec-sb/create-storyboard',
  'EXEC-WCHK':  'sandystudio/exec-wchk/check-world',
  'EXEC-EDIT':  'sandystudio/exec-edit/create-animatic',
  'EXEC-VGEN':  'sandystudio/exec-vgen/generate-shot',
  'EXEC-MGEN':  'sandystudio/exec-mgen/generate-music',
  'EXEC-COPY':  'sandystudio/exec-copy/write-metadata',
  'EXEC-THUMB': 'sandystudio/exec-thumb/generate-thumbnail',
  'EXEC-PUB':   'sandystudio/exec-pub/publish',
  'EXEC-ANAL':  'sandystudio/exec-anal/collect',
};

export const POST = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const id = params?.id;
  if (!id) throw new NotFoundError('Episode');

  const { user, supabase } = await requireDirector();
  const body = await parseJson(req, TriggerBody);

  const eventName = AGENT_TO_EVENT[body.agentCode];
  if (!eventName) {
    throw new ValidationError(
      `Unknown agentCode "${body.agentCode}". Allowed: ${Object.keys(AGENT_TO_EVENT).join(', ')}`,
    );
  }

  const { data: ep, error: epErr } = await supabase
    .from('episodes')
    .select('id,governance_mode,episode_code')
    .eq('id', id)
    .maybeSingle();
  if (epErr) throw new Error(`episode fetch failed: ${epErr.message}`);
  if (!ep) throw new NotFoundError(`Episode ${id}`);

  // Build event payload — caller is responsible for matching agent's expected shape.
  // We always inject episodeId and reason. directorConfirm passes for PUBLISH.
  const eventPayload: Record<string, unknown> = {
    episodeId: id,
    ...body.payload,
  };
  if (body.agentCode === 'EXEC-PUB') {
    eventPayload.directorConfirm = true;
    eventPayload.confirmedBy = user.id;
  }

  const { ids } = await inngest.send({
    name: eventName,
    data: eventPayload as never,
  });

  await supabase.from('activity_events').insert({
    event_type: 'manual_trigger',
    severity: 'warning',
    title: `Manual trigger: ${body.agentCode}`,
    description: body.reason,
    actor: user.id,
    episode_id: id,
    metadata: {
      agent: body.agentCode,
      event: eventName,
      reason: body.reason,
      payload: body.payload ?? null,
      inngest_event_ids: ids,
    },
  } as never);

  return apiOk({
    triggered: true,
    agent: body.agentCode,
    inngest_event: eventName,
    inngest_event_ids: ids,
  });
});
