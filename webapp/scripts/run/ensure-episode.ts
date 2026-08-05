// Create (or find) the episode row for a direct-call run.
//
// Prints the episode id — export it as RUN_EPISODE_ID for every other run tool,
// which refuse to act without it. Contract: `--help`.
import { sb, S15 } from './_env';
import { defineTool } from './_tool';

export default defineTool(
  {
    name: 'ensure-episode',
    summary: 'Заводит строку эпизода или находит существующую. Печатает id для `RUN_EPISODE_ID`.',
    args: {
      code: { about: 'код эпизода, `SS-S15-E37`' },
      // Обязательны только при СОЗДАНИИ. Требовать их всегда — значит заставлять
      // выдумывать название, чтобы просто узнать id существующего эпизода.
      title: { about: 'рабочее название; обязательно при создании', default: '' },
      theme: { about: 'слаг темы; обязателен при создании, ложится в паспорт', default: '' },
      ceiling: { about: 'потолок бюджета эпизода в долларах', default: '50' },
      run: { about: 'метка прогона в паспорте', default: 'forward-run' },
    },
    reads: ['episodes'],
    writes: ['episodes'],
  },
  async ({ arg }) => {
    const code = arg('code');
    const { data: found } = await sb
      .from('episodes')
      .select('id,episode_code,status,budget_ceiling')
      .eq('series_id', S15)
      .eq('episode_code', code)
      .maybeSingle();
    if (found) {
      console.log('EXISTS', JSON.stringify(found));
      return;
    }
    if (!arg('title') || !arg('theme')) {
      throw new Error(`эпизод ${code} не существует — для создания нужны --title и --theme`);
    }
    const { data, error } = await sb
      .from('episodes')
      .insert({
        series_id: S15,
        episode_code: code,
        title_working: arg('title'),
        status: 'BRIEF_APPROVED',
        budget_ceiling: Number(arg('ceiling')),
        budget_spent: 0,
        metadata: { run: arg('run'), theme_slug: arg('theme') },
      })
      .select('id,episode_code,status,budget_ceiling')
      .single();
    if (error) {
      console.error('ERR', error.message);
      process.exit(1);
    }
    console.log('CREATED', JSON.stringify(data));
  },
);
