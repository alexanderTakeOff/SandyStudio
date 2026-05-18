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
  // Get v05 shots and per-shot ref coverage
  const { data: stbAsset } = await sb.from('assets').select('content').eq('episode_id', EP).like('file_type', 'STB-storyboard%').eq('status', 'APPROVED').order('version', { ascending: false }).limit(1).maybeSingle();
  const stbContent = (stbAsset as { content?: string } | null)?.content ?? '';
  const m = /```json\s*([\s\S]*?)```/i.exec(stbContent);
  let v05Shots: string[] = [];
  if (m && m[1]) {
    try {
      const body = JSON.parse(m[1]) as { acts?: Array<{ shots?: Array<{ shot_id?: string }> }> };
      if (Array.isArray(body.acts)) {
        v05Shots = body.acts.flatMap(a => (Array.isArray(a.shots) ? a.shots.map(s => s.shot_id || '') : [])).filter(Boolean);
      }
    } catch { /* */ }
  }

  // Per-shot ref count with new/old split
  const { data: allRefs } = await sb.from('assets').select('metadata,status,created_at').eq('episode_id', EP).like('file_type', 'IMG-episode_ref%');
  const shotMap: Record<string, { newCount: number; oldCount: number; latestStatus: string }> = {};
  const cutoff = '2026-05-16T08:11:18';

  for (const asset of allRefs ?? []) {
    const shotId = ((asset.metadata as { shot_reference?: { shot_id?: string } } | null)?.shot_reference?.shot_id);
    if (!shotId) continue;
    if (!shotMap[shotId]) shotMap[shotId] = { newCount: 0, oldCount: 0, latestStatus: '' };
    
    if ((asset.created_at || '') >= cutoff) {
      shotMap[shotId].newCount++;
      shotMap[shotId].latestStatus = asset.status;
    } else {
      shotMap[shotId].oldCount++;
    }
  }

  console.log('MATRIX (22 canonical v05 shots):');
  console.log('shot_id | new_refs | status');
  for (const shotId of v05Shots) {
    const info = shotMap[shotId];
    const refs = info?.newCount ?? 0;
    const status = info?.latestStatus ?? 'N/A';
    console.log(`${shotId} | ${refs} | ${status}`);
  }

  // Quality sample with providers
  const { data: samples } = await sb
    .from('assets')
    .select('filename,metadata,created_at')
    .eq('episode_id', EP)
    .like('file_type', 'IMG-episode_ref%')
    .gt('created_at', '2026-05-16T08:11:18')
    .order('created_at', { ascending: false })
    .limit(3);

  console.log('\nPROMPT SAMPLE (3 latest):');
  for (const s of samples ?? []) {
    const meta = s.metadata as {
      shot_reference?: {
        shot_id?: string;
        generation_history?: Array<{ prompt?: string; provider_id?: string }>;
      };
    } | null;
    const lastGen = (meta?.shot_reference?.generation_history || [])[0] || {};
    console.log(`\n  Shot: ${meta?.shot_reference?.shot_id}`);
    console.log(`  Provider: ${lastGen.provider_id || 'N/A'}`);
    console.log(`  Prompt (trunc): "${((lastGen.prompt || '').slice(0, 120))}..."`);
  }
})();
