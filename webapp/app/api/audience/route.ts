// ──────────────────────────────────────────────────────────────────────────────
// app/api/audience/route.ts
// Audience dashboard data — the Quality Sensor surface. Pulls channel videos +
// real statistics/analytics, runs the scout-mode advisor, and computes the
// shorts→episode funnel. Read-only.
//
// Multi-channel Phase 4b: metric assembly extracted to
// lib/agents/audience-metrics.ts (shared with the daily advice persist in
// inngest hog-report-poll); the holes-map taxonomy now comes from
// series.metadata.gag_taxonomy (seeded for S15 by 0053), never a hardcode.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseSearchParams } from '@/lib/api/zod-helpers';
import { ValidationError } from '@/lib/api/errors';
import { resolveChannelRefreshToken } from '@/lib/providers/google-auth';
import { assembleChannelAudience, resolveChannelTaxonomy } from '@/lib/audience-metrics';
import { buildAdvice } from '@/lib/analytics-advisor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ListQuery = z.object({
  // Multi-channel (Phase 3): which channel's audience to read. When absent, the
  // single/first ACTIVE channel is used (pre-Phase-3 behaviour = the Sandy
  // token). NO cross-channel merge is possible any more: every YouTube call
  // below is authed with THIS channel's token and the reach archive is
  // filtered to THIS channel's rows.
  channel_id: z.string().uuid().optional(),
});

export const GET = withApiHandler(async (req) => {
  const { supabase } = await requireDirector();
  const q = parseSearchParams(req.url, ListQuery);

  // 0. Resolve the target channel passport.
  const { data: chRows, error: chErr } = await supabase
    .from('channels')
    .select('id, name, credential_key, status')
    .order('created_at', { ascending: true });
  if (chErr) throw new Error(`channels read failed: ${chErr.message}`);
  const channels = (chRows ?? []) as Array<{
    id: string; name: string; credential_key: string; status: string;
  }>;
  const active = channels.filter((c) => c.status === 'ACTIVE');
  const target = q.channel_id
    ? channels.find((c) => c.id === q.channel_id) ?? null
    : active[0] ?? channels[0] ?? null;
  if (!target) {
    throw new ValidationError(
      q.channel_id ? `Channel ${q.channel_id} not found` : 'No channels configured',
    );
  }
  // Rule 8 / multi-channel §3: no silent fallback to another channel's token —
  // a missing env token for THIS channel is a loud GoogleAuthError (HALT).
  const auth = { refreshToken: resolveChannelRefreshToken(target.credential_key) };

  // 1-4. Shared assembly (also feeds the daily advice persist in hog-report-poll).
  const { metrics, funnel } = await assembleChannelAudience(supabase, target.id, auth);
  const taxonomy = await resolveChannelTaxonomy(supabase, target.id);

  // 5. Scout advice — PUBLIC videos only. Scheduled/unlisted/draft have no audience by
  //    construction; feeding them in as equal samples drags every ratio the advisor reasons
  //    on toward zero (18 of our 29 uploads are scheduled).
  const publicMetrics = metrics.filter((m) => m.publicationState === 'public');
  const report = buildAdvice({ metrics: publicMetrics, taxonomy, shippedCategories: [] });

  return apiOk({
    generatedAt: new Date().toISOString(),
    channel: { id: target.id, name: target.name },
    videoCount: metrics.length,
    metrics,
    funnel,
    report,
  });
});
