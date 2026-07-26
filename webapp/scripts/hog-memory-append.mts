// hog-memory-append.mts — the daily brain's pen: append one row to the HoG
// analytical memory (hog_memory) from the headless CLI. Multi-channel Phase 4b.
//
// Usage (cwd = webapp):
//   node --env-file=.env.local --import tsx scripts/hog-memory-append.mts \
//     --key SANDY --kind hypothesis --slug hook-first-frame \
//     --status PENDING --unlock 2026-07-30 \
//     --text "Хук в первом кадре поднимает удержание первых 6с"
//
//   --key    (required) channel credential_key (SANDY / PRAGMATIC / …)
//   --kind   (required) hypothesis | experiment | decision
//   --slug   hypothesis identity — repeat the same slug later with a new
//            --status to update it (the weekly rollup folds latest-wins)
//   --status PENDING | CONFIRMED | REFUTED   (hypothesis/experiment)
//   --unlock YYYY-MM-DD — earliest date the hypothesis becomes judgeable
//   --text   human-readable statement (goes to payload.text)
//   --json   extra payload fields as a JSON object (merged over text/slug)
//
// daily_advice / rollup kinds are cron-owned — this pen only writes the
// journal kinds, so a prompt mistake can't forge advisor output.

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : null;
}

const KINDS = ['hypothesis', 'experiment', 'decision'];
const STATUSES = ['PENDING', 'CONFIRMED', 'REFUTED'];

async function main() {
  const key = arg('key');
  const kind = arg('kind');
  const slug = arg('slug');
  const status = arg('status');
  const unlock = arg('unlock');
  const text = arg('text');
  const jsonRaw = arg('json');

  if (!key || !kind || !KINDS.includes(kind)) {
    throw new Error(`--key and --kind (${KINDS.join('|')}) are required`);
  }
  if (status && !STATUSES.includes(status)) {
    throw new Error(`--status must be one of ${STATUSES.join('|')}`);
  }
  if (unlock && !/^\d{4}-\d{2}-\d{2}$/.test(unlock)) {
    throw new Error('--unlock must be YYYY-MM-DD');
  }
  if (kind === 'hypothesis' && !slug) {
    throw new Error('--slug is required for a hypothesis (its identity across status updates)');
  }

  let extra: Record<string, unknown> = {};
  if (jsonRaw) {
    const parsed = JSON.parse(jsonRaw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('--json must be a JSON object');
    }
    extra = parsed as Record<string, unknown>;
  }

  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: ch, error: chErr } = await sb
    .from('channels')
    .select('id, name')
    .eq('credential_key', key.toUpperCase())
    .maybeSingle();
  if (chErr) throw new Error(`channels read failed: ${chErr.message}`);
  if (!ch) throw new Error(`No channel with credential_key='${key}'`);

  const payload: Record<string, unknown> = { ...extra };
  if (slug) payload.slug = slug;
  if (text) payload.text = text;

  const { error } = await sb.from('hog_memory').insert({
    channel_id: ch.id,
    kind,
    status: status ?? (kind === 'hypothesis' ? 'PENDING' : null),
    unlock_date: unlock ?? null,
    payload: payload as never,
  });
  if (error) throw new Error(`hog_memory insert failed: ${error.message}`);
  console.log(`[hog-memory] appended ${kind}${slug ? ` '${slug}'` : ''} for ${ch.name}`);
}

main().catch((e) => {
  console.error('[hog-memory] FAILED:', e?.message ?? e);
  process.exit(1);
});
