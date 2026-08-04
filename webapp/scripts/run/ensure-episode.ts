// Create (or find) the episode row for a direct-call run.
//
//   npx tsx scripts/run/ensure-episode.ts --code SS-S15-E36 \
//     --title "Магнит (The Magnet)" --ceiling 50 --theme the_magnet
//
// Prints the episode id — export it as RUN_EPISODE_ID for every other run tool,
// which refuse to act without it.
import { sb, S15 } from './_env';

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`missing --${name}`);
}

async function main() {
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
  const { data, error } = await sb
    .from('episodes')
    .insert({
      series_id: S15,
      episode_code: code,
      title_working: arg('title'),
      status: 'BRIEF_APPROVED',
      budget_ceiling: Number(arg('ceiling', '50')),
      budget_spent: 0,
      metadata: { run: arg('run', 'forward-run'), theme_slug: arg('theme') },
    })
    .select('id,episode_code,status,budget_ceiling')
    .single();
  if (error) {
    console.error('ERR', error.message);
    process.exit(1);
  }
  console.log('CREATED', JSON.stringify(data));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
