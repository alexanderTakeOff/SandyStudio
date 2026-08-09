import { sb } from './run/_env';
async function main(){
  const { data } = await sb.from('episodes').select('metadata').eq('id','8f053f75-e204-4f9f-b6c4-d3fbe9ade163').maybeSingle();
  console.log('mind_session:', JSON.stringify((data?.metadata as any)?.mind_session));
  const { data: b } = await sb.from('budget_log').select('agent_id,operation,cost_usd,created_at').eq('episode_id','8f053f75-e204-4f9f-b6c4-d3fbe9ade163').eq('operation','mind-turn').order('created_at',{ascending:false}).limit(2);
  console.log('budget mind-turn:', JSON.stringify(b));
  const { data: t } = await sb.from('concierge_turns').select('role,event_type').gte('created_at', new Date(Date.now()-30*60*1000).toISOString());
  const counts: Record<string,number> = {};
  for (const x of t ?? []) { const k = x.role+'/'+x.event_type; counts[k]=(counts[k]??0)+1; }
  console.log('turns 30мин:', JSON.stringify(counts));
}
main();
