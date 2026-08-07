// ──────────────────────────────────────────────────────────────────────────────
// lib/providers/google-auth.ts
// Refresh-token OAuth helper for Google APIs.
//
// Uses GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN to mint
// short-lived access tokens. Tokens are cached in-process for ~50 minutes
// (Google's tokens expire after 60 min; we refresh ~10 min before expiry).
//
// Used by:
//   - drive_native adapter (Drive API)
//   - youtube_data_api adapter (later)
//   - veo via Vertex AI path (later, optional alternative to Gemini API)
// ──────────────────────────────────────────────────────────────────────────────

import { fetchWithTimeout, FETCH_TIMEOUTS } from './fetch-with-timeout';

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

// Cache keyed by refresh token so multiple Google identities (e.g. the ao@ user
// account for Drive vs the Sandy Brand Account for YouTube) never collide.
const cacheByRefreshToken = new Map<string, CachedToken>();

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SAFETY_MARGIN_MS = 10 * 60 * 1000; // refresh 10min before actual expiry

export class GoogleAuthError extends Error {
  constructor(message: string, public readonly status: number | null = null, public readonly body: string | null = null) {
    super(message);
    this.name = 'GoogleAuthError';
  }
}

/**
 * Mint a short-lived access token from a refresh token.
 * @param refreshToken optional override; defaults to GOOGLE_REFRESH_TOKEN (Drive/user identity).
 *   Pass YOUTUBE_REFRESH_TOKEN (via getYouTubeAccessToken) for the Sandy Brand Account.
 */
export async function getGoogleAccessToken(refreshToken?: string): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const rt = (refreshToken ?? process.env.GOOGLE_REFRESH_TOKEN)?.trim();
  if (!clientId || !clientSecret || !rt) {
    throw new GoogleAuthError(
      'Google OAuth env not fully configured. Need GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + a refresh token.',
    );
  }

  const cached = cacheByRefreshToken.get(rt);
  if (cached && cached.expiresAt - SAFETY_MARGIN_MS > Date.now()) {
    return cached.accessToken;
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: rt,
    grant_type: 'refresh_token',
  });

  const res = await fetchWithTimeout(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  }, FETCH_TIMEOUTS.AUTH_MS);

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new GoogleAuthError(
      `Token refresh failed (${res.status}). Most common: refresh_token expired or scopes changed since last consent.`,
      res.status,
      errBody.slice(0, 600),
    );
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) {
    throw new GoogleAuthError('Token refresh returned no access_token');
  }
  const ttlMs = (json.expires_in ?? 3600) * 1000;
  cacheByRefreshToken.set(rt, {
    accessToken: json.access_token,
    expiresAt: Date.now() + ttlMs,
  });
  return json.access_token;
}

/**
 * Resolve the refresh token for a channel's credential_key (multi-channel.md §3):
 * env `YOUTUBE_REFRESH_TOKEN_<KEY>`. Transition rule: for 'SANDY' the bare legacy
 * `YOUTUBE_REFRESH_TOKEN` is accepted as fallback. Missing token → throw (HALT) —
 * never fall back to another channel's token.
 */
export function resolveChannelRefreshToken(credentialKey: string): string {
  const key = credentialKey.trim().toUpperCase();
  const suffixed = process.env[`YOUTUBE_REFRESH_TOKEN_${key}`]?.trim();
  if (suffixed) return suffixed;
  if (key === 'SANDY') {
    const legacy = process.env.YOUTUBE_REFRESH_TOKEN?.trim();
    if (legacy) return legacy;
  }
  throw new GoogleAuthError(
    `No refresh token for channel credential_key=${key}. ` +
      `Set YOUTUBE_REFRESH_TOKEN_${key} (run \`npx tsx scripts/youtube-consent.ts --key ${key}\` and pick that channel).`,
  );
}

/** True when ANY YouTube credential exists in env (bare legacy or any suffixed key). */
export function hasAnyYouTubeCredential(): boolean {
  if (process.env.YOUTUBE_REFRESH_TOKEN?.trim()) return true;
  return Object.keys(process.env).some(
    (k) => k.startsWith('YOUTUBE_REFRESH_TOKEN_') && process.env[k]?.trim(),
  );
}

/**
 * Access token for a YouTube channel identity.
 * @param refreshToken the channel's refresh token (from resolveChannelRefreshToken).
 *   Without an argument — legacy path: the bare YOUTUBE_REFRESH_TOKEN (= SANDY).
 */
export async function getYouTubeAccessToken(refreshToken?: string): Promise<string> {
  const rt = (refreshToken ?? process.env.YOUTUBE_REFRESH_TOKEN)?.trim();
  if (!rt) {
    throw new GoogleAuthError(
      'No YouTube refresh token. Run `npx tsx scripts/youtube-consent.ts --key <KEY>` and pick the channel.',
    );
  }
  return getGoogleAccessToken(rt);
}

export function invalidateGoogleAuthCache(): void {
  cacheByRefreshToken.clear();
}
