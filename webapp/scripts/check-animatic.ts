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
  const { data: an } = await sb
    .from('assets')
    .select('id,filename,status,metadata')
    .eq('episode_id', '763c5c1e-44dc-4e10-92fb-e7671e5d4a44')
    .eq('file_type', 'VID-animatic')
    .eq('status', 'APPROVED')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  const v1 = (an?.metadata as { animatic_v1?: { shot_list?: Array<{ shot_id: string; duration_seconds: number }>; total_duration_s?: number; audio_tracks?: unknown; music_url?: string; director_overrides?: Record<string, unknown> } } | null)?.animatic_v1;
  console.log('animatic id:', an?.id);
  console.log('total_duration_s:', v1?.total_duration_s);
  console.log('shot_list:');
  let sum = 0;
  for (const s of v1?.shot_list ?? []) {
    console.log(`  ${s.shot_id}  ${s.duration_seconds}s`);
    sum += s.duration_seconds;
  }
  console.log(`SUM shot_list durations: ${sum}s`);
  console.log('director_overrides:', JSON.stringify(v1?.director_overrides ?? {}, null, 2));
  console.log('audio_tracks:', JSON.stringify(v1?.audio_tracks ?? null, null, 2));
  console.log('music_url:', v1?.music_url);
}
main().catch((e) => { console.error(e); process.exit(1); });
