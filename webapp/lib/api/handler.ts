// ──────────────────────────────────────────────────────────────────────────────
// lib/api/handler.ts
// Higher-order wrapper for App Router route handlers. Catches ApiError +
// generic Error, maps to the standard envelope with the right status code,
// and prevents leaking stack traces in production.
// ──────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { ApiError } from './errors';
import { apiErr } from './response';

// Generic route ctx — Next.js 15 uses Promise<params>. The wrapper passes
// through whatever shape the framework provides without inspecting it.
type RouteContext = { params: Promise<Record<string, string | string[]>> } | undefined;

type Handler = (req: Request, ctx?: RouteContext) => Promise<NextResponse>;

export function withApiHandler(handler: Handler): Handler {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      return mapError(err);
    }
  };
}

export function mapError(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return apiErr(err.message, err.status, err.code, err.details);
  }
  // Unknown — never leak the message verbatim in production.
  if (process.env.NODE_ENV === 'production') {
    return apiErr('Internal server error', 500, 'internal');
  }
  const message = err instanceof Error ? err.message : 'Unknown error';
  return apiErr(message, 500, 'internal');
}
