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

import * as fs from 'fs'; import * as path from 'path';
const env = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
for (const line of env.split('\n')) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g,''); }
import { getYouTubeAccessToken } from '../lib/agents/providers/google-auth';

const PLAYLIST = 'PLVJB9rPJ6q2g';
const SANDY = ['mCGE4FBcSrQ','BvIHVozwdKQ','gU8BBvnoHu0','LgGPVYUEzf8','iT8nwWABBqE','ywNKJYsbnrE','S2vIiuUCUGg','2efpY_JPYUo','rzBgn07Ucsg','PHRbzx1qAHg'];

async function api(token: string, url: string, init?: RequestInit) {
  const r = await fetch('https://www.googleapis.com/youtube/v3/' + url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) } });
  return { ok: r.ok, status: r.status, json: await r.json().catch(() => ({})) as any };
}

(async () => {
  const token = await getYouTubeAccessToken();

  // 1. Validate playlist id.
  const pl = await api(token, `playlists?part=snippet&id=${PLAYLIST}`);
  if (!pl.json.items?.length) {
    console.log(`⚠️  playlist id "${PLAYLIST}" not found directly. Your playlists:`);
    const mine = await api(token, 'playlists?part=snippet&mine=true&maxResults=25');
    for (const p of mine.json.items ?? []) console.log(`   ${p.id}  "${p.snippet?.title}"`);
    return;
  }
  console.log(`Playlist: "${pl.json.items[0].snippet?.title}" [${PLAYLIST}]`);

  // 2. Current items (paginate).
  const current = new Set<string>(); let pageToken: string | undefined;
  do {
    const r = await api(token, `playlistItems?part=contentDetails&playlistId=${PLAYLIST}&maxResults=50${pageToken ? '&pageToken=' + pageToken : ''}`);
    for (const it of r.json.items ?? []) current.add(it.contentDetails?.videoId);
    pageToken = r.json.nextPageToken;
  } while (pageToken);
  console.log(`Already in playlist: ${current.size}\n`);

  // 3. Add missing.
  let added = 0;
  for (const vid of SANDY) {
    if (current.has(vid)) { console.log(`⏭  ${vid} already in playlist`); continue; }
    const r = await api(token, 'playlistItems?part=snippet', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ snippet: { playlistId: PLAYLIST, resourceId: { kind: 'youtube#video', videoId: vid } } }),
    });
    if (r.ok) { console.log(`✅ added ${vid}`); added++; }
    else { console.log(`❌ ${vid} ${r.status}: ${JSON.stringify(r.json.error?.message || r.json).slice(0, 160)}`); }
  }
  console.log(`\nAdded ${added}, skipped ${SANDY.length - added} (already present or failed).`);
})().catch(e => console.error('ERR:', e?.message || e));
