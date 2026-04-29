// ──────────────────────────────────────────────────────────────────────────────
// lib/api/zod-helpers.ts
// Zod parser helpers that throw ValidationError with a friendly message.
// ──────────────────────────────────────────────────────────────────────────────

import type { z } from 'zod';
import { ValidationError } from './errors';

export async function parseJson<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ValidationError('Request body is not valid JSON');
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Request body failed validation', result.error.flatten());
  }
  return result.data;
}

export function parseSearchParams<T>(url: string, schema: z.ZodType<T>): T {
  const u = new URL(url);
  const obj: Record<string, string | string[]> = {};
  for (const key of u.searchParams.keys()) {
    const all = u.searchParams.getAll(key);
    obj[key] = all.length > 1 ? all : (all[0] ?? '');
  }
  const result = schema.safeParse(obj);
  if (!result.success) {
    throw new ValidationError('Query parameters failed validation', result.error.flatten());
  }
  return result.data;
}
