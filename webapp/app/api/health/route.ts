// ──────────────────────────────────────────────────────────────────────────────
// app/api/health/route.ts
// Liveness probe per webapp.md §2.1. No auth — Tailscale + curl friendly.
// ──────────────────────────────────────────────────────────────────────────────

import { apiOk } from '@/lib/api/response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return apiOk({
    status: 'ok',
    supabase_url_configured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    inngest_signing_key_configured: Boolean(process.env.INNGEST_SIGNING_KEY),
    openai_configured: Boolean(process.env.OPENAI_API_KEY),
    ts: new Date().toISOString(),
  });
}
