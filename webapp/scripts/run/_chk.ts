import { sb, S15 } from './_env';
import { resolveChannelRefreshToken } from '../../lib/agents/providers/google-auth';

async function main() {
  const { data: s } = await sb.from('series').select('channel_id').eq('id', S15).single();
  const { data: ch } = await sb.from('channels').select('credential_key').eq('id', s!.channel_id!).single();
  const rt = await resolveChannelRefreshToken(ch!.credential_key);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: rt!,
      grant_type: 'refresh_token',
    }),
  });
  const tj: any = await r.json();
  if (!tj.access_token) { console.log('TOKEN ERR', JSON.stringify(tj).slice(0, 300)); return; }
  const v = await fetch(
    'https://www.googleapis.com/youtube/v3/videos?part=status,snippet&id=' + process.argv[2],
    { headers: { Authorization: 'Bearer ' + tj.access_token } },
  );
  const j: any = await v.json();
  const it = j.items?.[0];
  if (!it) { console.log('NO ITEM', JSON.stringify(j).slice(0, 300)); return; }
  console.log('title:', it.snippet.title);
  console.log('privacyStatus:', it.status.privacyStatus, '| uploadStatus:', it.status.uploadStatus);
}
main().catch((e) => console.log('ERR', e?.message ?? e));
