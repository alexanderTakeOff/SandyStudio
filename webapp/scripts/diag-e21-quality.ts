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
const EP = '21f7bd6a-f52c-4ae0-bd47-06ff328ec6e7';

(async () => {
  // Sample 5 shots from post-fanout refs
  const { data: refAssets } = await sb
    .from('assets')
    .select('id,filename,metadata,created_at')
    .eq('episode_id', EP)
    .like('file_type', 'IMG-episode_ref%')
    .gt('created_at', '2026-05-16T08:11:18')
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('=== Semantic quality spot-check (5 newest post-fanout refs) ===\n');
  for (const asset of refAssets ?? []) {
    const meta = asset.metadata as {
      shot_reference?: {
        shot_id?: string;
        generation_history?: Array<{ prompt?: string; provider_id?: string }>;
      };
    } | null;
    const shotId = meta?.shot_reference?.shot_id || 'UNKNOWN';
    const genHist = meta?.shot_reference?.generation_history || [];
    const lastGen = genHist[genHist.length - 1] || {};
    
    console.log(`Shot: ${shotId}`);
    console.log(`Created: ${asset.created_at}`);
    console.log(`Provider: ${lastGen.provider_id || 'N/A'}`);
    console.log(`Prompt: ${(lastGen.prompt || '').slice(0, 150)}...`);
    console.log('---');
  }

  // Check for location drift: count unique locations across all refs
  console.log('\n=== Location distribution across all EREF refs ===');
  const { data: allRefs } = await sb
    .from('assets')
    .select('metadata')
    .eq('episode_id', EP)
    .like('file_type', 'IMG-episode_ref%');

  const locCount: Record<string, number> = {};
  for (const asset of allRefs ?? []) {
    const meta = asset.metadata as {
      shot_reference?: { location?: string };
    } | null;
    const loc = meta?.shot_reference?.location || 'UNKNOWN';
    locCount[loc] = (locCount[loc] ?? 0) + 1;
  }
  
  for (const [loc, count] of Object.entries(locCount).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${loc}: ${count}`);
  }
})();
