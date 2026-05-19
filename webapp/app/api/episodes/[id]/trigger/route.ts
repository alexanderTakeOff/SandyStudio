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
import { ConflictError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { inngest, type StudioEventName } from '@/lib/inngest/client';
import { isAnimaticV1, type AnimaticContract } from '@/lib/api/animatic-shotlist';
import { pickPilotVgenShots } from '@/lib/api/vgen-shot-helpers';
import { setVgenPilotState } from '@/lib/api/vgen-pilot-state';

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
  'EXEC-EREF':  'sandystudio/exec-eref/start',
  // Sprint «Дизайнер и Аниматор» 2026-05-18+19 — Designer/Critic re-trigger
  // via PA. Designer accepts shotId + optional revisionNote in payload; Critic
  // accepts planAssetId + shotId.
  'EXEC-EREF-DESIGNER': 'sandystudio/exec-eref-designer/plan',
  'EXEC-EPREV': 'sandystudio/exec-eprev/review-plan',
  'EXEC-EDIT':  'sandystudio/exec-edit/create-animatic',
  'EXEC-VGEN':   'sandystudio/exec-vgen/generate-shot',
  'EXEC-MGEN':   'sandystudio/exec-mgen/generate-music',
  // EXEC-STITCH added 2026-05-10 — agent shipped in d1c820d (Final Cut row
  // in pipeline DAG + StageKebabMenu wiring), but the re-trigger whitelist
  // was missed. Event payload is BaseEpisodeEvent (episodeId only); the
  // generic path below already injects episodeId, so no special handling.
  'EXEC-STITCH': 'sandystudio/exec-stitch/assemble-episode',
  'EXEC-COPY':   'sandystudio/exec-copy/write-metadata',
  'EXEC-THUMB':  'sandystudio/exec-thumb/generate-thumbnail',
  'EXEC-PUB':    'sandystudio/exec-pub/publish',
  'EXEC-ANAL':   'sandystudio/exec-anal/collect',
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

  // ── EXEC-VGEN special path: route to Pilot Pass if animatic_v1 is approved
  // and no explicit shotId override is in payload.
  // Per purrfect-stirring-hollerith plan, manual re-trigger of VGEN should
  // enter the Pilot Pass flow (pick 1-2 pilots → /start) rather than legacy
  // 3-fake-shots fan-out. Caller can force legacy by passing payload.shotId.
  if (body.agentCode === 'EXEC-VGEN' && !body.payload?.shotId) {
    const { data: animatics, error: animErr } = await supabase
      .from('assets')
      .select('id,status,metadata,created_at')
      .eq('episode_id', id)
      .eq('file_type', 'VID-animatic')
      .order('created_at', { ascending: false })
      .limit(20);
    if (animErr) throw new Error(`animatic fetch failed: ${animErr.message}`);

    let v1: AnimaticContract | null = null;
    for (const a of animatics ?? []) {
      if ((a.status === 'APPROVED' || a.status === 'LOCKED') && isAnimaticV1(a.metadata)) {
        v1 = (a.metadata as { animatic_v1: AnimaticContract }).animatic_v1;
        break;
      }
    }
    if (v1) {
      const shotList = v1.shot_list ?? [];
      const pilots = pickPilotVgenShots(shotList);
      if (pilots.length === 0) {
        throw new ConflictError(
          'Approved animatic has no shots — cannot start VGEN Pilot Pass',
        );
      }

      // Set state PENDING_REVIEW upfront so the pillbar shows "VGEN Pilot 0/N"
      // immediately. Runner will reaffirm after each pilot completes.
      await setVgenPilotState(supabase, id, 'PENDING_REVIEW');

      const pilotEvents = pilots.map((p) => ({
        name: 'sandystudio/exec-vgen/start' as const,
        data: {
          episodeId: id,
          shotId: p.shotId,
          duration_seconds: p.durationSeconds,
          pilot: true,
        },
      }));
      const { ids } = await inngest.send(pilotEvents as never);

      await supabase.from('activity_events').insert({
        event_type: 'manual_trigger',
        severity: 'warning',
        title: `Manual trigger: EXEC-VGEN (Pilot Pass, ${pilots.length} shots)`,
        description: body.reason,
        actor: user.id,
        episode_id: id,
        metadata: {
          agent: 'EXEC-VGEN',
          event: 'sandystudio/exec-vgen/start',
          reason: body.reason,
          pilot_count: pilots.length,
          pilot_shot_ids: pilots.map((p) => p.shotId),
          inngest_event_ids: ids,
        },
      } as never);

      return apiOk({
        triggered: true,
        agent: 'EXEC-VGEN',
        flow: 'pilot_pass',
        pilot_count: pilots.length,
        pilot_shot_ids: pilots.map((p) => p.shotId),
        inngest_event: 'sandystudio/exec-vgen/start',
        inngest_event_ids: ids,
      });
    }
    // Fall through to legacy if no v1 animatic — keep replay-pilot working.
  }

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
