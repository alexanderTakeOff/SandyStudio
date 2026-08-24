// ──────────────────────────────────────────────────────────────────────────────
// lib/api/concierge-provider-config.ts
// Live, runtime-switchable provider/model for the Prod Assistant (Polina).
// Director 2026-07-05: pick Polina's LLM from a dropdown in studio Settings →
// Providers and have it take effect ON THE FLY (no .env edit + restart).
//
// Storage: app_config (scope='providers', key='concierge_provider') → jsonb
//   { provider, model }. Mirrors the established live-config pattern
//   (lib/api/eref-config.ts getEREFProvider + governance-mode upsert writer).
//
// Application: concierge routes call applyConciergeProviderOverride(supabase) at
// request start; it reads app_config (TTL-cached) and pushes the choice into the
// llm.ts process-level override that every concierge resolver reads first. So a
// dropdown flip is picked up by the next Polina request without a restart.
// The env vars (CONCIERGE_PROVIDER / CONCIERGE_*_MODEL) remain the fallback default.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types.gen';
import { _setConciergeOverride, type ConciergeProvider } from '@/lib/concierge/llm';

type Client = SupabaseClient<Database>;

const SCOPE = 'providers';
const KEY = 'concierge_provider';

export interface ConciergeProviderChoice {
  provider: ConciergeProvider;
  model: string;
}

export interface ConciergeProviderOption extends ConciergeProviderChoice {
  /** Stable id for the <option> value — `${provider}:${model}`. */
  id: string;
  display_name: string;
  /** Env key that must be present for this provider to actually work. */
  envKey: string;
}

// Only executable subscription harnesses belong here. The old API list survived
// the Ф6 deletion of its HTTP runners and let Settings promise models nobody ran.
// Catalog entry => real mind-bridge adapter is now a guarded invariant.
export const CONCIERGE_PROVIDER_CATALOG: ConciergeProviderOption[] = [
  // ── ХАРНЕС (то, чем Полина работает СЕЙЧАС) ───────────────────────────────
  // Ходы ведёт мост через `claude -p` по ПОДПИСКЕ: API-ключ в окружение хода не
  // передаётся вовсе. Модель называется АЛИАСОМ (`opus` / `sonnet`) — его
  // разворачивает подписка, поэтому смена поколения у провайдера не ломает
  // настройку. `envKey` тут пустой: ключа этот путь не требует по построению.
  { id: 'claude-code:opus', provider: 'claude-code', model: 'opus', display_name: 'Подписка · Opus (claude-opus-5, окно 1M)', envKey: '' },
  { id: 'claude-code:sonnet', provider: 'claude-code', model: 'sonnet', display_name: 'Подписка · Sonnet (claude-sonnet-5, окно 1M)', envKey: '' },
  { id: 'codex:gpt-5.6-sol', provider: 'codex', model: 'gpt-5.6-sol', display_name: 'Подписка OpenAI · Sol (frontier)', envKey: '' },
  { id: 'codex:gpt-5.6-terra', provider: 'codex', model: 'gpt-5.6-terra', display_name: 'Подписка OpenAI · Terra (balanced)', envKey: '' },
  { id: 'codex:gpt-5.6-luna', provider: 'codex', model: 'gpt-5.6-luna', display_name: 'Подписка OpenAI · Luna (cost)', envKey: '' },
];

export function conciergeOptionId(choice: ConciergeProviderChoice): string {
  return `${choice.provider}:${choice.model}`;
}

/** Validate persisted jsonb and migrate the three former OpenAI API rows in place. */
export function coerceConciergeProviderChoice(value: unknown): ConciergeProviderChoice | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as { provider?: unknown; model?: unknown };
  if (
    v.provider === 'openai' &&
    typeof v.model === 'string' &&
    ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'].includes(v.model)
  ) {
    return { provider: 'codex', model: v.model };
  }
  const match = CONCIERGE_PROVIDER_CATALOG.find(
    (o) => o.provider === v.provider && o.model === v.model,
  );
  return match ? { provider: match.provider, model: match.model } : null;
}

/**
 * Read the persisted override from app_config. Returns null when unset or invalid
 * (caller then falls back to the env default). Not cached — used by the settings
 * GET route; the hot path uses applyConciergeProviderOverride's TTL cache.
 */
export async function getConciergeProviderOverride(
  supabase: Client,
): Promise<ConciergeProviderChoice | null> {
  const { data, error } = await supabase
    .from('app_config')
    .select('value')
    .eq('scope', SCOPE)
    .eq('key', KEY)
    .maybeSingle();
  if (error || !data) return null;
  return coerceConciergeProviderChoice((data as { value?: unknown }).value);
}

/** Persist the override (Director-only route). Validated against the catalog by the caller. */
export async function setConciergeProviderOverride(
  supabase: Client,
  choice: ConciergeProviderChoice,
): Promise<void> {
  await supabase.from('app_config').upsert(
    {
      scope: SCOPE,
      key: KEY,
      value: choice as unknown as Database['public']['Tables']['app_config']['Row']['value'],
      source: 'ui_edit',
      synced_at: new Date().toISOString(),
    } as never,
    { onConflict: 'scope,key' },
  );
  _appliedAt = 0; // bust the TTL cache so the next request re-reads immediately
}

// TTL cache so the hot concierge path doesn't hit app_config on every request.
// 30s propagation across processes (like provider-resolver's 60s), instant in-proc
// after a write (setConciergeProviderOverride resets _appliedAt).
const APPLY_TTL_MS = 30_000;
let _appliedAt = 0;

/**
 * Read the persisted override and push it into the llm.ts process-level cache so
 * every concierge resolver (provider/model/client/param helpers + cost stamping)
 * reflects it. Call at the start of each concierge request. Fail-open: on a read
 * error we leave the current cache (env default) untouched.
 */
export async function applyConciergeProviderOverride(supabase: Client): Promise<void> {
  const now = Date.now();
  if (now - _appliedAt < APPLY_TTL_MS) return;
  _appliedAt = now;
  try {
    const choice = await getConciergeProviderOverride(supabase);
    _setConciergeOverride(choice ? { provider: choice.provider, model: choice.model } : null);
  } catch {
    // fail-open — keep the env-derived default
  }
}
