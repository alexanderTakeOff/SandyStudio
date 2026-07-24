// ──────────────────────────────────────────────────────────────────────────────
// lib/api/response.ts
// Standard JSON envelope per rules/typescript/patterns.md.
// All API routes return this exact shape so the UI has one parser.
// ──────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';

export interface ApiMeta {
  total?: number;
  page?: number;
  limit?: number;
  cursor?: string | null;
  visual_count?: number;
  visual_categories?: string[];
  /** Skill files present on disk that failed to load (bad frontmatter / status).
   *  Surfaced by /api/skills so a present-but-ignored capability isn't silent. */
  failures?: ReadonlyArray<{ slug: string; filePath: string; reason: string }>;
}

export interface ApiOkResponse<T> {
  success: true;
  data: T;
  meta?: ApiMeta;
}

export interface ApiErrResponse {
  success: false;
  error: string;
  code?: string;
  details?: unknown;
}

export function apiOk<T>(data: T, meta?: ApiMeta, init?: ResponseInit) {
  const body: ApiOkResponse<T> = { success: true, data };
  if (meta) body.meta = meta;
  return NextResponse.json(body, init);
}

export function apiCreated<T>(data: T, meta?: ApiMeta) {
  return apiOk(data, meta, { status: 201 });
}

export function apiErr(message: string, status = 500, code?: string, details?: unknown) {
  const body: ApiErrResponse = { success: false, error: message };
  if (code) body.code = code;
  if (details !== undefined) body.details = details;
  return NextResponse.json(body, { status });
}
