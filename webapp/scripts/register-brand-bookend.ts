/**
 * register-brand-bookend.ts — register a finished intro/outro mp4 as a DRAFT
 * `SBL-video_intro` / `SBL-video_outro` bible asset so EXEC-STITCH can pick it up.
 *
 * Created 2026-07-13 (brand-bookends asset base, Director «Оба пути»). This is the
 * CLI half — the fast way to place the ALREADY-produced intro clip right now; the
 * permanent path is the Library UI (Add brand video → upload + lock).
 *
 * Anti-additive: NO new table / endpoint / uploader. It just closes the one broken
 * link — creating the DRAFT row — reusing the SAME persistBinary + assets insert the
 * bible POST route uses (`app/api/series/[id]/bible/route.ts`). The mp4 is produced
 * upstream (gen-brand-visual → compose-brand-clip). LOCK stays a HUMAN action: after
 * this runs, the Director locks the card in the Library (assertHumanDirector invariant).
 *
 * Usage:
 *   tsx scripts/register-brand-bookend.ts --series <id|code> --slug intro|outro --file <path.mp4>
 *   # e.g. --series Sandy   (code lookup) or --series 4535...  (uuid)
 */
import * as fs from 'fs';
import * as path from 'path';

// Load .env.local (same shape as the other brand scripts).
const env = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../lib/supabase/types.gen';
import { persistBinary } from '../lib/agents/persist-binary';
import { bibleFilename } from '../lib/api/series-bible';

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { out[key] = next; i++; }
      else out[key] = 'true';
    }
  }
  return out;
}

const sb = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function resolveSeries(ref: string): Promise<{ id: string; code: string }> {
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const col = uuidRe.test(ref) ? 'id' : 'code';
  const { data, error } = await sb
    .from('series')
    .select('id,code,title')
    .eq(col, ref)
    .maybeSingle();
  if (error) throw new Error(`series lookup failed: ${error.message}`);
  if (!data) throw new Error(`series not found for ${col}="${ref}"`);
  return { id: data.id, code: data.code };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const seriesRef = args.series;
  const slug = (args.slug ?? '').toLowerCase();
  const filePath = args.file;

  if (!seriesRef || !filePath || (slug !== 'intro' && slug !== 'outro')) {
    console.error(
      'Required: --series <id|code> --slug intro|outro --file <path.mp4>\n' +
        '  slug MUST be exactly "intro" or "outro" — EXEC-STITCH reads only ' +
        'SBL-video_intro / SBL-video_outro.',
    );
    process.exit(1);
    return;
  }
  if (path.extname(filePath).toLowerCase() !== '.mp4') {
    console.error(`--file must be an .mp4 (got "${path.extname(filePath)}").`);
    process.exit(1);
    return;
  }

  const series = await resolveSeries(seriesRef);
  const fileType = `SBL-video_${slug}`;

  // Version = max existing for (series, file_type) + 1 — mirrors bible POST.
  const { data: existing } = await sb
    .from('assets')
    .select('version')
    .eq('series_id', series.id)
    .eq('file_type', fileType);
  const nextVersion =
    (existing ?? []).reduce((max, r) => Math.max(max, r.version ?? 0), 0) + 1;

  const base64 = fs.readFileSync(filePath).toString('base64');
  const driveFilename = bibleFilename({
    seriesCode: series.code,
    section: 'video',
    slug,
    version: nextVersion,
    ext: 'mp4',
    status: 'DRAFT',
  });

  console.log(
    `[register-brand-bookend] ${series.code} ${fileType} v${nextVersion} ← ${path.basename(filePath)}`,
  );

  const persisted = await persistBinary({
    base64,
    ext: 'mp4',
    driveFilename,
    localHint: `brand-${slug}-${series.code}`,
    seriesCode: series.code,
    bucket: 'bible',
    assetType: 'video',
    supabase: sb,
  });

  const { data: inserted, error: ierr } = await sb
    .from('assets')
    .insert({
      series_id: series.id,
      episode_id: null,
      file_type: fileType,
      filename: driveFilename,
      staging_path: persisted.browserUrl,
      drive_path: persisted.browserUrl,
      drive_file_id: persisted.driveFileId,
      drive_web_view_url: persisted.driveWebViewUrl,
      status: 'DRAFT',
      version: nextVersion,
      agent_id: 'Director',
      metadata: { provenance: { source: 'register-brand-bookend', by_kind: 'director' } },
    } as never)
    .select('id,filename,status')
    .single();

  if (ierr) throw new Error(`assets insert failed: ${ierr.message}`);

  const row = inserted as { id: string; filename: string; status: string };
  console.log(
    `[register-brand-bookend] DONE — asset ${row.id} (${row.filename}, ${row.status})\n` +
      `  browserUrl: ${persisted.browserUrl}` +
      (persisted.driveUploadFailed ? '  (Drive mirror failed — local-only)' : '') +
      `\n  NEXT: open Series Bible → Brand video → LOCK the card (one click). ` +
      `EXEC-STITCH then folds it into VID-final_cut-branded.`,
  );
}

main().catch((err) => {
  console.error('[register-brand-bookend] FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
