// ──────────────────────────────────────────────────────────────────────────────
// scripts/test-drive-provider.ts
// Bypass Inngest. Bypass agents. Just: refresh-token OAuth → Drive API →
// list root → upload tiny test file → list again → optional cleanup.
//
// Run:
//   npm run test-drive
//   npm run test-drive -- --keep   # don't delete the test file at the end
// ──────────────────────────────────────────────────────────────────────────────

import {
  ensureFolder,
  uploadBinary,
  listAssetFolder,
  deleteFile,
} from '../lib/agents/providers/drive';

async function main(): Promise<void> {
  const keep = process.argv.includes('--keep');

  console.log('[test-drive] verifying OAuth env vars…');
  const requiredEnv = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'];
  const missing = requiredEnv.filter((k) => !process.env[k]?.trim());
  if (missing.length > 0) {
    console.error(`Missing env: ${missing.join(', ')}`);
    process.exit(1);
  }
  console.log('  ✓ all OAuth vars present');

  console.log('[test-drive] ensuring "SandyStudio" folder exists…');
  const folder = await ensureFolder('SandyStudio');
  console.log(`  ✓ folder id = ${folder.id}`);
  console.log(`     web view = ${folder.webViewLink ?? '(none)'}`);

  console.log('[test-drive] uploading hello-world.txt to that folder…');
  const stamp = new Date().toISOString();
  const bytes = new TextEncoder().encode(
    `SandyStudio Drive smoke test\nGenerated: ${stamp}\n`,
  );
  const uploaded = await uploadBinary({
    filename: `sandystudio-smoke-${Date.now()}.txt`,
    contentType: 'text/plain',
    bytes,
    parentFolderId: folder.id,
  });
  console.log(`  ✓ uploaded id = ${uploaded.id}`);
  console.log(`     web view = ${uploaded.webViewLink}`);
  console.log(`     size     = ${uploaded.size ?? '(unknown)'} bytes`);

  console.log('[test-drive] listing folder to confirm…');
  const listing = await listAssetFolder(folder.id);
  const found = listing.find((f) => f.id === uploaded.id);
  if (!found) {
    console.error('  ✗ uploaded file did not appear in listing');
    process.exit(2);
  }
  console.log(`  ✓ folder now has ${listing.length} file(s); test file present.`);

  if (keep) {
    console.log('');
    console.log(`Kept. Open in browser: ${uploaded.webViewLink}`);
    return;
  }

  console.log('[test-drive] cleaning up test file…');
  await deleteFile(uploaded.id);
  console.log('  ✓ deleted');

  console.log('');
  console.log('─── ALL DRIVE OPS PASSED ───');
  console.log(`  folder kept: ${folder.webViewLink}`);
  console.log('  re-run with --keep to leave the test file in place.');
}

main().catch((err) => {
  console.error(`[test-drive] FAILED: ${(err as Error).message}`);
  if ((err as { body?: string | null }).body) {
    console.error(`  response body: ${(err as { body: string }).body}`);
  }
  process.exit(1);
});
