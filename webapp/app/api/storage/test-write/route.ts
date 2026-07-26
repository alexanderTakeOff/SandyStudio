// ──────────────────────────────────────────────────────────────────────────────
// app/api/storage/test-write/route.ts
// Run write-test probe on a candidate media-cache dir WITHOUT persisting.
// Used by the onboarding wizard / Settings "Run write-test" button.
// mkdir -p first (Phase 4e): the cache root is created on demand by writers,
// so demanding a pre-existing folder from the Director was pure friction.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { runWriteTest } from '@/lib/api/storage-probe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TestWriteBody = z.object({
  path: z.string().min(1).max(240),
});

export const POST = withApiHandler(async (req) => {
  await requireDirector();
  const body = await parseJson(req, TestWriteBody);
  const result = await runWriteTest(body.path, { createIfMissing: true });
  return apiOk({
    path: body.path,
    writable: result.writable,
    error: result.error,
    errorCode: result.errorCode,
  });
});
