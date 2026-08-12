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
 * dist-shorts-playlist.ts — put every Short into its OWN playlist, separate from
 * the long-form season playlist. Doctrine (shorts-longform-distribution practice #5):
 * Shorts and long-form live in DIFFERENT playlists on the same channel — mixing
 * formats in one playlist breaks the viewer's session flow.
 *
 * Idempotent: finds the Shorts playlist by title (creates it once if missing),
 * then adds only the shorts not already in it.
 *
 * Usage:
 *   tsx scripts/dist-shorts-playlist.ts          # dry-run
 *   tsx scripts/dist-shorts-playlist.ts --apply  # create playlist + add shorts
 */

import * as fs from 'fs';
import * as path from 'path';

const env = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

import {
  listAllUploads,
  findPlaylistByTitle,
  createPlaylist,
  isVideoInPlaylist,
  addVideoToPlaylist,
} from '../lib/providers/youtube';

const PLAYLIST_TITLE = 'Sandy the Hourglass · Shorts';
const PLAYLIST_DESC = '⏳ Bite-size Sandy — vertical gags. Each Short links to its full episode.';
const norm = (s: string) => s.toLowerCase();

(async () => {
  const apply = process.argv.includes('--apply');
  console.log(`Shorts playlist — ${apply ? 'APPLY' : 'DRY-RUN'}\n`);

  const shorts = (await listAllUploads()).filter((v) => /shorts?\b/.test(norm(v.title)));
  console.log(`Found ${shorts.length} shorts on channel.`);

  let playlist = await findPlaylistByTitle(PLAYLIST_TITLE);
  if (playlist) {
    console.log(`Playlist exists: "${playlist.title}" [${playlist.id}]`);
  } else if (apply) {
    playlist = await createPlaylist(PLAYLIST_TITLE, PLAYLIST_DESC, 'unlisted');
    console.log(`Created playlist: "${playlist.title}" [${playlist.id}]`);
  } else {
    console.log(`Playlist "${PLAYLIST_TITLE}" not found — would be created on --apply.`);
  }

  for (const s of shorts) {
    if (!apply || !playlist) { console.log(`  would add: ${s.videoId} "${s.title}"`); continue; }
    try {
      // A freshly-created playlist can 404 the item check for a moment (eventual
      // consistency) — treat 404 as "not in the playlist" and proceed to add.
      let present = false;
      try { present = await isVideoInPlaylist(playlist.id, s.videoId); }
      catch (e: any) { if (e?.status !== 404) throw e; }
      if (present) {
        console.log(`  SKIP (already in): ${s.videoId} "${s.title}"`);
        continue;
      }
      await addVideoToPlaylist(playlist.id, s.videoId);
      console.log(`  ✅ added: ${s.videoId} "${s.title}"`);
    } catch (e: any) {
      console.log(`  ❌ ${s.videoId}: ${e?.message || e}`);
    }
  }
  console.log(`\n${apply ? 'Done.' : 'Dry-run complete — re-run with --apply.'}`);
})().catch((e) => { console.error('ERROR:', e?.message || e); process.exit(1); });
