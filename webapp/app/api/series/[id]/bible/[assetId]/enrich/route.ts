// ──────────────────────────────────────────────────────────────────────────────
// app/api/series/[id]/bible/[assetId]/enrich/route.ts
// Thin redirect wrapper — Bible enrich is now generic at
// /api/assets/[id]/enrich. Kept for back-compat with pre-Slice-A frontend.
// ──────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ id: string; assetId: string }> }) {
  const { assetId } = await ctx.params;
  const url = new URL(req.url);
  const target = `${url.protocol}//${url.host}/api/assets/${assetId}/enrich`;
  const body = await req.text();
  const upstream = await fetch(target, {
    method: 'POST',
    headers: {
      'content-type': req.headers.get('content-type') ?? 'application/json',
      cookie: req.headers.get('cookie') ?? '',
    },
    body: body || '{}',
  });
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}
