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
// Read mode (added 2026-07-31): the daily brain used to WRITE the journal and
// never read it, so yesterday's decision — and the Director's answer to it —
// could not reach the next morning's run. One flag closes that loop:
//
//   node --env-file=.env.local --import tsx scripts/hog-memory-append.mts \
//     --key PRAGMATIC --list 20
//
//   --list [N]  print the last N journal rows (default 20) as text and exit.
//               Nothing else is required; no row is written.
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
  const listing = process.argv.includes('--list');

  if (!key) throw new Error('--key is required');
  if (!listing && (!kind || !KINDS.includes(kind))) {
    throw new Error(`--kind (${KINDS.join('|')}) is required unless --list`);
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

  if (listing) {
    const limit = Number(arg('list') ?? 20) || 20;
    const { data: rows, error: readErr } = await sb
      .from('hog_memory')
      .select('kind, status, unlock_date, created_at, payload')
      .eq('channel_id', ch.id)
      .in('kind', KINDS)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (readErr) throw new Error(`hog_memory read failed: ${readErr.message}`);
    console.log(`[hog-memory] ${ch.name} — last ${rows?.length ?? 0} journal rows (newest first)`);
    for (const r of rows ?? []) {
      const p = (r.payload ?? {}) as Record<string, unknown>;
      const head = [
        r.created_at.slice(0, 10),
        r.kind,
        typeof p.slug === 'string' ? p.slug : '—',
        r.status ?? '—',
        r.unlock_date ? `unlock ${r.unlock_date}` : '',
      ]
        .filter(Boolean)
        .join(' · ');
      console.log(`\n${head}\n  ${typeof p.text === 'string' ? p.text : ''}`);
    }
    return;
  }

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
