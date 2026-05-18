// Read sh01 v4 latest image URL after regen
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
    .select('id,filename,staging_path,drive_path,drive_web_view_url,metadata,updated_at')
    .eq('id', '8338d036-cc31-4444-b403-136ed4e4a638')
    .maybeSingle();
  console.log('=== sh01 v4 latest state ===');
  console.log(`updated_at: ${(a as { updated_at?: string } | null)?.updated_at}`);
  console.log(`staging_path: ${(a as { staging_path?: string } | null)?.staging_path}`);
  console.log(`drive_path: ${(a as { drive_path?: string } | null)?.drive_path}`);
  console.log(`drive_web_view_url: ${(a as { drive_web_view_url?: string } | null)?.drive_web_view_url}`);
  const md = ((a as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) as Record<string, unknown>;
  const ip = md.image_prompt as { history?: Array<{ version: number; source?: string; cost_usd?: number; staging_path?: string; at?: string; prompt?: string }>; current_version?: number };
  const v4 = ip.history?.find(h => h.version === 4);
  console.log(`\n=== v4 history entry ===`);
  console.log(`at: ${v4?.at}`);
  console.log(`source: ${v4?.source}`);
  console.log(`cost: $${v4?.cost_usd}`);
  console.log(`staging_path: ${v4?.staging_path}`);
  console.log(`prompt (first 300 chars):\n${(v4?.prompt ?? '').slice(0, 300)}`);

  // Last activity for this asset
  const { data: events } = await sb
    .from('activity_events')
    .select('event_type,title,actor,created_at,metadata')
    .eq('asset_id', '8338d036-cc31-4444-b403-136ed4e4a638')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log(`\n=== latest activity_events ===`);
  for (const e of events ?? []) {
    console.log(`${e.created_at?.slice(11, 19)} [${(e.event_type as string).padEnd(20)}] ${(e.title as string).slice(0, 80)}`);
  }
})();
