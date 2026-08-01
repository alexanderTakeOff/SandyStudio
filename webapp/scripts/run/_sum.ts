import { sb } from './_env';
async function main(){
  const { data } = await sb.from('budget_log').select('api_provider,cost_usd,operation').eq('episode_id','9ec4366e-96fa-4324-8de1-89bec5914f80');
  const by: Record<string,{n:number,s:number}> = {};
  for (const r of data ?? []) { const k = r.operation.startsWith('clip:') ? 'video' : 'frames'; by[k] ??= {n:0,s:0}; by[k].n++; by[k].s += Number(r.cost_usd); }
  for (const [k,v] of Object.entries(by)) console.log(`${k}: ${v.n} шт · $${v.s.toFixed(2)}`);
}
main();
