// ──────────────────────────────────────────────────────────────────────────────
// lib/providers/image-gen-multi-registry.ts
// Map MultiImageGenProvider id → implementation. The EREF runner asks for a
// provider by id (resolved from `app_config.eref_provider` or per-shot
// override) and picks the matching impl from this map.
//
// Adding a new provider:
//   1. Implement MultiImageGenProvider in a new file under providers/
//   2. Add the entry here
//   3. Extend EREFProviderId enum in lib/api/eref-config.ts
//   4. Wire up env-key check below if the provider needs a new secret
// ──────────────────────────────────────────────────────────────────────────────

import type { MultiImageGenProvider } from './image-gen-multi';
import { openAIEditsMultiProvider } from './openai-edits-multi';
import { fluxProUltraFalProvider } from './flux-pro-ultra-fal';
import { geminiFlashImageProvider } from './gemini-flash-image';
import type { EREFProviderId } from '../api/eref-config';

const PROVIDERS: Record<EREFProviderId, MultiImageGenProvider> = {
  'openai-edits-multi': openAIEditsMultiProvider,
  'flux-pro-1.1-ultra': fluxProUltraFalProvider,
  'gemini-flash-image': geminiFlashImageProvider,
};

/** Required env var per provider. null = no key (mock or already covered above). */
const ENV_KEY: Record<EREFProviderId, string | null> = {
  'openai-edits-multi': 'OPENAI_API_KEY',
  'flux-pro-1.1-ultra': 'FAL_KEY',
  'gemini-flash-image': 'GEMINI_API_KEY',
};

export function getImageGenMultiProvider(id: EREFProviderId): MultiImageGenProvider {
  const provider = PROVIDERS[id];
  if (!provider) {
    throw new Error(`Unknown EREF provider id: "${id}"`);
  }
  return provider;
}

/** True iff the provider's env key is configured. */
export function hasProviderEnv(id: EREFProviderId): boolean {
  const key = ENV_KEY[id];
  if (key === null) return true;
  return Boolean(process.env[key]?.trim());
}

/**
 * Pick the provider id with a graceful downgrade: if the configured choice
 * lacks its env key, fall back to the first id whose env IS set. Never
 * throws — surfaces `null` only if no provider has an env key (caller
 * decides whether to mock or fail).
 */
export function resolveAvailableProviderId(preferred: EREFProviderId): EREFProviderId | null {
  if (hasProviderEnv(preferred)) return preferred;
  for (const id of Object.keys(PROVIDERS) as EREFProviderId[]) {
    if (hasProviderEnv(id)) return id;
  }
  return null;
}
