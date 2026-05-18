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
  // EREF assets for E20 — looking for La Frontera prilavok (SC04 / SC07 area).
  const { data: erefs } = await sb
    .from('assets')
    .select('id,filename,status,version,drive_path,staging_path,metadata')
    .eq('episode_id', '763c5c1e-44dc-4e10-92fb-e7671e5d4a44')
    .like('file_type', 'IMG-eref%')
    .eq('status', 'APPROVED');
  console.log(`Found ${erefs?.length ?? 0} APPROVED EREFs`);
  for (const e of (erefs ?? []) as Array<{ id: string; filename: string; version: number; drive_path: string | null; staging_path: string | null; metadata: Record<string, unknown> | null }>) {
    const meta = e.metadata ?? {};
    const shotIds = (meta.shot_ids as string[] | undefined) ?? [];
    const anchor = meta.anchor_shot_id as string | undefined;
    const tag = meta.location_tag as string | undefined;
    console.log(`  ${e.filename} v${e.version}  anchor=${anchor ?? '-'}  loc=${tag ?? '-'}  shots=${shotIds.join(',')}`);
    console.log(`    staging=${e.staging_path}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
