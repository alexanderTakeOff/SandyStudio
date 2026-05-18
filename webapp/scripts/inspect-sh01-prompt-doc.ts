// Inspect sh01 v4 image_prompt.history details — see what cur.prompt would
// be when the drawer calls regenerate-image. Also dump shot_reference test_plan
// so we can see what refs the v2 path would try to load.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  for (const raw of readFileSync(envPath, 'utf-8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    process.env[line.slice(0, eq).trim()] = val;
  }
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
(async () => {
  const { data: a } = await sb
    .from('assets')
    .select('id,filename,metadata,series_id')
    .eq('id', '8338d036-cc31-4444-b403-136ed4e4a638')
    .maybeSingle();
  const md = ((a as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) as Record<string, unknown>;
  const ip = md.image_prompt as {
    current_version?: number;
    history?: Array<{ version: number; prompt?: string; source?: string; cost_usd?: number }>;
  } | undefined;
  console.log('image_prompt.current_version =', ip?.current_version);
  console.log('image_prompt.history entries =');
  for (const h of ip?.history ?? []) {
    console.log(`  v${h.version} source=${h.source} prompt[0..100]= ${(h.prompt ?? '').slice(0, 100)}`);
  }
  const sr = md.shot_reference as { test_plan?: { characters?: unknown[]; location_anchor_asset_id?: string; style_anchor_asset_id?: string } } | undefined;
  console.log('\nshot_reference.test_plan:');
  console.log(JSON.stringify(sr?.test_plan, null, 2));
  // Check that anchor assets exist + have staging_path
  if (sr?.test_plan) {
    const ids: string[] = [];
    for (const c of (sr.test_plan.characters as Array<{ identity_anchor_asset_id?: string }> ?? [])) {
      if (c.identity_anchor_asset_id) ids.push(c.identity_anchor_asset_id);
    }
    if (sr.test_plan.location_anchor_asset_id) ids.push(sr.test_plan.location_anchor_asset_id);
    if (sr.test_plan.style_anchor_asset_id) ids.push(sr.test_plan.style_anchor_asset_id);
    console.log('\nAnchor asset staging_path check:');
    for (const id of ids) {
      const { data: row } = await sb.from('assets').select('id,filename,staging_path').eq('id', id).maybeSingle();
      const sp = (row as { staging_path?: string } | null)?.staging_path;
      console.log(`  ${id}: staging_path=${sp ? sp.slice(0, 60) : 'NULL/MISSING'} (${(row as { filename?: string } | null)?.filename ?? 'NOT FOUND'})`);
    }
  }
  console.log(`\nseries_id: ${(a as { series_id?: string } | null)?.series_id}`);
})();
