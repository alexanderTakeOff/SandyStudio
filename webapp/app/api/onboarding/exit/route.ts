// ──────────────────────────────────────────────────────────────────────────────
// app/api/onboarding/exit/route.ts
// Mark onboarding as exited (with or without first episode). Sets
// completed_steps = [1,2,3,4] so the wizard never auto-runs again. Per
// onboarding.md §7.4.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ExitBody = z.object({
  reason: z.enum(['completed', 'skipped_episode', 'manual_exit']),
});

export const POST = withApiHandler(async (req) => {
  const { user, supabase } = await requireDirector();
  const body = await parseJson(req, ExitBody);

  const updated = {
    current_step: 4 as const,
    completed_steps: [1, 2, 3, 4],
    draft_series_id: null,
    draft_episode_id: null,
    started_at: new Date().toISOString(),
    exited_at: new Date().toISOString(),
    exit_reason: body.reason,
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
    title: 'Onboarding wizard exited',
    description: `Reason: ${body.reason}; by ${user.email ?? user.id}`,
    actor: user.id,
    metadata: { reason: body.reason },
  });

  return apiOk(updated);
});
