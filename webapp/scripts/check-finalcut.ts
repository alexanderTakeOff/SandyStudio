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

async function main() {
  const { data: fc } = await sb
    .from('assets')
    .select('id,filename,status,metadata,description')
    .eq('episode_id', '763c5c1e-44dc-4e10-92fb-e7671e5d4a44')
    .like('file_type', 'VID-final_cut%')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  console.log('=== final_cut asset ===');
  console.log('filename:', fc?.filename);
  console.log('description:', fc?.description);
  const m = fc?.metadata as Record<string, unknown> | null;
  console.log('metadata keys:', Object.keys(m ?? {}));
  if (m) {
    console.log('duration_seconds:', m.duration_seconds);
    console.log('size_bytes:', m.size_bytes);
    console.log('format:', m.format);
    console.log('shot_count:', m.shot_count);
    const ff = m.ffmpeg_command as string | undefined;
    console.log('ffmpeg_command (first 1200):', ff?.slice(0, 1200));
  }

  // Per-VID-shot actual durations
  const { data: vids } = await sb
    .from('assets')
    .select('metadata,filename,status,version')
    .eq('episode_id', '763c5c1e-44dc-4e10-92fb-e7671e5d4a44')
    .like('file_type', 'VID-shot%')
    .eq('status', 'APPROVED');
  console.log(`\n=== APPROVED VID-shot durations ===`);
  for (const v of vids ?? []) {
    const meta = v.metadata as Record<string, unknown> | null;
    console.log(`  ${meta?.shot_id} v${v.version}  duration_seconds=${meta?.duration_seconds}  quality=${meta?.quality_tier}  reported_dur=${meta?.duration_seconds}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
