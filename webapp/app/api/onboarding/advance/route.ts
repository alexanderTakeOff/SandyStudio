// ──────────────────────────────────────────────────────────────────────────────
// app/api/onboarding/advance/route.ts
// Advance the onboarding wizard one step. Per onboarding.md §2 + §12.
// Steps 1-4 each accept a payload; payload is validated and persisted.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { ValidationError } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AdvanceBody = z.object({
  step: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  payload: z.record(z.string(), z.unknown()).optional(),
});

interface OnboardingState {
  current_step: 1 | 2 | 3 | 4;
  completed_steps: number[];
  draft_series_id: string | null;
  draft_episode_id: string | null;
  started_at: string | null;
}

const DEFAULT_STATE: OnboardingState = {
  current_step: 1,
  completed_steps: [],
  draft_series_id: null,
  draft_episode_id: null,
  started_at: null,
};

export const POST = withApiHandler(async (req) => {
  const { user, supabase } = await requireDirector();
  const body = await parseJson(req, AdvanceBody);

  const { data: existing } = await supabase
    .from('app_config')
    .select('value')
    .eq('scope', 'onboarding')
    .eq('key', 'state')
    .maybeSingle();

  const state: OnboardingState = (existing?.value as OnboardingState | undefined) ?? {
    ...DEFAULT_STATE,
    started_at: new Date().toISOString(),
  };

  if (state.completed_steps.includes(body.step)) {
    throw new ValidationError(`Step ${body.step} already completed`);
  }
  if (body.step !== state.current_step) {
    throw new ValidationError(
      `Step ${body.step} not in sequence (current_step=${state.current_step})`,
    );
  }

  // Capture draft_series_id from step 2 payload, draft_episode_id from step 4
  const payload = body.payload ?? {};
  const updated: OnboardingState = {
    ...state,
    completed_steps: [...state.completed_steps, body.step],
    current_step: (body.step < 4 ? (body.step + 1) : 4) as OnboardingState['current_step'],
    started_at: state.started_at ?? new Date().toISOString(),
    draft_series_id:
      typeof payload.series_id === 'string'
        ? payload.series_id
        : state.draft_series_id,
    draft_episode_id:
      typeof payload.episode_id === 'string'
        ? payload.episode_id
        : state.draft_episode_id,
  };

  await supabase.from('app_config').upsert(
    {
      scope: 'onboarding',
      key: 'state',
      value: updated as never,
      source: 'ui_edit',
      synced_at: new Date().toISOString(),
    },
    { onConflict: 'scope,key' },
  );

  await supabase.from('activity_events').insert({
    event_type: 'onboarding_advanced',
    severity: 'info',
    title: `Onboarding step ${body.step} completed`,
    description: `Director ${user.email ?? user.id} advanced wizard`,
    actor: user.id,
    metadata: { step: body.step, payload: body.payload ?? null },
  } as never);

  return apiOk(updated);
});
