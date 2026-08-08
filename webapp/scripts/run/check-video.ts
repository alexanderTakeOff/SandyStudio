// Ask the platform what it actually did with an uploaded video. Closes the hole
// «проверить, что залилось»: `publish` prints what it SENT, this prints what
// YouTube STORED — privacy and upload status straight from the API.
// Contract: `--help`.
import { sb, seriesId } from './_env';
import { defineTool } from './_tool';
import { resolveChannelRefreshToken } from '../../lib/providers/google-auth';

export default defineTool(
  {
    name: 'check-video',
    summary: 'Читает у площадки состояние залитого видео: заголовок, приватность, статус обработки.',
    args: {
      id: { about: 'id видео на YouTube (`res.id` из `publish`, хвост ссылки)' },
    },
    env: {
      RUN_SERIES_ID: { about: 'сериал, над которым идёт работа; умолчания нет — чужой сериал молча делает не ту работу' },
      GOOGLE_CLIENT_ID: { about: 'клиент OAuth для обмена refresh-токена' },
      GOOGLE_CLIENT_SECRET: { about: 'секрет OAuth' },
    },
    reads: ['series', 'channels'],
    stations: ['publisher', 'analytics_collector'],
  },
  async ({ arg, env }) => {
    const { data: s } = await sb.from('series').select('channel_id').eq('id', seriesId()).single();
    if (!s?.channel_id) throw new Error('series has no channel — HALT (multi-channel §3)');
    const { data: ch } = await sb.from('channels').select('credential_key').eq('id', s.channel_id).single();
    if (!ch) throw new Error('channel row not found');

    const refreshToken = resolveChannelRefreshToken(ch.credential_key);
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env('GOOGLE_CLIENT_ID'),
        client_secret: env('GOOGLE_CLIENT_SECRET'),
        refresh_token: refreshToken!,
        grant_type: 'refresh_token',
      }),
    });
    const token: any = await tokenRes.json();
    if (!token.access_token) throw new Error(`token exchange failed: ${JSON.stringify(token).slice(0, 300)}`);

    const videoRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=status,snippet&id=${encodeURIComponent(arg('id'))}`,
      { headers: { Authorization: `Bearer ${token.access_token}` } },
    );
    const body: any = await videoRes.json();
    const item = body.items?.[0];
    // A missing item is a REFUSAL, not a note: the old stub printed «NO ITEM» and
    // exited 0, so a wrong id read as a clean check.
    if (!item) throw new Error(`no such video for this channel: ${JSON.stringify(body).slice(0, 300)}`);

    console.log('title:', item.snippet.title);
    console.log('privacyStatus:', item.status.privacyStatus, '| uploadStatus:', item.status.uploadStatus);
  },
);
