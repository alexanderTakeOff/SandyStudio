// ──────────────────────────────────────────────────────────────────────────────
// app/api/channels/[id]/consent/route.ts
// "Authorize" button target — kicks off the Google OAuth consent for ONE channel
// passport and redirects the Director's browser to Google. The callback
// (/api/channels/consent/callback) exchanges the code, verifies the picked brand
// account against the passport, and only then persists the token.
//
// Human-Director-only: minting a channel credential is credentials territory —
// the EXEC-DIR-AI service token must not be able to do it.
// ──────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { requireDirector, assertHumanDirector } from '@/lib/api/auth';
import { NotFoundError } from '@/lib/api/errors';
import { PUBLIC_ENV } from '@/lib/env';
import { buildConsentAuthUrl } from '@/lib/agents/providers/google-consent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const dctx = await requireDirector();
  assertHumanDirector(dctx);

  const { data: channel } = await dctx.supabase
    .from('channels')
    .select('id, name, credential_key')
    .eq('id', id)
    .maybeSingle();
  if (!channel) throw new NotFoundError(`Channel ${id}`);

  // Same env source google-auth.ts uses — the typed getServerEnv() surface
  // deliberately doesn't cover the Google OAuth pair.
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    return NextResponse.json(
      { error: 'GOOGLE_CLIENT_ID missing in webapp/.env.local' },
      { status: 503 },
    );
  }

  const appOrigin = (PUBLIC_ENV.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const authUrl = buildConsentAuthUrl({
    clientId,
    redirectUri: `${appOrigin}/api/channels/consent/callback`,
    // state carries the channel id so the callback knows which passport to
    // verify against and which env key to write.
    state: channel.id,
  });

  return NextResponse.redirect(authUrl);
}
