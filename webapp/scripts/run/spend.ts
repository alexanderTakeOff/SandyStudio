// What this run has actually spent, straight from `budget_log`. Replaces two
// stubs that carried another episode's id in a `const` — the money instrument
// answered about the wrong episode and said so nowhere. The episode comes from
// `RUN_EPISODE_ID`, like every other tool. Contract: `--help`.
import { sb } from './_env';
import { defineTool } from './_tool';

export default defineTool(
  {
    name: 'spend',
    summary: 'Траты текущего прогона: построчно и сводкой по видам работ. Читается вместо счёта в уме.',
    args: {
      detail: { about: 'печатать ли каждую строку, а не только сводку', default: 'yes', values: ['yes', 'no'] },
    },
    env: { RUN_EPISODE_ID: { about: 'эпизод, по которому считаются траты' } },
    reads: ['budget_log'],
    // Сквозной: единственный законный источник остатка (правило 4 промпта).
    stations: [],
  },
  async ({ arg, env }) => {
    const { data, error } = await sb
      .from('budget_log')
      .select('operation,model_or_tier,api_provider,cost_usd,duration_ms')
      .eq('episode_id', env('RUN_EPISODE_ID'))
      .order('created_at');
    if (error) throw new Error(`budget_log read failed: ${error.message}`);

    const rows = data ?? [];
    if (rows.length === 0) {
      console.log('строк нет — по этому эпизоду ещё не потрачено');
      return;
    }

    const byKind: Record<string, { n: number; sum: number }> = {};
    let total = 0;
    for (const r of rows) {
      const cost = Number(r.cost_usd);
      total += cost;
      const kind = r.operation.split(':')[0];
      byKind[kind] ??= { n: 0, sum: 0 };
      byKind[kind].n++;
      byKind[kind].sum += cost;
      if (arg('detail') === 'yes') {
        console.log(`${r.operation} | ${r.model_or_tier} | $${cost.toFixed(3)}`);
      }
    }

    if (arg('detail') === 'yes') console.log('');
    for (const [kind, v] of Object.entries(byKind)) {
      console.log(`${kind}: ${v.n} шт · $${v.sum.toFixed(2)}`);
    }
    console.log(`ВСЕГО $${total.toFixed(2)} · строк ${rows.length}`);
  },
);
