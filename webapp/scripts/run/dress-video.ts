// Доводит УЖЕ ЗАЛИТЫЙ выпуск: ставит утверждённую обложку и меняет видимость.
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ ИНСТРУМЕНТ (22.08, замечание Директора «на канале обложки нет»).
// `publish` умеет и обложку, и приватность — но ТОЛЬКО в одном движении с заливкой
// байтов. Если обложка не встала (упал `thumbnails.set`, обложку утвердили после
// заливки, ролик залили другим путём), починить это было НЕЧЕМ: перезаливать
// готовое видео ради картинки — терять адрес, счётчики и место в плейлисте. Дыра
// класса «выпуск на площадке, упаковка на площадку не доехала» стояла открытой.
//
// Почему не расширением `publish`: тот инструмент — про заливку нового, и он под
// хард-лимитом кнопки Директора. Довести уже залитое — другая работа с другим
// риском. Общее у них одно — выбор обложки; он и вынесен в `lib/publish-dress.ts`,
// чтобы правило «берём свежайший APPROVED IMG-thumbnail» жило в ОДНОМ месте.
//
// ВИДИМОСТЬ — ХАРД-ЛИМИТ ДИРЕКТОРА (CLAUDE.md §6). Инструмент её меняет, но
// разрешение живёт в разговоре, не здесь; `--privacy` по умолчанию пуст, то есть
// сам по себе прогон видимость не трогает НИКОГДА. Contract: `--help`.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { sb, seriesId } from './_env';
import { defineTool } from './_tool';
import { getVideoDetails, setThumbnail, setVideoPrivacy, type PrivacyStatus } from '../../lib/providers/youtube';
import { resolveChannelRefreshToken } from '../../lib/providers/google-auth';
import { approvedThumbnailBytes } from '../../lib/publish-dress';

export default defineTool(
  {
    name: 'dress-video',
    summary:
      'Доводит уже залитый выпуск: ставит утверждённую обложку и меняет видимость — без перезаливки видео.',
    args: {
      id: {
        about: 'id видео на площадке; пусто — берётся `youtube_video_id` из паспорта эпизода',
        default: '',
      },
      thumb: {
        about: 'ставить ли свежайшую APPROVED IMG-thumbnail эпизода',
        default: 'yes',
        values: ['yes', 'no'],
      },
      privacy: {
        about:
          'ХАРД-ЛИМИТ ДИРЕКТОРА: новая видимость. Пусто — не трогать. Ставится только по прямому слову Директора в треде',
        default: '',
        values: ['', 'public', 'unlisted', 'private'],
      },
      out: {
        about: 'куда положить миниатюру, СКАЧАННУЮ с площадки после правки; пусто — не скачивать',
        default: '',
      },
    },
    env: {
      RUN_EPISODE_ID: { about: 'эпизод, чей выпуск доводится' },
      RUN_SERIES_ID: { about: 'сериал — через него канал и его токен; чужой сериал молча правит чужое видео' },
    },
    reads: ['series', 'channels', 'episodes', 'assets'],
    writes: ['episodes'],
    stations: ['publisher'],
  },
  async ({ arg, env }) => {
    const episodeId = env('RUN_EPISODE_ID');

    const { data: ep } = await sb.from('episodes').select('metadata').eq('id', episodeId).single();
    const passport = (ep?.metadata ?? {}) as Record<string, unknown>;
    const videoId = arg('id') || String(passport.youtube_video_id ?? '');
    if (!videoId) {
      throw new Error(
        'нет id видео: ни --id, ни `episodes.metadata.youtube_video_id`. Эпизод ещё не залит — довести нечего',
      );
    }

    const { data: series } = await sb.from('series').select('channel_id').eq('id', seriesId()).single();
    if (!series?.channel_id) throw new Error('series has no channel — HALT (multi-channel §3)');
    const { data: channel } = await sb
      .from('channels')
      .select('name,credential_key,youtube_channel_id')
      .eq('id', series.channel_id)
      .single();
    if (!channel) throw new Error('channel row not found');

    const ytAuth = { refreshToken: resolveChannelRefreshToken(channel.credential_key) };

    const before = await getVideoDetails(videoId, ytAuth);
    console.log(`channel: ${channel.name} (${channel.youtube_channel_id}) key=${channel.credential_key}`);
    console.log(`видео: ${videoId} · «${before.title}»`);
    console.log(`было: privacy=${before.privacyStatus} · upload=${before.uploadStatus}`);

    // ── Обложка ──────────────────────────────────────────────────────────
    if (arg('thumb') === 'yes') {
      const thumb = await approvedThumbnailBytes(sb as never, episodeId);
      if (!thumb) {
        // Громко и адресно: тишина здесь и была тем, из-за чего выпуск месяц
        // стоял бы с кадром из ролика, а отчёт говорил «опубликовано».
        throw new Error(
          'нет APPROVED IMG-thumbnail у эпизода — ставить нечего. Утверди обложку или запусти с --thumb no',
        );
      }
      await setThumbnail(videoId, thumb.bytes, thumb.contentType, ytAuth);
      console.log(`обложка поставлена: ${thumb.filename} (${(thumb.bytes.length / 1024).toFixed(0)} КБ)`);
    } else {
      console.log('обложка: не трогаю (--thumb no)');
    }

    // ── Видимость ────────────────────────────────────────────────────────
    const privacy = arg('privacy');
    if (privacy) {
      console.log(`ВИДИМОСТЬ — ХАРД-ЛИМИТ ДИРЕКТОРА: ${before.privacyStatus} → ${privacy}`);
      await setVideoPrivacy(videoId, privacy as PrivacyStatus, ytAuth);
      const { error } = await sb
        .from('episodes')
        .update({ metadata: { ...passport, youtube_privacy: privacy, privacy_status: privacy } })
        .eq('id', episodeId);
      if (error) console.error(`паспорт эпизода НЕ обновлён: ${error.message}`);
    } else {
      console.log('видимость: не трогаю (--privacy пуст)');
    }

    // ── Что площадка отдаёт ПОСЛЕ правки ─────────────────────────────────
    const after = await getVideoDetails(videoId, ytAuth);
    console.log(`стало: privacy=${after.privacyStatus} · upload=${after.uploadStatus}`);
    const best = after.thumbnails.maxres ?? after.thumbnails.standard ?? after.thumbnails.high;
    console.log(`миниатюра площадки: ${best?.url ?? '(нет)'}`);

    // Адрес — ещё не доказательство: у своей и у автоматической обложки он один
    // и тот же. Доказывает только сама картинка, поэтому её можно снять с
    // площадки и посмотреть ГЛАЗАМИ — так проверяется вещь, а не отчёт (§12).
    const out = arg('out');
    if (out && best?.url) {
      const abs = resolve(process.cwd(), out);
      mkdirSync(dirname(abs), { recursive: true });
      const res = await fetch(best.url);
      if (!res.ok) throw new Error(`не скачалась миниатюра площадки (${res.status}) ${best.url}`);
      writeFileSync(abs, Buffer.from(await res.arrayBuffer()));
      console.log(`миниатюра с площадки скачана: ${abs} — ОТКРОЙ ГЛАЗАМИ, адрес ничего не доказывает`);
    }
  },
);
