// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/provider-resolver.ts
// Maps a contract name → ResolvedProvider per the global tier
// (`provider_assignments` table). Per-stage overrides will land later.
//
// Resolution order:
//   1. Read `provider_assignments` row for the contract (60s in-process cache).
//   2. If `is_active = false` → throw E-CONTRACT-DISABLED.
//   3. Verify env key (if any) is present. If not → fall back to 'mock'.
//   4. Return { providerId, isMock, capabilities? }.
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
const cache = new Map<ContractName, CacheEntry>();

export function invalidateProviderCache(contract?: ContractName): void {
  if (contract) cache.delete(contract);
  else cache.clear();
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

export async function resolveProvider(
  supabase: SupabaseClient<Database>,
  contract: ContractName,
): Promise<ResolvedProvider> {
  const cached = cache.get(contract);
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

  const providerId = data.active_provider_id;
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

  cache.set(contract, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}
