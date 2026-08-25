// ──────────────────────────────────────────────────────────────────────────────
// app/api/providers/concierge/route.ts
// Director-only GET/PUT for Polina's live LLM provider (Director 2026-07-05).
// GET  → current effective choice + the catalog (with per-option env health).
// PUT  → validate {provider, model} against the catalog, persist to app_config.
//        Takes effect on the next concierge request (no restart) via the llm.ts
//        override cache (busted on write).
// Mirrors app/api/system/governance-mode/route.ts (Director-only app_config edit).
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { ValidationError } from '@/lib/api/errors';
import { logEvent } from '@/lib/api/events';
import {
  CONCIERGE_PROVIDER_CATALOG,
  getConciergeProviderOverride,
  setConciergeProviderOverride,
  conciergeOptionId,
} from '@/lib/api/concierge-provider-config';
import { conciergeProvider, conciergeModel } from '@/lib/concierge/llm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Пустой envKey = путь ключа НЕ требует (харнес ходит по подписке) — такая
// строка здорова по построению, и «no key» рядом с ней было бы ложью.
function envPresent(key: string): boolean {
  if (!key) return true;
  return !!process.env[key]?.trim();
}

export const GET = withApiHandler(async () => {
  const { supabase } = await requireDirector();
  const override = await getConciergeProviderOverride(supabase);
  // Effective = override if set, else the env-derived default (llm.ts resolvers).
  const effective = override ?? { provider: conciergeProvider(), model: conciergeModel() };
  return apiOk({
    active_id: conciergeOptionId(effective),
    source: override ? 'app_config' : 'env',
    options: CONCIERGE_PROVIDER_CATALOG.map((o) => ({
      ...o,
      env_ok: envPresent(o.envKey),
    })),
  });
});

const Body = z
  .object({
    provider: z.enum(['openai', 'gemini', 'anthropic', 'claude-code', 'codex']),
    model: z.string().min(1).max(120),
  })
  .strict();

export const PUT = withApiHandler(async (req) => {
  const { supabase, user } = await requireDirector();
  const body = await parseJson(req, Body);
  const match = CONCIERGE_PROVIDER_CATALOG.find(
    (o) => o.provider === body.provider && o.model === body.model,
  );
  if (!match) {
    throw new ValidationError(
      `Unknown concierge provider/model "${body.provider}:${body.model}" (not in catalog)`,
    );
  }
  await setConciergeProviderOverride(supabase, { provider: match.provider, model: match.model });
  await logEvent(supabase, {
    event_type: 'provider_assignment_changed',
    severity: 'info',
    title: `Polina provider set → ${match.display_name}`,
    description: `Director switched the Prod Assistant LLM to ${match.display_name} (live).`,
    actor: user.email ?? user.id,
    metadata: { kind: 'concierge_provider_changed', provider: match.provider, model: match.model },
  });
  return apiOk({ active_id: match.id, provider: match.provider, model: match.model });
});
