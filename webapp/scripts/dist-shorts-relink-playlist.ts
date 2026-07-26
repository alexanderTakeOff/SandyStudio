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
 * dist-shorts-relink-playlist.ts — one-shot rewrite of the funnel bridge on
 * already-published Shorts.
 *
 * The backlink shipped as a bare `https://youtu.be/<parent>`, so a viewer who
 * clicked arrived at one video and hit a dead end. This rewrites it to
 * `https://www.youtube.com/watch?v=<parent>&list=<playlist>` — same promised
 * episode, rest of the catalogue queued behind it. New Shorts already get this
 * form from `appendParentBacklink` (4f301b6b); this is the backfill for the ones
 * uploaded before it.
 *
 * Verified 2026-07-21: unlisted videos stay visible inside a playlist (13 of 13
 * items visible to a signed-out viewer), so unlisted parents queue fine.
 *
 * SAFETY
 *  - Dry-run by default. `--apply` is required to write.
 *  - Idempotent: skips anything whose description already carries `&list=`.
 *  - EXCLUDE list is honoured absolutely — a video gaining reach right now
 *    should not have its metadata touched mid-wave.
 *  - Preserves title / tags / categoryId by reading the current snippet first;
 *    `updateVideoMetadata` replaces the whole snippet and would otherwise wipe
 *    tags and reset categoryId.
 *
 * Usage:
 *   tsx scripts/dist-shorts-relink-playlist.ts            # dry-run
 *   tsx scripts/dist-shorts-relink-playlist.ts --apply    # write
 */

import * as fs from 'fs';
import * as path from 'path';

const env = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

import { listAllUploads, updateVideoMetadata } from '../lib/agents/providers/youtube';

const APPLY = process.argv.includes('--apply');

/** Director's call 2026-07-21: leave the video that is mid-wave alone. */
const EXCLUDE = new Set<string>(['PHRbzx1qAHg']);

const PLAYLIST_ID = process.env.YOUTUBE_PLAYLIST_ID?.trim() || 'PLVJB9rPJ6q2g';

const DATA_API = 'https://www.googleapis.com/youtube/v3';

async function accessToken(): Promise<string> {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
    client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
    refresh_token: process.env.YOUTUBE_REFRESH_TOKEN!.trim(),
    grant_type: 'refresh_token',
  });
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!r.ok) throw new Error(`token exchange failed (${r.status})`);
  return (await r.json()).access_token as string;
}

interface Snippet {
  title: string;
  description: string;
  tags?: string[];
  categoryId?: string;
}

/** Bare parent link → watch URL with the catalogue queued behind it. */
function relink(description: string): { next: string; parentId: string } | null {
  const m = /https:\/\/youtu\.be\/([A-Za-z0-9_-]{6,})/.exec(description);
  if (!m) return null;
  const parentId = m[1];
  const next = description.replace(
    m[0],
    `https://www.youtube.com/watch?v=${parentId}&list=${PLAYLIST_ID}`,
  );
  return { next, parentId };
}

async function main() {
  const token = await accessToken();
  const H = { Authorization: `Bearer ${token}` };

  const uploads = await listAllUploads();
  const ids = uploads.map((u) => u.videoId).filter(Boolean);

  const snippets = new Map<string, Snippet>();
  for (let i = 0; i < ids.length; i += 50) {
    const url = `${DATA_API}/videos?part=snippet&id=${ids.slice(i, i + 50).join(',')}`;
    const res = await fetch(url, { headers: H });
    if (!res.ok) throw new Error(`videos.list failed (${res.status})`);
    const json = (await res.json()) as { items?: Array<{ id: string; snippet: Snippet }> };
    for (const it of json.items ?? []) snippets.set(it.id, it.snippet);
  }

  let changed = 0;
  let skippedDone = 0;
  let skippedNoLink = 0;

  for (const [videoId, snip] of snippets) {
    if (EXCLUDE.has(videoId)) {
      console.log(`EXCLUDED  ${videoId}  ${snip.title.slice(0, 50)}`);
      continue;
    }
    if (snip.description.includes('&list=')) {
      skippedDone++;
      continue;
    }
    const r = relink(snip.description);
    if (!r) {
      skippedNoLink++;
      continue;
    }

    console.log(`${APPLY ? 'WRITE   ' : 'would   '}  ${videoId}  →  parent ${r.parentId}  ${snip.title.slice(0, 44)}`);
    changed++;

    if (APPLY) {
      await updateVideoMetadata(videoId, {
        title: snip.title,
        description: r.next,
        tags: snip.tags ?? [],
        categoryId: snip.categoryId ?? '23',
      });
    }
  }

  console.log(
    `\n${APPLY ? 'updated' : 'would update'}: ${changed} · already queued: ${skippedDone} · no backlink: ${skippedNoLink} · total: ${snippets.size}`,
  );
  if (!APPLY) console.log('dry-run — re-run with --apply to write.');
}

main().catch((e) => {
  console.error('FAILED', e instanceof Error ? e.message : e);
  process.exit(1);
});
