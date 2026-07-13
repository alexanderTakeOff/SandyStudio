/**
 * register-brand-bumpers.ts — register the finished intro/outro brand bumpers
 * (music baked) as DRAFT SBL-video_{intro,outro} rows on S15, ready for the
 * Director to LOCK. Mirrors the bible POST route + persistBinary (service-role,
 * no auth session). LOCK stays a Director-only hard-limit — this only creates DRAFT.
 */
import * as fs from 'fs';
import * as path from 'path';
const env = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
import { createClient } from '@supabase/supabase-js';
import { persistBinary } from '../lib/agents/persist-binary';

const OUT_DIR = 'C:/SandyStudio/FILMS/_media_cache/_brand';
const S15_SERIES_ID = '45351141-6334-4bf0-8a0f-4e00a994f670';
const S15_CODE = 'SS-S15';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function registerOne(kind: 'intro' | 'outro'): Promise<void> {
  const fileType = `SBL-video_${kind}`;
  const src = path.join(OUT_DIR, `sandy-${kind}-v2-music.mp4`);
  const base64 = fs.readFileSync(src).toString('base64');

  const { data: existing } = await sb.from('assets')
    .select('version').eq('series_id', S15_SERIES_ID).eq('file_type', fileType);
  const nextV = ((existing ?? []).reduce((mx, r) => Math.max(mx, (r as { version?: number }).version ?? 0), 0)) + 1;
  const vTag = `v${String(nextV).padStart(2, '0')}`;
  const filename = `${S15_CODE}-SBL-video_${kind}-${vTag}-DRAFT.mp4`;

  const persisted = await persistBinary({
    base64, ext: 'mp4', driveFilename: filename,
    seriesCode: S15_CODE, bucket: 'bible', assetType: 'video', supabase: sb,
  });

  const { data: inserted, error } = await sb.from('assets').insert({
    series_id: S15_SERIES_ID,
    episode_id: null,
    agent_id: 'Director',
    file_type: fileType,
    filename,
    description: `Brand ${kind} bumper — S15 canon (Sandy+Anvil+Parfum), 7s, iris, Flacon Pop Loop music. DRAFT → Director LOCK.`,
    staging_path: persisted.browserUrl,
    drive_path: persisted.browserUrl,
    drive_file_id: persisted.driveFileId,
    drive_web_view_url: persisted.driveWebViewUrl,
    status: 'DRAFT',
    version: nextV,
    metadata: {
      provenance: {
        created_by: 'Director', created_by_kind: 'director',
        created_at: new Date().toISOString(), source: 'brand_bumper_production',
      },
    },
  } as never).select('id,filename,status').single();

  if (error) throw new Error(`insert ${fileType}: ${error.message}`);
  const row = inserted as { id: string; filename: string; status: string };
  console.log(`✓ ${fileType} → ${row.filename} [${row.status}] id=${row.id}`);
}

(async () => {
  for (const k of ['intro', 'outro'] as const) await registerOne(k);
  console.log('\nDone — both DRAFT on S15. Director: open the S15 Library → Brand video → LOCK each.');
})().catch((e) => { console.error('FAILED:', e instanceof Error ? e.message : e); process.exit(1); });
