// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/providers/google-consent.ts
// Shared OAuth-consent plumbing for YouTube channel tokens (multi-channel.md §3).
// Used by the Settings → Channels "Authorize" button (app/api/channels/*/consent);
// the CLI twin is scripts/youtube-consent.ts (kept for headless/recovery use).
//
// The secret still lives ONLY in webapp/.env.local — this module writes the
// named key there AND into process.env so the running server picks the token up
// without a restart (resolveChannelRefreshToken reads process.env per call).
// ──────────────────────────────────────────────────────────────────────────────

import * as fs from 'node:fs';
import * as path from 'node:path';

/** Same scope set as the CLI consent script — upload + read + edit + analytics. */
export const YOUTUBE_CONSENT_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
].join(' ');

export function buildConsentAuthUrl(args: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  return (
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    new URLSearchParams({
      client_id: args.clientId,
      redirect_uri: args.redirectUri,
      response_type: 'code',
      scope: YOUTUBE_CONSENT_SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      state: args.state,
    }).toString()
  );
}

export interface ConsentTokenResult {
  refreshToken: string;
  grantedScopes: string;
}

/** Exchange the auth code for a refresh token. Throws with Google's error body. */
export async function exchangeConsentCode(args: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<ConsentTokenResult> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: args.code,
      client_id: args.clientId,
      client_secret: args.clientSecret,
      redirect_uri: args.redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  });
  const j = (await res.json().catch(() => ({}))) as {
    refresh_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !j.refresh_token) {
    throw new Error(
      `token exchange failed: ${j.error ?? res.status} ${j.error_description ?? ''}`.trim(),
    );
  }
  return { refreshToken: j.refresh_token, grantedScopes: j.scope ?? '' };
}

/**
 * Replace-or-append the named token in webapp/.env.local, never touching other
 * keys (other channels, Drive's GOOGLE_REFRESH_TOKEN). Also stamps process.env
 * so the RUNNING app sees the new token immediately — no stack restart.
 */
export function persistChannelToken(envVar: string, refreshToken: string): void {
  if (!/^YOUTUBE_REFRESH_TOKEN(_[A-Z][A-Z0-9_]*)?$/.test(envVar)) {
    throw new Error(`refusing to write unexpected env var name: ${envVar}`);
  }
  const envPath = path.resolve(process.cwd(), '.env.local');
  let raw = fs.readFileSync(envPath, 'utf8');
  const linePattern = new RegExp(`^${envVar}=.*$`, 'm');
  raw = linePattern.test(raw)
    ? raw.replace(linePattern, `${envVar}=${refreshToken}`)
    : raw.replace(/\s*$/, '') + `\n${envVar}=${refreshToken}\n`;
  fs.writeFileSync(envPath, raw);
  process.env[envVar] = refreshToken;
}
