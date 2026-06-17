// Unit tests for the regenerateShot PA tool — 2026-06-17 anchor-mode doctrine
// (orbit ⇒ ref-only). Verifies schema, parse defaults, the two-anchor fail-loud
// guard, and registry integration. The success execute() path posts to a REST
// endpoint + queries supabase and is covered by integration smoke (out of scope
// for the unit suite).

import { describe, expect, test } from 'vitest';
import { regenerateShot } from '@/lib/concierge/tools/vgen-execute';
import type { ToolContext } from '@/lib/concierge/tools/types';

describe('regenerateShot — schema', () => {
  test('declares correct name and required args', () => {
    const fn = regenerateShot.schema.function;
    expect(fn.name).toBe('regenerateShot');
    expect(fn.parameters.required).toEqual(['shotId', 'anchorMode']);
    expect(fn.parameters.properties.shotId).toBeDefined();
    expect(fn.parameters.properties.anchorMode).toBeDefined();
    expect(fn.parameters.properties.endImageAssetId).toBeDefined();
  });

  test('anchorMode enum is ref-only | two-anchor', () => {
    const anchor = regenerateShot.schema.function.parameters.properties
      .anchorMode as { enum?: string[] };
    expect(anchor.enum).toEqual(['ref-only', 'two-anchor']);
  });

  test('is classified as mutating (verbal-approval gated)', () => {
    expect(regenerateShot.mutating).toBe(true);
  });

  test('description distinguishes it from regenerateVideoFromPlan', () => {
    expect(regenerateShot.description).toMatch(/regenerateVideoFromPlan/);
    expect(regenerateShot.description).toMatch(/ref-only/);
  });
});

describe('regenerateShot.parse', () => {
  test('rejects missing shotId', () => {
    expect(() =>
      regenerateShot.parse(JSON.stringify({ anchorMode: 'ref-only' })),
    ).toThrow(/shotId is required/i);
  });

  test('defaults anchorMode to ref-only (the orbit doctrine default)', () => {
    const parsed = regenerateShot.parse(JSON.stringify({ shotId: 'SH07' }));
    expect(parsed.anchorMode).toBe('ref-only');
  });

  test('honours two-anchor + endImageAssetId, trims whitespace', () => {
    const parsed = regenerateShot.parse(
      JSON.stringify({
        shotId: '  SS-S15-E01-A2-SC04-SH02  ',
        anchorMode: 'two-anchor',
        endImageAssetId: '  dd7f01d0-829a-46b5-bcc1-6daaff2cecfb  ',
      }),
    );
    expect(parsed.shotId).toBe('SS-S15-E01-A2-SC04-SH02');
    expect(parsed.anchorMode).toBe('two-anchor');
    expect(parsed.endImageAssetId).toBe('dd7f01d0-829a-46b5-bcc1-6daaff2cecfb');
  });

  test('unknown anchorMode value collapses to ref-only (safe default)', () => {
    const parsed = regenerateShot.parse(
      JSON.stringify({ shotId: 'SH07', anchorMode: 'garbage' }),
    );
    expect(parsed.anchorMode).toBe('ref-only');
  });

  test('blank endImageAssetId → undefined', () => {
    const parsed = regenerateShot.parse(
      JSON.stringify({ shotId: 'SH07', anchorMode: 'two-anchor', endImageAssetId: '   ' }),
    );
    expect(parsed.endImageAssetId).toBeUndefined();
  });
});

describe('regenerateShot.execute — fail-loud guards', () => {
  // Minimal ctx — these guards fire before any supabase/network access.
  const baseCtx = {
    episodeId: 'e34126fb-2a65-4aad-97cf-677858155e42',
    mode: '1',
    recentTurns: [],
    appOrigin: 'http://localhost:3000',
  } as unknown as ToolContext;

  test('two-anchor without an end frame fails loud (no silent degrade)', async () => {
    const res = await regenerateShot.execute(
      { shotId: 'SH02', anchorMode: 'two-anchor' },
      baseCtx,
    );
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.error).toMatch(/end frame|end_image|endImageAssetId/i);
    }
  });

  test('missing episode fails loud', async () => {
    const res = await regenerateShot.execute(
      { shotId: 'SH07', anchorMode: 'ref-only' },
      { mode: '1', recentTurns: [], appOrigin: 'http://localhost:3000' } as unknown as ToolContext,
    );
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.error).toMatch(/episode/i);
    }
  });
});

describe('regenerateShot — registry integration', () => {
  test('is exposed through the central tools registry by name', async () => {
    const { findTool, openaiSchemas } = await import('@/lib/concierge/tools');
    expect(findTool('regenerateShot')).toBeDefined();
    const names = openaiSchemas.map((s) => s.function.name);
    expect(names).toContain('regenerateShot');
  });

  test('is distinct from regenerateVideoFromPlan in the registry', async () => {
    const { findTool } = await import('@/lib/concierge/tools');
    const shot = findTool('regenerateShot');
    const fromPlan = findTool('regenerateVideoFromPlan');
    expect(shot).toBeDefined();
    expect(fromPlan).toBeDefined();
    expect(shot).not.toBe(fromPlan);
  });
});
