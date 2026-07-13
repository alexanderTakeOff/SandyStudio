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
