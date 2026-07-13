// ──────────────────────────────────────────────────────────────────────────────
// app/api/providers/visual-critic/route.ts
// Director-only GET/PUT for the post-render Visual Critic's vision model.
// GET  → current effective choice + the vision-model catalog (per-option env health).
// PUT  → validate {provider, model} against the catalog, persist to app_config.
//        Takes effect on the next critic run (no restart).
// Mirrors app/api/providers/concierge/route.ts.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { ValidationError } from '@/lib/api/errors';
import { logEvent } from '@/lib/api/events';
import {
  VISUAL_CRITIC_CATALOG,
  getVisualCriticOverride,
  setVisualCriticOverride,
  visualCriticDefault,
  visualCriticOptionId,
} from '@/lib/api/visual-critic-provider-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function envPresent(key: string): boolean {
  return !!process.env[key]?.trim();
}

export const GET = withApiHandler(async () => {
  const { supabase } = await requireDirector();
  const override = await getVisualCriticOverride(supabase);
  const effective = override ?? visualCriticDefault();
  return apiOk({
    active_id: visualCriticOptionId(effective),
    source: override ? 'app_config' : 'env',
    options: VISUAL_CRITIC_CATALOG.map((o) => ({ ...o, env_ok: envPresent(o.envKey) })),
  });
});

const Body = z
  .object({
    provider: z.enum(['openai', 'gemini', 'anthropic']),
    model: z.string().min(1).max(120),
  })
  .strict();

export const PUT = withApiHandler(async (req) => {
  const { supabase, user } = await requireDirector();
  const body = await parseJson(req, Body);
  const match = VISUAL_CRITIC_CATALOG.find((o) => o.provider === body.provider && o.model === body.model);
  if (!match) {
    throw new ValidationError(
      `Unknown visual-critic provider/model "${body.provider}:${body.model}" (not in catalog)`,
    );
  }
  await setVisualCriticOverride(supabase, { provider: match.provider, model: match.model });
  await logEvent(supabase, {
    event_type: 'provider_assignment_changed',
    severity: 'info',
    title: `Visual Critic model set → ${match.display_name}`,
    description: `Director switched the post-render Visual Critic vision model to ${match.display_name} (live).`,
    actor: user.email ?? user.id,
    metadata: { kind: 'visual_critic_provider_changed', provider: match.provider, model: match.model },
  });
  return apiOk({ active_id: match.id, provider: match.provider, model: match.model });
});
