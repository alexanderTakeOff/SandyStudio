import { sb } from './run/_env';
async function main() {
  const { data: ep } = await sb.from('episodes').select('id,episode_code,status,governance_mode,budget_ceiling,created_at,metadata')
    .ilike('id','23b4302d%').maybeSingle();
  const e = ep as any;
  if (!e) { const { data: all } = await sb.from('episodes').select('id,episode_code,status,created_at').order('created_at',{ascending:false}).limit(3); console.log('по префиксу не нашёл; свежие:', (all??[]).map((x:any)=>`${x.episode_code}=${x.id.slice(0,8)}`).join(' ')); }
  else console.log(`ЭПИЗОД ${e.episode_code} · ${e.status} · mode ${e.governance_mode} · потолок ${e.budget_ceiling} · создан ${String(e.created_at).slice(0,19)} · сессия ${JSON.stringify(e.metadata?.mind_session ?? '—')}`);

  const { data: msgs } = await sb.from('conversation_messages').select('created_at,role,actor,content,metadata')
    .order('created_at',{ascending:false}).limit(6);
  console.log('\n=== ПОСЛЕДНИЕ СТРОКИ ЧАТА ===');
  for (const m of (msgs ?? []) as any[]) console.log(` ${String(m.created_at).slice(11,19)} · ${String(m.role ?? m.actor).padEnd(10)} · ${String(m.content ?? '').replace(/\s+/g,' ').slice(0,90)}`);
}
main().then(() => process.exit(0));
