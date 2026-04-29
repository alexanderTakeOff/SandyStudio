// ──────────────────────────────────────────────────────────────────────────────
// app/api/storage/test-write/route.ts
// Run write-test probe on a candidate path WITHOUT persisting.
// Used by the onboarding wizard's "Run write-test" button.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { runWriteTest, isProbablyDriveFolder } from '@/lib/api/storage-probe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TestWriteBody = z.object({
  path: z.string().min(1).max(240),
  kind: z.enum(['project_root', 'media_storage_root']),
});

export const POST = withApiHandler(async (req) => {
  await requireDirector();
  const body = await parseJson(req, TestWriteBody);
  const result = await runWriteTest(body.path);
  return apiOk({
    path: body.path,
    kind: body.kind,
    writable: result.writable,
    error: result.error,
    errorCode: result.errorCode,
    drive_detected: isProbablyDriveFolder(body.path),
  });
});
