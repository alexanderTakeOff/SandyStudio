// ─── LEGACY SINGLE-CHANNEL (Sandy) — multi-channel Phase 4a guard ────────────
// This script predates the channels passport: it calls YouTube with the legacy
// global token (no per-channel auth, no identity guard) and carries hardcoded
// Sandy-era paths/ids. Running it against a multi-channel studio can silently
// touch the WRONG channel. Use the in-app flows (EXEC-PUB / shorts route) —
// they resolve the channel and verify identity. To run anyway, acknowledge:
//   LEGACY_SINGLE_CHANNEL=1
if (process.env.LEGACY_SINGLE_CHANNEL !== '1') {
  console.error(
    '[legacy-guard] This is a LEGACY single-channel (Sandy) script with no per-channel auth. ' +
      'Set LEGACY_SINGLE_CHANNEL=1 to run it anyway.',
  );
  process.exit(1);
}

/**
 * dist-shorts-backfill-parents.ts — one-shot backfill of the funnel bridge for
 * the 9 already-uploaded orphan Shorts. Adds `▶ Full episode: youtu.be/<parent>`
 * to each Short's description (the only programmable Shorts→long-form bridge) and
 * records the reverse link in episodes.metadata.youtube_short_id.
 *
 * Created 2026-07-12 (P1). Parent ids reused from dist-youtube-polish.ts's MAP
 * (the landscape videos those Shorts were cut from). Idempotent: re-setting the
 * same description is harmless; `appendParentBacklink` won't double-add.
 *
 * Usage:
 *   tsx scripts/dist-shorts-backfill-parents.ts            # dry-run (prints pairs)
 *   tsx scripts/dist-shorts-backfill-parents.ts --apply    # write descriptions + metadata
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const env = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

import { listAllUploads, updateVideoMetadata } from '../lib/providers/youtube';
import { appendParentBacklink, persistShortId } from '../lib/providers/short-linkage';
import type { Database } from '../lib/supabase/types.gen';

// Short's original description (what dist-shorts.ts uploaded them with).
const BASE_DESCRIPTION =
  '⏳ Sandy the Hourglass — silent physical comedy. Life is short. Flip yourself. #Shorts';
const TAGS = ['Shorts', 'Sandy the Hourglass', 'animation', 'comedy'];

// episode_code → { title match token, parent landscape video id }.
// Parent ids = dist-youtube-polish.ts MAP (the videos the Shorts were cut from).
const MAP: Array<{ ep: string; match: string; parentVid: string }> = [
  { ep: 'SS-S15-E01', match: 'heavy friend', parentVid: 'mCGE4FBcSrQ' },
  { ep: 'SS-S15-E07', match: 'cleaning',     parentVid: 'BvIHVozwdKQ' },
  { ep: 'SS-S15-E09', match: 'elevator',     parentVid: 'gU8BBvnoHu0' },
  { ep: 'SS-S15-E11', match: 'power fan',    parentVid: 'LgGPVYUEzf8' },
  { ep: 'SS-S15-E12', match: 'smartphone',   parentVid: 'iT8nwWABBqE' },
  { ep: 'SS-S15-E13', match: 'vending',      parentVid: 'ywNKJYsbnrE' },
  { ep: 'SS-S15-E14', match: 'parfume',      parentVid: 'S2vIiuUCUGg' },
  { ep: 'SS-S15-E15', match: 'car wash',     parentVid: '2efpY_JPYUo' },
  { ep: 'SS-S15-E16', match: 'gym',          parentVid: 'rzBgn07Ucsg' },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

const sb = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

(async () => {
  const apply = process.argv.includes('--apply');
  console.log(`Backfill Shorts→episode links — ${apply ? 'APPLY' : 'DRY-RUN'}\n`);

  const uploads = (await listAllUploads()).map((v) => ({ ...v, n: norm(v.title) }));
  const shorts = uploads.filter((v) => v.n.includes('shorts'));
  console.log(`Found ${shorts.length} shorts on channel.\n`);

  for (const m of MAP) {
    const hit = shorts.find((v) => v.n.includes(norm(m.match)));
    if (!hit) {
      console.log(`  MISS ${m.ep} (match "${m.match}") — no short found on channel`);
      continue;
    }
    const description = appendParentBacklink(BASE_DESCRIPTION, m.parentVid);
    console.log(`  ${m.ep}: short ${hit.videoId} "${hit.title}"  → parent youtu.be/${m.parentVid}`);
    if (!apply) continue;
    try {
      // updateVideoMetadata replaces the snippet → send the existing title verbatim.
      await updateVideoMetadata(hit.videoId, { title: hit.title, description, tags: TAGS });
      // Reverse link (best-effort — skip if the episode row isn't in the DB).
      const { data: epRow } = await sb.from('episodes').select('id').eq('episode_code', m.ep).maybeSingle();
      if (epRow?.id) {
        await persistShortId(sb, epRow.id, hit.videoId, `https://youtu.be/${hit.videoId}`);
      }
      console.log(`    ✅ updated + linked`);
    } catch (e: any) {
      console.log(`    ❌ FAILED: ${e?.message || e}`);
      if (e?.status === 403) {
        console.log('    ⛔ 403 — the YOUTUBE_REFRESH_TOKEN likely lacks the youtube.force-ssl scope.');
        console.log('       Re-run scripts/youtube-consent.ts to mint a token with force-ssl, then retry.');
        process.exit(1);
      }
      if (e?.body) console.log('       body:', String(e.body).slice(0, 300));
    }
  }
  console.log(`\n${apply ? 'Done.' : 'Dry-run complete — re-run with --apply to write.'}`);
})().catch((e) => { console.error('ERROR:', e?.message || e); process.exit(1); });
