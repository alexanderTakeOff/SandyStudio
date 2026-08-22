// Direct-call publication for the clean run. Uploads the finished cut to the
// series' channel and records the video id on the episode row.
//
// УПАКОВКА ПОДТЯГИВАЕТСЯ САМА (13.08, очередь Полины п.17). Директор: «когда нажимаю
// кнопку, всё должно подтягиваться автоматически — я не должен заниматься
// переименованиями или заполнениями строк». До этой правки инструмент не открывал
// `SPC-metadata` вовсе: заголовок приходил аргументом, описание файлом, обложка не
// ставилась, в плейлист видео не попадало — то есть работа станции упаковки до канала
// не доезжала. Теперь всё это берётся из утверждённых изделий эпизода, ровно как у
// EXEC-PUB, а `--title` / `--desc-file` остались НЕОБЯЗАТЕЛЬНЫМ перекрытием.
//
// Publication is a Director-only gate (CLAUDE.md §6). This script performs it;
// the authorisation lives in the conversation, not here. Contract: `--help`.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sb, seriesId } from './_env';
import { defineTool } from './_tool';
import {
  uploadVideo,
  setThumbnail,
  isVideoInPlaylist,
  addVideoToPlaylist,
} from '../../lib/providers/youtube';
import { resolveSeriesPlaylistId } from '../../lib/providers/short-linkage';
import { resolveChannelRefreshToken } from '../../lib/providers/google-auth';
import { assertPublishable, extractRawMetadata } from '../../lib/publish-metadata';
import { approvedThumbnailBytes } from '../../lib/publish-dress';

/** Свежайшее утверждённое изделие эпизода данного типа. */
async function latestApproved(episodeId: string, fileType: string) {
  const { data } = await sb
    .from('assets')
    .select('id,filename,file_type,drive_file_id,content')
    .eq('episode_id', episodeId)
    .eq('file_type', fileType)
    .eq('status', 'APPROVED')
    .order('version', { ascending: false })
    .limit(1);
  return data?.[0] ?? null;
}

export default defineTool(
  {
    name: 'publish',
    summary:
      'Заливает готовый кат на канал серии: упаковку берёт из утверждённого SPC-metadata, ставит обложку, добавляет в плейлист, id видео пишет в эпизод.',
    args: {
      file: { about: 'готовый кат MP4' },
      title: { about: 'ПЕРЕКРЫТИЕ заголовка; пусто — берётся из APPROVED SPC-metadata', default: '' },
      'desc-file': { about: 'ПЕРЕКРЫТИЕ описания файлом; пусто — берётся из APPROVED SPC-metadata', default: '' },
      privacy: { about: 'видимость на площадке', default: 'public', values: ['public', 'unlisted', 'private'] },
    },
    // Episode comes from the environment, never hardcoded: a stale id publishes
    // onto the wrong episode row silently (2026-08-04 stocktake).
    env: {
      RUN_EPISODE_ID: { about: 'эпизод, на который записывается публикация' },
      RUN_SERIES_ID: { about: 'сериал, над которым идёт работа; умолчания нет — чужой сериал молча делает не ту работу' },
    },
    reads: ['series', 'channels', 'episodes', 'assets'],
    writes: ['episodes'],
    stations: ['publisher'],
  },
  async ({ arg, env }) => {
    const file = resolve(process.cwd(), arg('file'));
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
    const pub = meta.publish_defaults ?? {};

    // ── Упаковка из студии ───────────────────────────────────────────────
    const metaAsset = await latestApproved(episodeId, 'SPC-metadata');
    if (!metaAsset?.content) {
      throw new Error(
        'нет утверждённого SPC-metadata — публиковать нечем. Заведи его: ' +
          'npx tsx scripts/run/write-asset.ts --type SPC-metadata --file <файл.md> (секции ## Title · ## Description · ## Tags)',
      );
    }
    const raw = extractRawMetadata(metaAsset.content);
    assertPublishable(raw, { source: metaAsset.filename, language: pub.default_language ?? 'en' });

    // Перекрытия Директора побеждают, но печатаются — молчаливая подмена упаковки
    // и была тем, из-за чего работа станции терялась незаметно.
    const overrideTitle = arg('title');
    const overrideDescFile = arg('desc-file');
    const title = overrideTitle || raw.title;
    const description = overrideDescFile
      ? readFileSync(resolve(process.cwd(), overrideDescFile), 'utf8').trim()
      : raw.description;

    // Теги: бренд канала + слова этой серии, без дублей (решение Директора 191).
    // У них разная работа: канальные держат канал узнаваемым, эпизодные приводят
    // зрителя на тему. Потолок площадки — 30.
    const channelTags: string[] = meta.branding?.short_tags ?? [];
    const seen = new Set<string>();
    const tags = [...channelTags, ...raw.tags]
      .filter((t) => {
        const k = t.trim().toLowerCase();
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 30);

    console.log(`channel: ${channel.name} (${channel.youtube_channel_id}) key=${channel.credential_key}`);
    console.log(`упаковка: ${metaAsset.filename}`);
    console.log(`title: ${title}${overrideTitle ? '  ← ПЕРЕКРЫТО аргументом' : ''}`);
    console.log(`description: ${description.length} символов${overrideDescFile ? '  ← ПЕРЕКРЫТО файлом' : ''}`);
    console.log(`tags (${tags.length}): ${tags.join(', ')}`);
    console.log(`privacy: ${privacy}`);

    const bytes = readFileSync(file);
    const refreshToken = resolveChannelRefreshToken(channel.credential_key);
    const ytAuth = { refreshToken };

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
      ytAuth,
    );

    console.log(`PUBLISHED ${res.url} (${res.privacyStatus})`);

    // Обложка и плейлист — best-effort, как у EXEC-PUB: их отказ не отменяет
    // публикацию, но обязан быть НАПЕЧАТАН, а не проглочен.
    try {
      const thumb = await approvedThumbnailBytes(sb as never, episodeId);
      if (thumb) {
        await setThumbnail(res.id, thumb.bytes, thumb.contentType, ytAuth);
        console.log(`обложка поставлена: ${thumb.filename}`);
      } else {
        console.log('обложки нет (APPROVED IMG-thumbnail не найден) — видео уйдёт с кадром из ролика');
      }
    } catch (e) {
      // Отказ обложки не отменяет публикацию, но чинится потом одним движением:
      // `npx tsx scripts/run/dress-video.ts` — без перезаливки видео.
      console.error(`обложка НЕ поставлена: ${e instanceof Error ? e.message : e} · почини: dress-video`);
    }

    try {
      const playlistId = await resolveSeriesPlaylistId(sb as never, episodeId);
      if (playlistId && !(await isVideoInPlaylist(playlistId, res.id, ytAuth))) {
        await addVideoToPlaylist(playlistId, res.id, ytAuth);
        console.log(`добавлено в плейлист ${playlistId}`);
      }
    } catch (e) {
      console.error(`плейлист НЕ обновлён: ${e instanceof Error ? e.message : e}`);
    }

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
