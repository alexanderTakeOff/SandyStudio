// ──────────────────────────────────────────────────────────────────────────────
// __tests__/api/response.test.ts
// Coverage for the API envelope helpers.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import { apiOk, apiCreated, apiErr } from '@/lib/api/response';

async function readJson(res: Response) {
  return JSON.parse(await res.text()) as Record<string, unknown>;
}

describe('apiOk', () => {
  it('wraps data with success: true', async () => {
    const r = apiOk({ x: 1 });
    expect(r.status).toBe(200);
    expect(await readJson(r)).toEqual({ success: true, data: { x: 1 } });
  });
  it('attaches meta if provided', async () => {
    const r = apiOk([], { total: 0 });
    expect((await readJson(r)).meta).toEqual({ total: 0 });
  });
});

describe('apiCreated', () => {
  it('returns 201', () => {
    expect(apiCreated({ id: 'a' }).status).toBe(201);
  });
});

describe('apiErr', () => {
  it('builds error envelope with code/details', async () => {
    const r = apiErr('boom', 422, 'validation', { field: 'x' });
    expect(r.status).toBe(422);
    expect(await readJson(r)).toEqual({
      success: false,
      error: 'boom',
      code: 'validation',
      details: { field: 'x' },
    });
  });
});
