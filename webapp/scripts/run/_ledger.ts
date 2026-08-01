import { sb } from './_env';
const EP = '9ec4366e-96fa-4324-8de1-89bec5914f80';
async function main() {
  const { data, error } = await sb.from('budget_log')
    .select('operation,model_or_tier,cost_usd,duration_ms').eq('episode_id', EP);
  console.log('rows:', data?.length ?? 0, error?.message ?? '');
  let t = 0;
  for (const r of data ?? []) { t += Number(r.cost_usd); console.log(`${r.operation} | ${r.model_or_tier} | $${r.cost_usd}`); }
  console.log('TOTAL $' + t.toFixed(3));
}
main();
