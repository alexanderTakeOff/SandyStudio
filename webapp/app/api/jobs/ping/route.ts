// ──────────────────────────────────────────────────────────────────────────────
// app/api/jobs/ping/route.ts
// POST trigger that fires the `sandystudio/ping` event into Inngest.
// Used by the Jobs page "Send ping" button to smoke-test the worker.
// ──────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { inngest } from '@/lib/inngest/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let note: string | undefined;
  try {
    const body = (await req.json()) as { note?: string };
    note = body.note;
  } catch {
    // empty body is fine
  }

  const { ids } = await inngest.send({
    name: 'sandystudio/ping',
    data: { note: note ?? 'manual ping from webapp' },
  });

  return NextResponse.json({ ok: true, eventIds: ids });
}
