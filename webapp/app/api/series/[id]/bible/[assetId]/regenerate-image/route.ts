// ──────────────────────────────────────────────────────────────────────────────
// app/api/series/[id]/bible/[assetId]/regenerate-image/route.ts
// Thin redirect wrapper — Bible regenerate-image is now generic at
// /api/assets/[id]/regenerate-image. Kept here for backward compat with any
// pre-Slice-A frontend that points at this path.
// ──────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ id: string; assetId: string }> }) {
  const { assetId } = await ctx.params;
  // Forward body + headers to the generic endpoint.
  const url = new URL(req.url);
  const target = `${url.protocol}//${url.host}/api/assets/${assetId}/regenerate-image`;
  const body = await req.text();
  const upstream = await fetch(target, {
    method: 'POST',
    headers: {
      'content-type': req.headers.get('content-type') ?? 'application/json',
      // Forward auth cookie so the generic endpoint sees the same session.
      cookie: req.headers.get('cookie') ?? '',
    },
    body,
  });
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}
