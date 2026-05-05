// Quick diagnostic — query latest VID-animatic asset for episode and dump
// metadata so we can see if animatic_v1 was written by the runner.
//
// Usage: npx tsx --env-file=.env.local scripts/check-animatic-metadata.ts <episodeId>

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadDotenvOverride(filename: string): void {
  try {
    const text = readFileSync(resolve(process.cwd(), filename), 'utf-8');
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  } catch {
    /* ignore */
  }
}
loadDotenvOverride('.env.local');

async function main(): Promise<void> {
  const episodeId = process.argv[2];
  if (!episodeId) {
    console.error('Usage: tsx check-animatic-metadata.ts <episodeId>');
    process.exit(1);
  }
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await sb
    .from('assets')
    .select('id, filename, version, status, file_type, metadata, created_at')
    .eq('episode_id', episodeId)
    .like('file_type', 'VID-animatic%')
    .order('version', { ascending: false })
    .limit(3);
  if (error) {
    console.error('Query failed:', error.message);
    process.exit(1);
  }
  for (const a of data ?? []) {
    const meta = (a as { metadata?: Record<string, unknown> }).metadata ?? {};
    const hasAnimaticV1 = Boolean(meta.animatic_v1);
    const v1 = meta.animatic_v1 as { contract?: string; shot_list?: unknown[]; total_duration?: number; music_url?: string | null } | undefined;
    console.log(`──────────────────────────────────────`);
    console.log(`Asset: ${a.filename}`);
    console.log(`  version: ${a.version}, status: ${a.status}, created: ${a.created_at}`);
    console.log(`  metadata keys: ${Object.keys(meta).join(', ')}`);
    console.log(`  animatic_v1 present: ${hasAnimaticV1}`);
    if (v1) {
      console.log(`    contract: ${v1.contract}`);
      console.log(`    shot_list length: ${v1.shot_list?.length ?? '?'}`);
      console.log(`    total_duration: ${v1.total_duration}`);
      console.log(`    music_url: ${v1.music_url ?? 'null'}`);
    }
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
