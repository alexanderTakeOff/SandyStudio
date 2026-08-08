// Direct-call publication for the clean run. Uploads the finished cut to the
// series' channel with packaging read from the channel passport, then records
// the video id on the episode row.
//
// Publication is a Director-only gate (CLAUDE.md §6). This script performs it;
// the authorisation lives in the conversation, not here. Contract: `--help`.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sb, seriesId } from './_env';
import { defineTool } from './_tool';
import { uploadVideo } from '../../lib/providers/youtube';
import { resolveChannelRefreshToken } from '../../lib/providers/google-auth';

export default defineTool(
  {
    name: 'publish',
    summary: 'Заливает готовый кат на канал серии, упаковку берёт из паспорта канала, id видео пишет в эпизод.',
    args: {
      file: { about: 'готовый кат MP4' },
      title: { about: 'заголовок публикации' },
      'desc-file': { about: 'файл с описанием' },
      privacy: { about: 'видимость на площадке', default: 'public', values: ['public', 'unlisted', 'private'] },
    },
    // Episode comes from the environment, never hardcoded: a stale id publishes
    // onto the wrong episode row silently (2026-08-04 stocktake).
    env: {
      RUN_EPISODE_ID: { about: 'эпизод, на который записывается публикация' },
      RUN_SERIES_ID: { about: 'сериал, над которым идёт работа; умолчания нет — чужой сериал молча делает не ту работу' },
    },
    reads: ['series', 'channels', 'episodes'],
    writes: ['episodes'],
    stations: ['publisher'],
  },
  async ({ arg, env }) => {
    const file = resolve(process.cwd(), arg('file'));
    const title = arg('title');
    const description = readFileSync(resolve(process.cwd(), arg('desc-file')), 'utf8').trim();
    const privacy = arg('privacy');
    const episodeId = env('RUN_EPISODE_ID');

    const { data: series } = await sb.from('series').select('channel_id').eq('id', seriesId()).single();
    if (!series?.channel_id) throw new Error('series has no channel — HALT (multi-channel §3)');
    const { data: channel } = await sb
      .from('channels')
      .select('name,credential_key,youtube_channel_id,metadata')
      .eq('id', series.channel_id)
      .single();
    if (!channel) throw new Error('channel row not found');

    const meta = (channel.metadata ?? {}) as Record<string, any>;
    const tags: string[] = meta.branding?.short_tags ?? [];
    const pub = meta.publish_defaults ?? {};

    console.log(`channel: ${channel.name} (${channel.youtube_channel_id}) key=${channel.credential_key}`);
    console.log(`title: ${title}`);
    console.log(`tags: ${tags.join(', ')}`);
    console.log(`privacy: ${privacy}`);

    const bytes = readFileSync(file);
    const refreshToken = resolveChannelRefreshToken(channel.credential_key);

    const res = await uploadVideo(
      {
        bytes,
        title,
        description,
        privacyStatus: privacy,
        tags,
        categoryId: pub.category_id ?? '23',
        madeForKids: pub.made_for_kids ?? false,
        defaultLanguage: pub.default_language ?? 'en',
      },
      { refreshToken },
    );

    console.log(`PUBLISHED ${res.url} (${res.privacyStatus})`);

    // D58: the previous version wrote `metadata` as a LITERAL carrying another
    // episode's passport (`run: 'clean-run', theme_slug: 'the_waiting'`), so
    // publishing silently overwrote the run mark and the theme of whatever
    // episode it was pointed at. Publication owns three fields and nothing else —
    // merge them onto the existing passport instead of replacing the object.
    const { data: current } = await sb
      .from('episodes')
      .select('metadata')
      .eq('id', episodeId)
      .single();

    const { error } = await sb
      .from('episodes')
      .update({
        status: 'PUBLISHED',
        metadata: {
          ...((current?.metadata ?? {}) as Record<string, unknown>),
          youtube_video_id: res.id,
          youtube_url: res.url,
          privacy_status: res.privacyStatus,
        },
      })
      .eq('id', episodeId);
    if (error) console.error(`episode row NOT updated: ${error.message}`);
    else console.log('episode row updated → PUBLISHED');
  },
);
