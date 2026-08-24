// Плейлист серии на канале: находит по названию или заводит, и ЗАПИСЫВАЕТ его id
// в паспорт серии — иначе заливка о нём не узнает.
//
// WHY (2026-08-16): `publish.ts` кладёт выпуск в плейлист через
// `resolveSeriesPlaylistId`, а тот читает `series.metadata.youtube_playlist_id` —
// данные, которые до сих пор появлялись только руками в базе. Провайдер умел
// `createPlaylist` с 4a, но станции нечем было его позвать: плейлист заводился
// в интерфейсе YouTube, id переносился вручную, и любой пропуск этого переноса
// означал выпуск мимо плейлиста — молча, потому что шаг best-effort.
//
// Идемпотентность обязательна: повторный вызов не должен плодить одноимённые
// плейлисты. Сначала ищем по точному названию среди своих, создаём только если
// не нашли. Contract: `--help`.
import { sb, seriesId } from './_env';
import { defineTool } from './_tool';
import { findPlaylistByTitle, createPlaylist } from '../../lib/providers/youtube';
import { resolveChannelRefreshToken } from '../../lib/providers/google-auth';

export default defineTool(
  {
    name: 'make-playlist',
    summary: 'Заводит (или находит) плейлист серии на её канале и записывает id в паспорт серии — заливка кладёт выпуски туда сама.',
    args: {
      title: { about: 'название плейлиста на площадке; ищется точным совпадением без учёта регистра' },
      desc: { about: 'описание плейлиста', default: '' },
      privacy: { about: 'видимость плейлиста', default: 'public', values: ['public', 'unlisted', 'private'] },
      save: {
        about: 'записать id в `series.metadata.youtube_playlist_id`; `no` — только показать',
        default: 'yes',
        values: ['yes', 'no'],
      },
    },
    env: {
      RUN_SERIES_ID: { about: 'сериал, чей это плейлист; умолчания нет — чужая серия молча уедет в чужой плейлист' },
    },
    reads: ['series', 'channels'],
    writes: ['series'],
    stations: ['publisher'],
  },
  async ({ arg, env }) => {
    void env;
    const title = arg('title');
    const sid = seriesId();

    const { data: series } = await sb.from('series').select('channel_id,metadata').eq('id', sid).single();
    if (!series?.channel_id) throw new Error('у серии нет канала — HALT (multi-channel §3)');
    const { data: channel } = await sb
      .from('channels')
      .select('name,credential_key')
      .eq('id', series.channel_id)
      .single();
    if (!channel) throw new Error('строки канала нет');

    const ytAuth = { refreshToken: resolveChannelRefreshToken(channel.credential_key) };
    console.log(`channel: ${channel.name} key=${channel.credential_key}`);

    const found = await findPlaylistByTitle(title, ytAuth);
    const playlist = found ?? (await createPlaylist(title, arg('desc'), arg('privacy'), ytAuth));
    console.log(
      found
        ? `НАЙДЕН существующий плейлист «${playlist.title}» — ${playlist.id}, второй не заводился`
        : `СОЗДАН плейлист «${playlist.title}» — ${playlist.id} (${arg('privacy')})`,
    );

    if (arg('save') === 'no') {
      console.log('в паспорт серии НЕ записан (--save no) — заливка о нём не узнает');
      return;
    }

    // Паспорт мержится, а не заменяется: литерал затёр бы всё остальное, что в нём
    // лежит (класс дефекта D58 — публикация, переписавшая чужой паспорт целиком).
    const meta = { ...((series.metadata ?? {}) as Record<string, unknown>), youtube_playlist_id: playlist.id };
    const { error } = await sb.from('series').update({ metadata: meta }).eq('id', sid);
    if (error) throw new Error(`паспорт серии НЕ обновлён: ${error.message}`);
    console.log(`паспорт серии обновлён: youtube_playlist_id=${playlist.id}`);
  },
);
