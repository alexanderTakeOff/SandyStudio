// hog-channels.mts — print the ACTIVE channel passports as JSON for the outer
// PowerShell HoG loop (hog-daily.ps1). Read-only; stdout = JSON array of
// { key, name, ntfy_topic }, one line. Errors go to stderr + exit 1.
//
// Run:  node --env-file=.env.local --import tsx scripts/hog-channels.mts
//       (cwd = webapp; needs SUPABASE_* in env)

async function main() {
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data, error } = await sb
    .from('channels')
    .select('credential_key, name, ntfy_topic')
    .eq('status', 'ACTIVE');
  if (error) throw new Error(`channels read failed: ${error.message}`);
  const out = (data ?? []).map((r) => ({
    key: r.credential_key,
    name: r.name,
    ntfy_topic: r.ntfy_topic,
  }));
  console.log(JSON.stringify(out));
}

main().catch((e) => {
  console.error('[hog-channels] FAILED:', e?.message ?? e);
  process.exit(1);
});
