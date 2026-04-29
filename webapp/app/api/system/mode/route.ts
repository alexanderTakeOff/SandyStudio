// ──────────────────────────────────────────────────────────────────────────────
// app/api/system/mode/route.ts
// System mode lever per uiux.md §8.4 (Topbar chip → modal).
// Director-only. Hard-limit per CLAUDE.md §6 — MODE_CHANGE always Director.
//
//   GET  → current mode + governance default
//   POST → switch ===1=== / ===5=== with confirm:true
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { ValidationError } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SystemModeBody = z.object({
  targetMode: z.enum(['===1===', '===5===']),
  confirm: z.literal(true),
});

async function readSystemConfig(supabase: Awaited<ReturnType<typeof requireDirector>>['supabase']) {
  const { data, error } = await supabase
    .from('app_config')
    .select('key,value')
    .eq('scope', 'system');
  if (error) throw new Error(`app_config read failed: ${error.message}`);
  const map = new Map<string, unknown>();
  for (const row of data ?? []) map.set(row.key, row.value);
  return {
    system_mode: (map.get('system_mode') as string | undefined) ?? '===1===',
    governance_mode_default: (map.get('governance_mode_default') as number | undefined) ?? 1,
  };
}

export const GET = withApiHandler(async () => {
  const { supabase } = await requireDirector();
  const cfg = await readSystemConfig(supabase);
  return apiOk(cfg);
});

export const POST = withApiHandler(async (req) => {
  const { user, supabase } = await requireDirector();
  const body = await parseJson(req, SystemModeBody);
  if (!body.confirm) {
    throw new ValidationError('confirm must be true to switch system mode');
  }

  // upsert app_config row
  const { error: upErr } = await supabase
    .from('app_config')
    .upsert(
      {
        scope: 'system',
        key: 'system_mode',
        value: body.targetMode,
        source: 'ui_edit',
        synced_at: new Date().toISOString(),
      },
      { onConflict: 'scope,key' },
    );
  if (upErr) throw new Error(`system_mode update failed: ${upErr.message}`);

  // audit
  await supabase.from('activity_events').insert({
    event_type: 'system_mode_change',
    severity: body.targetMode === '===5===' ? 'warning' : 'info',
    title: `System mode → ${body.targetMode}`,
    description: `Switched by Director ${user.email ?? user.id}`,
    actor: user.id,
    metadata: { target_mode: body.targetMode },
  });

  const cfg = await readSystemConfig(supabase);
  return apiOk(cfg);
});
