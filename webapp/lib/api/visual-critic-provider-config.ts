// ──────────────────────────────────────────────────────────────────────────────
// lib/api/visual-critic-provider-config.ts
// Model selection for the post-render Visual Critic — a Studio-settings dropdown,
// mirroring the Polina concierge provider picker (concierge-provider-config.ts).
//
// Only VISION-capable models belong here (the critic must SEE the render). The
// Director picks one in Settings → Providers; it persists to app_config and takes
// effect on the next critic run (no restart). One selector serves both the IMG-ref
// and VID-shot critic (splittable into two scopes later if per-stage control is wanted).
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types.gen';

type Client = SupabaseClient<Database>;

export type VisualCriticProvider = 'openai' | 'gemini' | 'anthropic';

export interface VisualCriticChoice {
  provider: VisualCriticProvider;
  model: string;
}

export interface VisualCriticOption extends VisualCriticChoice {
  id: string;
  display_name: string;
  envKey: string;
}

const SCOPE = 'visual_critic';
const KEY = 'model';

// Vision-capable models the critic can run on. Kept in sync with what
// lib/agents/visual-verdict.ts `visionClient` supports (openai/anthropic/gemini by
// model prefix). All entries below accept image input.
// Order = dropdown order. claude-opus-4-8 first: on the E28 sh16 calibration it was
// the only model that RELIABLY caught the racket/net/geometry defects; gpt-5.6-terra
// flip-flopped on the same image. Reliability > cost for a QA critic — the Director
// can dial down via this list.
export const VISUAL_CRITIC_CATALOG: VisualCriticOption[] = [
  { id: 'anthropic:claude-opus-4-8', provider: 'anthropic', model: 'claude-opus-4-8', display_name: 'Anthropic · claude-opus-4-8 (sharpest — reliable)', envKey: 'ANTHROPIC_API_KEY' },
  { id: 'anthropic:claude-sonnet-5', provider: 'anthropic', model: 'claude-sonnet-5', display_name: 'Anthropic · claude-sonnet-5', envKey: 'ANTHROPIC_API_KEY' },
  { id: 'openai:gpt-5.6-sol', provider: 'openai', model: 'gpt-5.6-sol', display_name: 'OpenAI · gpt-5.6-sol (frontier)', envKey: 'OPENAI_API_KEY' },
  { id: 'openai:gpt-5.6-terra', provider: 'openai', model: 'gpt-5.6-terra', display_name: 'OpenAI · gpt-5.6-terra (balanced — flaky on hard checks)', envKey: 'OPENAI_API_KEY' },
  { id: 'openai:gpt-5.6-luna', provider: 'openai', model: 'gpt-5.6-luna', display_name: 'OpenAI · gpt-5.6-luna (cost)', envKey: 'OPENAI_API_KEY' },
  { id: 'gemini:gemini-2.5-pro', provider: 'gemini', model: 'gemini-2.5-pro', display_name: 'Gemini · 2.5-pro (verify image support)', envKey: 'GEMINI_API_KEY' },
  { id: 'gemini:gemini-2.5-flash', provider: 'gemini', model: 'gemini-2.5-flash', display_name: 'Gemini · 2.5-flash (cheap — verify)', envKey: 'GEMINI_API_KEY' },
];

export function visualCriticOptionId(choice: VisualCriticChoice): string {
  return `${choice.provider}:${choice.model}`;
}

/** Env-derived default when no override is set. Calibrated on gpt-5.6-terra. */
export function visualCriticDefault(): VisualCriticChoice {
  const model = process.env.VISUAL_CRITIC_MODEL?.trim() || 'claude-opus-4-8';
  const match = VISUAL_CRITIC_CATALOG.find((o) => o.model === model);
  return match ? { provider: match.provider, model: match.model } : { provider: 'openai', model };
}

function coerceChoice(value: unknown): VisualCriticChoice | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as { provider?: unknown; model?: unknown };
  const match = VISUAL_CRITIC_CATALOG.find((o) => o.provider === v.provider && o.model === v.model);
  return match ? { provider: match.provider, model: match.model } : null;
}

/** Persisted override from app_config, or null when unset/invalid. */
export async function getVisualCriticOverride(supabase: Client): Promise<VisualCriticChoice | null> {
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
export async function setVisualCriticOverride(supabase: Client, choice: VisualCriticChoice): Promise<void> {
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
}

/**
 * The model the critic should run on right now: the persisted override, else the
 * env-derived default. Low-frequency call (once per rendered asset) so it reads
 * app_config directly — no hot-path cache needed. Fail-open to the default.
 */
export async function resolveVisualCriticModel(supabase: Client): Promise<string> {
  try {
    const override = await getVisualCriticOverride(supabase);
    return (override ?? visualCriticDefault()).model;
  } catch {
    return visualCriticDefault().model;
  }
}
