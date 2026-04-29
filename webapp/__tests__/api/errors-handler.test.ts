// ──────────────────────────────────────────────────────────────────────────────
// __tests__/api/errors-handler.test.ts
// Coverage for ApiError mapping and withApiHandler wrapper.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import {
  ApiError,
  UnauthorizedError,
  ForbiddenError,
  ValidationError,
  NotFoundError,
  ConflictError,
  GovernanceBlockError,
} from '@/lib/api/errors';
import { withApiHandler, mapError } from '@/lib/api/handler';

async function readJson(res: Response) {
  return JSON.parse(await res.text()) as Record<string, unknown>;
}

describe('error subclasses', () => {
  it('UnauthorizedError → 401', () => {
    const e = new UnauthorizedError();
    expect(e.status).toBe(401);
    expect(e.code).toBe('unauthorized');
  });
  it('ValidationError carries details', () => {
    const e = new ValidationError('bad', { foo: 'bar' });
    expect(e.status).toBe(400);
    expect(e.details).toEqual({ foo: 'bar' });
  });
  it('NotFoundError formats message', () => {
    expect(new NotFoundError('Asset').message).toBe('Asset not found');
  });
  it('ForbiddenError, ConflictError, GovernanceBlockError map correctly', () => {
    expect(new ForbiddenError().status).toBe(403);
    expect(new ConflictError('x').status).toBe(409);
    expect(new GovernanceBlockError('block').code).toBe('governance_block');
  });
});

describe('mapError', () => {
  it('maps ApiError to envelope with correct status', async () => {
    const r = mapError(new NotFoundError('Asset'));
    expect(r.status).toBe(404);
    expect(await readJson(r)).toMatchObject({ success: false, code: 'not_found' });
  });
  it('hides internal error message in production', async () => {
    const prev = process.env.NODE_ENV;
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', configurable: true });
    try {
      const r = mapError(new Error('secret stack'));
      const body = await readJson(r);
      expect(body.error).toBe('Internal server error');
    } finally {
      Object.defineProperty(process.env, 'NODE_ENV', { value: prev, configurable: true });
    }
  });
});

describe('withApiHandler', () => {
  it('passes through happy path', async () => {
    const handler = withApiHandler(async () =>
      new Response(JSON.stringify({ success: true, data: 'ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }) as never,
    );
    const r = await handler(new Request('http://x'));
    expect(r.status).toBe(200);
  });
  it('catches thrown ApiError', async () => {
    const handler = withApiHandler(async () => {
      throw new ValidationError('nope');
    });
    const r = await handler(new Request('http://x'));
    expect(r.status).toBe(400);
    expect((await readJson(r)).error).toBe('nope');
  });
  it('catches generic Error', async () => {
    const handler = withApiHandler(async () => {
      throw new Error('boom');
    });
    const r = await handler(new Request('http://x'));
    expect(r.status).toBe(500);
  });

  it('ApiError exposes details when provided', () => {
    const e = new ApiError(418, 'internal', 'teapot', { kind: 'tea' });
    expect(e.details).toEqual({ kind: 'tea' });
  });
});
