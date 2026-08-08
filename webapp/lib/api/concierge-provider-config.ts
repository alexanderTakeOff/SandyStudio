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

// The "popular providers" Polina can run on. Small curated list — the media
// provider catalog (provider-catalog.ts) holds NO LLM-chat entries, so this is a
// justified new list, not a duplicate. Keep model ids in sync with what
// lib/concierge/llm.ts + createConciergeClient support (openai/anthropic/gemini).
export const CONCIERGE_PROVIDER_CATALOG: ConciergeProviderOption[] = [
  { id: 'openai:gpt-5.5', provider: 'openai', model: 'gpt-5.5', display_name: 'OpenAI · gpt-5.5', envKey: 'OPENAI_API_KEY' },
  { id: 'openai:gpt-5.4-mini', provider: 'openai', model: 'gpt-5.4-mini', display_name: 'OpenAI · gpt-5.4-mini', envKey: 'OPENAI_API_KEY' },
  // GPT-5.6 frontier tiers (developers.openai.com/api/docs/models): sol =
  // frontier (alias gpt-5.6), terra = balanced intelligence/cost, luna =
  // cost-optimized. Full `gpt-5.6-<tier>` ids are REQUIRED — the bare codename
  // (`sol`) breaks isOpenAiGpt5Model() and the tools+reasoning_effort=none fix.
  { id: 'openai:gpt-5.6-sol', provider: 'openai', model: 'gpt-5.6-sol', display_name: 'OpenAI · gpt-5.6-sol (frontier)', envKey: 'OPENAI_API_KEY' },
  { id: 'openai:gpt-5.6-terra', provider: 'openai', model: 'gpt-5.6-terra', display_name: 'OpenAI · gpt-5.6-terra (balanced)', envKey: 'OPENAI_API_KEY' },
  { id: 'openai:gpt-5.6-luna', provider: 'openai', model: 'gpt-5.6-luna', display_name: 'OpenAI · gpt-5.6-luna (cost)', envKey: 'OPENAI_API_KEY' },
  { id: 'anthropic:claude-sonnet-5', provider: 'anthropic', model: 'claude-sonnet-5', display_name: 'Anthropic · claude-sonnet-5', envKey: 'ANTHROPIC_API_KEY' },
  { id: 'anthropic:claude-opus-4-8', provider: 'anthropic', model: 'claude-opus-4-8', display_name: 'Anthropic · claude-opus-4-8', envKey: 'ANTHROPIC_API_KEY' },
  // Окно 1M — ОТДЕЛЬНАЯ строка, не свойство модели (Директор 08.08): суффикс
  // `-1m` в model триггерит anthropic-beta: context-1m-2025-08-07 в native-пути
  // (lib/concierge/anthropic-native.ts resolveModel). Компат-поверхность бету не
  // умеет — на ней суффикс снимается перед отправкой, окно остаётся стандартным.
  { id: 'anthropic:claude-opus-4-8-1m', provider: 'anthropic', model: 'claude-opus-4-8-1m', display_name: 'Anthropic · claude-opus-4-8 [1m]', envKey: 'ANTHROPIC_API_KEY' },
  { id: 'gemini:gemini-2.5-flash', provider: 'gemini', model: 'gemini-2.5-flash', display_name: 'Gemini · 2.5-flash (free)', envKey: 'GEMINI_API_KEY' },
  { id: 'gemini:gemini-2.5-pro', provider: 'gemini', model: 'gemini-2.5-pro', display_name: 'Gemini · 2.5-pro', envKey: 'GEMINI_API_KEY' },
];

export function conciergeOptionId(choice: ConciergeProviderChoice): string {
  return `${choice.provider}:${choice.model}`;
}

/** Validate an arbitrary jsonb value against the catalog. Returns null if unknown. */
function coerceChoice(value: unknown): ConciergeProviderChoice | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as { provider?: unknown; model?: unknown };
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
  return coerceChoice((data as { value?: unknown }).value);
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
