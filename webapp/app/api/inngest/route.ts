// ──────────────────────────────────────────────────────────────────────────────
// app/api/inngest/route.ts
// Inngest webhook handler. The Inngest dev server (or cloud Inngest) calls this
// route to invoke registered functions.
// Local dev: `npx inngest-cli@latest dev` discovers this endpoint automatically.
// ──────────────────────────────────────────────────────────────────────────────

import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { functions } from '@/inngest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
