// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/provider-resolver.ts
// Maps a contract name → ResolvedProvider: the global tier
// (`provider_assignments` table) + an optional PER-SERIES overlay
// (multi-channel Phase 4d, Director q4a: «сериал = производство»).
//
// Resolution order:
//   1. Read `provider_assignments` row for the contract (60s in-process cache).
//   2. If `is_active = false` → throw E-CONTRACT-DISABLED (global switch — a
//      series overlay can pick a different provider, never re-enable a
//      disabled contract).
//   3. When a seriesId is supplied: apply the overlay from `app_config`
//      (scope='providers', key=`assignment:<contract>:<seriesId>`) — the same
//      suffix-key convention as vgen_defaults:<seriesId>. Absent overlay =
//      inherit the global provider.
//   4. Verify env key (if any) is present. If not → fall back to 'mock'.
//   5. Return { providerId, isMock, … }.
//
// `storage` and `publish` are deliberately NOT overlayable: storage = one
// studio Drive (q5a), publish identity is resolved per channel at the gate.
//
// Mock is not a special case — it's a regular providerId. Resolver just
// reports which adapter the runner should call.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types.gen';
import { hasAnyYouTubeCredential } from './providers/google-auth';

export type ContractName =
  | 'image'
  | 'video'
  | 'character_video'
  | 'music'
  | 'sfx'
  | 'storage'
  | 'publish';

export interface ResolvedProvider {
  contract: ContractName;
  providerId: string;
  isActive: boolean;
  isMock: boolean;
  /** Env var that holds this provider's secret. null for mock / OAuth-based. */
  envKey: string | null;
  /** True iff envKey is null OR process.env[envKey] is non-empty. */
  envOk: boolean;
}

// Adapter id → required env key. `null` means no key needed (mock, OAuth).
// Veo runs through the Gemini API (single key), not Vertex OAuth — so
// it depends on GEMINI_API_KEY, not GOOGLE_REFRESH_TOKEN.
const ENV_KEY_BY_PROVIDER: Record<string, string | null> = {
  mock: null,
  'gpt-image-1': 'OPENAI_API_KEY',
  'flux-pro': 'FAL_AI_KEY',
  'imagen-3': 'GEMINI_API_KEY',
  'dall-e-3': 'OPENAI_API_KEY',
  'veo-3': 'GEMINI_API_KEY',
  'veo-3-img2vid': 'GEMINI_API_KEY',
  'seedance-fal': 'FAL_KEY',
  'seedance-fal-img2vid': 'FAL_KEY',
  'kling-3-elements': 'KLING_API_KEY',
  beatoven: 'BEATOVEN_API_KEY',
  suno: 'SUNO_API_KEY',
  'elevenlabs-sfx': 'ELEVENLABS_API_KEY',
  drive_native: 'GOOGLE_REFRESH_TOKEN',
  youtube_data_api: 'YOUTUBE_REFRESH_TOKEN',
};

/**
 * Is a provider's env requirement satisfied? Multi-channel special case:
 * YOUTUBE_REFRESH_TOKEN counts as satisfied when the bare legacy token OR any
 * per-channel YOUTUBE_REFRESH_TOKEN_<KEY> exists (multi-channel.md §3) — the
 * concrete token is resolved per channel at the gate, not here.
 */
export function isEnvKeySatisfied(envKey: string | null): boolean {
  if (envKey === null) return true;
  if (envKey === 'YOUTUBE_REFRESH_TOKEN') return hasAnyYouTubeCredential();
  return Boolean(process.env[envKey]?.trim());
}

interface CacheEntry {
  value: ResolvedProvider;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000;
// Keyed `<contract>|<seriesId or ''>` — one entry per (contract, series scope).
const cache = new Map<string, CacheEntry>();

/** Contracts a series may override. storage/publish stay studio/channel-level. */
export const SERIES_OVERRIDABLE_CONTRACTS: readonly ContractName[] = [
  'image',
  'video',
  'character_video',
  'music',
  'sfx',
];

/** The app_config key of a series' provider override for one contract. */
export function providerOverlayKey(contract: ContractName, seriesId: string): string {
  return `assignment:${contract}:${seriesId}`;
}

export function invalidateProviderCache(contract?: ContractName): void {
  if (!contract) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key === contract || key.startsWith(`${contract}|`)) cache.delete(key);
  }
}

export class ContractDisabledError extends Error {
  constructor(contract: ContractName) {
    super(`Contract '${contract}' is disabled (provider_assignments.is_active = false)`);
    this.name = 'ContractDisabledError';
  }
}

export class NoProviderAssignmentError extends Error {
  constructor(contract: ContractName) {
    super(`No row in provider_assignments for contract '${contract}'`);
    this.name = 'NoProviderAssignmentError';
  }
}

/** Read a series' provider override — null when unset/invalid. Exported for the UI route. */
export async function readProviderOverlay(
  supabase: SupabaseClient<Database>,
  contract: ContractName,
  seriesId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('app_config')
    .select('value')
    .eq('scope', 'providers')
    .eq('key', providerOverlayKey(contract, seriesId))
    .maybeSingle();
  const v = (data?.value as { active_provider_id?: unknown } | null)?.active_provider_id;
  return typeof v === 'string' && v.trim().length > 0 ? v : null;
}

export async function resolveProvider(
  supabase: SupabaseClient<Database>,
  contract: ContractName,
  seriesId?: string | null,
): Promise<ResolvedProvider> {
  const scopedSeriesId =
    seriesId && SERIES_OVERRIDABLE_CONTRACTS.includes(contract) ? seriesId : null;
  const cacheKey = `${contract}|${scopedSeriesId ?? ''}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const { data, error } = await supabase
    .from('provider_assignments')
    .select('contract,active_provider_id,is_active')
    .eq('contract', contract)
    .maybeSingle();

  if (error) {
    throw new Error(`provider_assignments fetch failed: ${error.message}`);
  }
  if (!data) {
    throw new NoProviderAssignmentError(contract);
  }
  if (!data.is_active) {
    throw new ContractDisabledError(contract);
  }

  // Per-series overlay (Phase 4d): a valid overlay swaps the provider id;
  // everything else (disable switch, env checks, mock downgrade) stays global.
  let providerId = data.active_provider_id;
  if (scopedSeriesId) {
    const overlay = await readProviderOverlay(supabase, contract, scopedSeriesId);
    if (overlay) providerId = overlay;
  }

  const envKey = ENV_KEY_BY_PROVIDER[providerId] ?? null;
  const envOk = isEnvKeySatisfied(envKey);

  // Auto-downgrade to 'mock' if the chosen provider's env key is missing.
  // Better than failing the whole pipeline silently when a key wasn't
  // provisioned. The Director sees `isMock = true` in metadata + can switch
  // back through the UI once the key is set.
  const effectiveProviderId = envOk ? providerId : 'mock';
  const value: ResolvedProvider = {
    contract,
    providerId: effectiveProviderId,
    isActive: true,
    isMock: effectiveProviderId === 'mock',
    envKey,
    envOk,
  };

  cache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}
