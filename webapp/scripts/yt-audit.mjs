// yt-audit.mjs — READ-ONLY live audit of the Sandy the Hourglass channel.
// Reads GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + YOUTUBE_REFRESH_TOKEN from env.
// Enumerates EVERY upload (incl. unlisted/private — owner scope), pulls public
// statistics (views/likes/comments) + privacy status + duration, and per-video
// averageViewPercentage from the Analytics API (last 90d). No writes anywhere.
//
// Run:  node yt-audit.mjs
// Env is expected to be already exported (never hardcode secrets in this file).

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID?.trim();
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET?.trim();
const REFRESH = process.env.YOUTUBE_REFRESH_TOKEN?.trim();

if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH) {
  console.error('MISSING ENV. Need GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + YOUTUBE_REFRESH_TOKEN.');
  console.error('Present:', {
    GOOGLE_CLIENT_ID: !!CLIENT_ID, GOOGLE_CLIENT_SECRET: !!CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN: !!REFRESH,
  });
  process.exit(1);
}

const DATA = 'https://www.googleapis.com/youtube/v3';
const ANALYTICS = 'https://youtubeanalytics.googleapis.com/v2/reports';

async function token() {
  const body = new URLSearchParams({
    client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
    refresh_token: REFRESH, grant_type: 'refresh_token',
  });
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body,
  });
  if (!r.ok) { console.error('TOKEN FAIL', r.status, (await r.text()).slice(0, 400)); process.exit(1); }
  return (await r.json()).access_token;
}

const ymd = (d) => d.toISOString().slice(0, 10);
function isoDurToSec(iso) {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '') || [];
  return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
}

async function main() {
  const t = await token();
  const H = { Authorization: `Bearer ${t}` };
  const g = async (u) => { const r = await fetch(u, { headers: H }); if (!r.ok) throw new Error(`${r.status} ${u}\n${(await r.text()).slice(0,300)}`); return r.json(); };

  // 1) uploads playlist for the authorized channel
  const ch = await g(`${DATA}/channels?part=contentDetails,statistics,snippet&mine=true`);
  const c0 = ch.items?.[0];
  const uploads = c0?.contentDetails?.relatedPlaylists?.uploads;
  console.log(`\nCHANNEL: ${c0?.snippet?.title}  subs=${c0?.statistics?.subscriberCount}  totalViews=${c0?.statistics?.viewCount}  videos=${c0?.statistics?.videoCount}`);
  if (!uploads) { console.error('No uploads playlist'); process.exit(1); }

  // 2) all upload video ids (paginated)
  const ids = [];
  let page;
  do {
    const j = await g(`${DATA}/playlistItems?part=contentDetails&maxResults=50&playlistId=${uploads}${page ? `&pageToken=${page}` : ''}`);
    for (const it of j.items || []) ids.push(it.contentDetails.videoId);
    page = j.nextPageToken;
  } while (page);

  // 3) snippet+stats+status+duration for all
  const rows = [];
  for (let i = 0; i < ids.length; i += 50) {
    const j = await g(`${DATA}/videos?part=snippet,statistics,status,contentDetails&id=${ids.slice(i, i + 50).join(',')}`);
    for (const v of j.items || []) rows.push({
      id: v.id, title: v.snippet?.title, privacy: v.status?.privacyStatus,
      published: v.snippet?.publishedAt?.slice(0, 10),
      views: +(v.statistics?.viewCount || 0), likes: +(v.statistics?.likeCount || 0),
      comments: +(v.statistics?.commentCount || 0), dur: isoDurToSec(v.contentDetails?.duration),
    });
  }

  // 4) analytics avg-view-% per video (last 90d) — may be null for new/unlisted
  const now = new Date(); const start = new Date(now - 90 * 864e5);
  for (const r of rows) {
    try {
      const p = new URLSearchParams({ ids: 'channel==MINE', startDate: ymd(start), endDate: ymd(now), metrics: 'views,averageViewPercentage,estimatedMinutesWatched', filters: `video==${r.id}` });
      const j = await g(`${ANALYTICS}?${p}`);
      const row = j.rows?.[0];
      r.aViews = row?.[0] ?? null; r.avgPct = row?.[1] ?? null; r.watchMin = row?.[2] ?? null;
    } catch { r.avgPct = null; }
  }

  rows.sort((a, b) => b.views - a.views);
  console.log('\nviews  | pct%  | pub        | priv     | kind | title');
  console.log('-------|-------|------------|----------|------|------');
  for (const r of rows) {
    const kind = r.dur > 0 && r.dur <= 60 ? 'short' : 'long';
    console.log(
      `${String(r.views).padStart(6)} | ${(r.avgPct == null ? '  -' : r.avgPct.toFixed(0)).padStart(5)} | ${r.published || '?'} | ${(r.privacy || '?').padEnd(8)} | ${kind.padEnd(4)} | ${r.title}`,
    );
  }
  console.log(`\n${rows.length} videos total.`);
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
