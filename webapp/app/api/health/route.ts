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
    // МЕТКА СБОРКИ — контрольное слово Директора (13.08). «Новый ли код у панели»
    // нельзя спрашивать у ума: он ответит по памяти, а память переживает сборку.
    // Метку проставляет `start-stack.ps1 -Build` из `git rev-parse --short HEAD`
    // В МОМЕНТ сборки, поэтому она не может быть свежее самого билда. Пусто —
    // значит собрано без метки (старый билд или ручной `npm run build`).
    build: process.env.NEXT_PUBLIC_BUILD_SHA ?? 'unknown',
    built_at: process.env.NEXT_PUBLIC_BUILD_AT ?? 'unknown',
    supabase_url_configured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    inngest_signing_key_configured: Boolean(process.env.INNGEST_SIGNING_KEY),
    openai_configured: Boolean(process.env.OPENAI_API_KEY),
    ts: new Date().toISOString(),
  });
}
