// Читалка студии одним инструментом (Ф6 миграции — замена шести чат-тулов
// getEpisode / getStudioStatus / findEpisode / listSeries / listSeriesBibles /
// listThemes). Только чтение; изделие целиком показывает show-asset.
// Contract: `--help`.
import { sb, runEnv } from './_env';
import { defineTool } from './_tool';

export default defineTool(
  {
    name: 'show',
    summary: 'Состояние студии текстом: эпизод, сериалы, плиты канона, банк тем.',
    args: {
      what: {
        about: 'что показать',
        values: ['episode', 'series', 'bibles', 'themes'],
      },
      series: { about: 'uuid сериала для bibles/themes; пусто — RUN_SERIES_ID', default: '' },
    },
    reads: ['episodes', 'series', 'assets'],
    // Сквозной: чтение нужно на любой станции.
    stations: [],
  },
  async ({ arg }) => {
    const what = arg('what');

    if (what === 'episode') {
      const id = runEnv('RUN_EPISODE_ID');
      if (!id) throw new Error('RUN_EPISODE_ID не выставлен');
      const { data: ep, error } = await sb
        .from('episodes')
        .select('episode_code,title_working,status,budget_ceiling,governance_mode,metadata')
        .eq('id', id)
        .maybeSingle();
      if (error || !ep) throw new Error(`эпизод: ${error?.message ?? 'не найден'}`);
      const meta = (ep.metadata ?? {}) as Record<string, unknown>;
      console.log(`${ep.episode_code} «${ep.title_working ?? ''}» · статус ${ep.status} · режим ${ep.governance_mode}`);
      console.log(
        `бюджет: потолок ${ep.budget_ceiling ?? 'НЕ ЗАДАН'} · approved=${meta.budget_approved === true}`,
      );
      // Настройки печатаем ЗНАЧЕНИЯМИ (Директор, 10.08). «настройки=есть» не отвечало
      // на единственный вопрос, ради которого их смотрят: чем именно я сейчас генерирую.
      const gen = (meta.generation_config ?? {}) as Record<string, Record<string, unknown>>;
      const v = gen.video ?? {};
      const i = gen.image ?? {};
      const videoLine = [v.provider_id, v.aspect_ratio, v.resolution, v.quality_tier].filter(Boolean).join(' · ');
      const imageLine = [i.provider_id, i.quality].filter(Boolean).join(' · ');
      console.log(`настройки видео: ${videoLine || 'НЕ ЗАДАНЫ'}`);
      console.log(`настройки кадра: ${imageLine || 'НЕ ЗАДАНЫ'}`);
      const { data: assets } = await sb
        .from('assets')
        .select('file_type,filename,status,version')
        .eq('episode_id', id)
        .order('created_at', { ascending: true });
      for (const a of assets ?? []) console.log(`  ${a.status.padEnd(9)} v${a.version}  ${a.filename}`);
      return;
    }

    if (what === 'series') {
      const { data, error } = await sb
        .from('series')
        .select('id,code,title,genre,metadata')
        .order('code');
      if (error) throw new Error(error.message);
      for (const s of data ?? []) {
        // Жанр — СВОЯ колонка (её читает движок жанровых скиллов). В metadata он лежал
        // только у старых серий; читать оттуда значило показывать «?» для всех живых.
        const genre = s.genre ?? ((s.metadata ?? {}) as Record<string, unknown>).genre ?? '?';
        console.log(`${s.code} «${s.title}» · жанр ${genre} · ${s.id}`);
      }
      return;
    }

    const seriesId = arg('series') || runEnv('RUN_SERIES_ID');
    if (!seriesId) throw new Error('нужен --series или RUN_SERIES_ID');

    if (what === 'bibles') {
      const { data, error } = await sb
        .from('assets')
        .select('file_type,filename,status,version')
        .eq('series_id', seriesId)
        .like('file_type', 'SBL-%')
        .order('file_type')
        .order('version', { ascending: false });
      if (error) throw new Error(error.message);
      const seen = new Set<string>();
      for (const a of data ?? []) {
        if (seen.has(a.file_type)) continue; // свежая версия каждой плиты
        seen.add(a.file_type);
        console.log(`  ${a.status.padEnd(11)} v${a.version}  ${a.file_type.slice(4)}`);
      }
      return;
    }

    if (what === 'themes') {
      // Банк тем — ассеты SPC-theme_{slug}; кураторский статус в
      // metadata.theme_status, НЕ в статусе строки (см. api/series/[id]/themes).
      const { data, error } = await sb
        .from('assets')
        .select('file_type,description,metadata')
        .eq('series_id', seriesId)
        .like('file_type', 'SPC-theme_%')
        .order('file_type');
      if (error) throw new Error(error.message);
      for (const t of data ?? []) {
        const st = String(((t.metadata ?? {}) as Record<string, unknown>).theme_status ?? 'draft');
        console.log(`${st.padEnd(11)} ${t.file_type.slice('SPC-theme_'.length)} — ${String(t.description ?? '').slice(0, 90)}`);
      }
      return;
    }
  },
);
