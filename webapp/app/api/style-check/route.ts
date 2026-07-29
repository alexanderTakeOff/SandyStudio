// ──────────────────────────────────────────────────────────────────────────────
// app/api/style-check/route.ts
// Stand-alone Style Guardian endpoint.
//
// Director or any UI can POST { prompt, asset_type, series_id } to get a
// pre-flight verdict against the LOCKED Series Bible Style guide. Used by:
//   - Drawer's "Regenerate" button to display PASS/WARN/FAIL chip BEFORE the
//     user clicks (so they can see + override)
//   - regenerate-image / EREF / Thumbnail endpoints (called inline)
//
// Returns the StyleCheckResult shape from the runner, plus the current
// `style_guardian_mode` ('warn' | 'strict') so the caller knows whether FAIL
// would block. The Guardian REPORTS — it never returns a rewritten prompt, and
// there is no third `auto_rewrite` mode (both removed 2026-07-29, E33 P0 #1).
// The one UI consumer (StyleGuardianBadge) types this response by composing
// `StyleCheckResult & { style_guardian_mode: StyleGuardianMode }`, so the
// contract cannot drift from the two definitions again.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { runStyleCheck, StyleCheckError } from '@/lib/agents/runners/style-check';
import { getStyleGuardianMode } from '@/lib/api/style-guardian-config';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  prompt: z.string().min(8).max(8000),
  asset_type: z.string().min(1).max(60),
  series_id: z.string().uuid(),
});

export const POST = withApiHandler(async (req) => {
  await requireDirector();
  const body = await parseJson(req, Body);
  const sb = createSupabaseServiceRoleClient();

  const mode = await getStyleGuardianMode(sb);

  try {
    const result = await runStyleCheck({
      supabase: sb,
      prompt: body.prompt,
      assetType: body.asset_type,
      seriesId: body.series_id,
    });
    return apiOk({
      ...result,
      style_guardian_mode: mode,
    });
  } catch (err: unknown) {
    if (err instanceof StyleCheckError) {
      throw new Error(`Style check failed: ${err.message}`);
    }
    throw err;
  }
});
