// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/providers/google-auth.ts
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

let cached: CachedToken | null = null;

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SAFETY_MARGIN_MS = 10 * 60 * 1000; // refresh 10min before actual expiry

export class GoogleAuthError extends Error {
  constructor(message: string, public readonly status: number | null = null, public readonly body: string | null = null) {
    super(message);
    this.name = 'GoogleAuthError';
  }
}

export async function getGoogleAccessToken(): Promise<string> {
  if (cached && cached.expiresAt - SAFETY_MARGIN_MS > Date.now()) {
    return cached.accessToken;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) {
    throw new GoogleAuthError(
      'Google OAuth env not fully configured. Need GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN.',
    );
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
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
      `Token refresh failed (${res.status}). Most common: refresh_token expired (Testing mode = 7 days) or scopes changed since last consent.`,
      res.status,
      errBody.slice(0, 600),
    );
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) {
    throw new GoogleAuthError('Token refresh returned no access_token');
  }
  const ttlMs = (json.expires_in ?? 3600) * 1000;
  cached = {
    accessToken: json.access_token,
    expiresAt: Date.now() + ttlMs,
  };
  return cached.accessToken;
}

export function invalidateGoogleAuthCache(): void {
  cached = null;
}
