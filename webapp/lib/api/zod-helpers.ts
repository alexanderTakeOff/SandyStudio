// ──────────────────────────────────────────────────────────────────────────────
// lib/api/zod-helpers.ts
// Zod parser helpers that throw ValidationError with a friendly message.
//
// Generic parameter is `S extends z.ZodTypeAny` so output type is inferred
// from `z.infer<S>` — this preserves `.default()` unwrapping that the
// narrower `z.ZodType<T>` form loses.
// ──────────────────────────────────────────────────────────────────────────────

import type { z } from 'zod';
import { ValidationError } from './errors';

export async function parseJson<S extends z.ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<z.infer<S>> {
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

export function parseSearchParams<S extends z.ZodTypeAny>(
  url: string,
  schema: S,
): z.infer<S> {
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
