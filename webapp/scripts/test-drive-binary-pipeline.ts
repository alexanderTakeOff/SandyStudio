// ──────────────────────────────────────────────────────────────────────────────
// scripts/test-drive-binary-pipeline.ts
// End-to-end proof: gpt-image-1 → persistBinary → local cache + Drive upload.
// Mirrors the production path inside runner.ts EXEC-THUMB.
//
// Run:
//   npm run test-pipeline-drive
//
// Pre-flip: ensures provider_assignments.storage = 'drive_native' before the
// run, then restores whatever it was. ~$0.016 OpenAI call + tiny Drive ops.
// ──────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';
import { generateImageOpenAI } from '../lib/providers/openai-image';
import { persistBinary } from '../lib/persist-binary';
import { invalidateProviderCache } from '../lib/provider-resolver';
import type { Database } from '../lib/supabase/types.gen';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

async function main(): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    console.error('NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required.');
    process.exit(1);
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.error('OPENAI_API_KEY required.');
    process.exit(1);
  }
  if (!process.env.GOOGLE_REFRESH_TOKEN?.trim()) {
    console.error('GOOGLE_REFRESH_TOKEN required (Drive OAuth).');
    process.exit(1);
  }

  const supabase = createClient<Database>(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  // Snapshot current storage assignment so we can restore it.
  const { data: prevRow } = await supabase
    .from('provider_assignments')
    .select('active_provider_id,is_active')
    .eq('contract', 'storage')
    .single();
  const prev = prevRow ?? null;

  console.log(`[test-pipeline] current storage provider: ${prev?.active_provider_id ?? '(none)'}`);

  console.log('[test-pipeline] flipping storage → drive_native…');
  await supabase
    .from('provider_assignments')
    .update({ active_provider_id: 'drive_native', is_active: true } as never)
    .eq('contract', 'storage');
  invalidateProviderCache('storage');

  try {
    console.log('[test-pipeline] generating tiny test image via gpt-image-1 (low quality, ~$0.016)…');
    const real = await generateImageOpenAI({
      prompt: 'A simple comic-style smiley brass robot on plain white background, no text.',
      size: '1024x1024',
      quality: 'low',
    });
    console.log(`  ✓ image: ${real.size_bytes.toLocaleString()} bytes, $${real.cost_usd.toFixed(4)}`);

    console.log('[test-pipeline] persisting via persistBinary (storage=drive_native)…');
    const persisted = await persistBinary({
      base64: real.b64_data,
      ext: 'png',
      driveFilename: `SS-TEST-IMG-pipeline-v01-DRAFT.png`,
      localHint: 'pipeline-test',
      episodeCode: 'SS-TEST',
      supabase,
    });

    console.log('');
    console.log('─── RESULT ───');
    console.log(`  storage provider:  ${persisted.storageProviderId}`);
    console.log(`  local browser:     http://localhost:3000${persisted.browserUrl}`);
    console.log(`  local fs:          ${persisted.absolutePath}`);
    console.log(`  drive_file_id:     ${persisted.driveFileId ?? '(none)'}`);
    console.log(`  drive_web_view:    ${persisted.driveWebViewUrl ?? '(none)'}`);
    console.log(`  drive_upload_failed: ${persisted.driveUploadFailed}`);

    if (!persisted.driveFileId) {
      throw new Error('Drive upload did NOT happen. Check warnings above.');
    }
    console.log('');
    console.log('✅ Drive-backed binary pipeline works end-to-end.');
  } finally {
    if (prev) {
      console.log(`[test-pipeline] restoring storage provider → ${prev.active_provider_id}`);
      await supabase
        .from('provider_assignments')
        .update({ active_provider_id: prev.active_provider_id, is_active: prev.is_active } as never)
        .eq('contract', 'storage');
      invalidateProviderCache('storage');
    }
  }
}

main().catch((err) => {
  console.error(`[test-pipeline] FAILED: ${(err as Error).message}`);
  if ((err as { body?: string | null }).body) {
    console.error(`  response body: ${(err as { body: string }).body}`);
  }
  process.exit(1);
});
