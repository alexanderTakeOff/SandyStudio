// One-shot: fix SH19 v03 APPROVED row to match the conventional
// staging_path / drive_path split that EXEC-STITCH expects.
//
// Convention (confirmed via probe-staging-paths.ts 2026-05-27):
//   staging_path = absolute Windows disk path (used by ffmpeg / fs.open)
//   drive_path   = URL-relative path (used by browser preview / drawer)
//
// My ingest-sh19-manual-vgen.ts swapped these. Stitch tried to open
// `/staging/SS-S15-E01-VID-shot-...mp4` → resolves to `C:\staging\...mp4`
// on Windows → ENOENT.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  for (const raw of readFileSync(envPath, 'utf-8').split('\n')) {
    const l = raw.trim(); if (!l || l.startsWith('#')) continue;
    const eq = l.indexOf('='); if (eq <= 0) continue;
    let v = l.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[l.slice(0, eq).trim()] = v;
  }
}
const U = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const K = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const V03_ID = 'ab6cc7e5-f2e8-4630-982f-8524dd107f9c';
const FILENAME = 'SS-S15-E01-VID-shot-ss-s15-e01-a2-sc09-sh19-v03-APPROVED.mp4';

async function main(): Promise<void> {
  const absoluteDiskPath = join(process.cwd(), 'public', 'staging', FILENAME);
  if (!existsSync(absoluteDiskPath)) {
    console.error(`File missing on disk: ${absoluteDiskPath}`);
    process.exit(1);
  }
  const urlPath = `/staging/${FILENAME}`;
  console.log(`Patching SH19 v03 (id=${V03_ID}):`);
  console.log(`  staging_path → ${absoluteDiskPath}`);
  console.log(`  drive_path   → ${urlPath}`);

  const r = await fetch(`${U}/rest/v1/assets?id=eq.${V03_ID}`, {
    method: 'PATCH',
    headers: {
      apikey: K,
      Authorization: `Bearer ${K}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      staging_path: absoluteDiskPath,
      drive_path: urlPath,
    }),
  });
  if (!r.ok) {
    console.error(`PATCH failed: ${r.status} ${await r.text()}`);
    process.exit(1);
  }
  const rows = await r.json() as Array<{ staging_path: string; drive_path: string }>;
  console.log(`\n✅ Patched. Now matches EXEC-STITCH expectation.`);
  console.log(`   staging_path: ${rows[0].staging_path}`);
  console.log(`   drive_path:   ${rows[0].drive_path}`);
  console.log(`\nNext: Director can re-trigger EXEC-STITCH from UI / Polина.`);
  console.log(`      Stitch now resolves the file at the absolute Windows path.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
