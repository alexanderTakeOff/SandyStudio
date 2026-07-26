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
import { getGoogleAccessToken } from '../lib/agents/providers/google-auth';

const CH = 'UCc2YJlHFclO9BWLEgPlglIg';
const YT = 'https://www.googleapis.com/youtube/v3';

async function authed(url: string) {
  const t = await getGoogleAccessToken();
  return fetch(url, { headers: { Authorization: `Bearer ${t}` } });
}
(async () => {
  const cr = await authed(`${YT}/channels?id=${CH}&part=snippet,statistics,contentDetails,brandingSettings`);
  const cj = await cr.json() as any;
  const ch = cj.items?.[0];
  if (!ch) { console.log('Channel not found / not visible:', JSON.stringify(cj).slice(0,300)); return; }
  console.log('=== CHANNEL ===');
  console.log('Title      :', ch.snippet?.title);
  console.log('Custom URL :', ch.snippet?.customUrl || '(none)');
  console.log('Country    :', ch.snippet?.country || '(none)');
  console.log('Subs       :', ch.statistics?.subscriberCount, '| Videos:', ch.statistics?.videoCount, '| Views:', ch.statistics?.viewCount);
  console.log('Description:', (ch.snippet?.description || '(empty)').slice(0, 300));
  const uploads = ch.contentDetails?.relatedPlaylists?.uploads;
  console.log('Uploads pl :', uploads);

  console.log('\n=== PUBLIC VIDEOS ON CHANNEL ===');
  let token: string | undefined; let n = 0;
  do {
    const p = new URLSearchParams({ part: 'snippet,contentDetails', playlistId: uploads, maxResults: '50' });
    if (token) p.set('pageToken', token);
    const r = await authed(`${YT}/playlistItems?${p.toString()}`);
    const j = await r.json() as any;
    if (j.error) { console.log('(cannot list — only owner sees non-public):', j.error?.message); break; }
    for (const it of j.items ?? []) {
      n++;
      console.log(`  ${n}. ${it.snippet?.title}  [${it.contentDetails?.videoId}]  ${(it.contentDetails?.videoPublishedAt||'').slice(0,10)}`);
    }
    token = j.nextPageToken;
  } while (token);
  console.log(`\nTOTAL public videos visible: ${n}`);
})().catch(e => { console.error('ERR:', e?.message || e); });
