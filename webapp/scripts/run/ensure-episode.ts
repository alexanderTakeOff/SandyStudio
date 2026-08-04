import { sb, S15 } from './_env';

async function main() {
  const code = 'SS-S15-E35';
  const { data: found } = await sb.from('episodes').select('id,episode_code,status,budget_ceiling')
    .eq('series_id', S15).eq('episode_code', code).maybeSingle();
  if (found) { console.log('EXISTS', JSON.stringify(found)); return; }
  const { data, error } = await sb.from('episodes').insert({
    series_id: S15,
    episode_code: code,
    title_working: 'Очередь (The Queue)',
    status: 'BRIEF_APPROVED',
    budget_ceiling: 75,
    budget_spent: 0,
    metadata: { run: 'clean-run', theme_slug: 'the_waiting' },
  }).select('id,episode_code,status,budget_ceiling').single();
  if (error) { console.error('ERR', error.message); process.exit(1); }
  console.log('CREATED', JSON.stringify(data));
}
main().catch(e => { console.error(e); process.exit(1); });
