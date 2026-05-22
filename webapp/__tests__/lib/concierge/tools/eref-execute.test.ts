// Unit tests for regenerateImageFromPlan PA tool — 2026-05-22 plan→image
// manual path gap fix. Verifies schema declaration, parse validation, and
// registry integration. The execute() path posts to a REST endpoint and is
// covered by integration tests (would require a Next.js route harness here,
// out of scope for unit suite).

import { describe, expect, test } from 'vitest';
import { regenerateImageFromPlan } from '@/lib/concierge/tools/eref-execute';

describe('regenerateImageFromPlan — schema', () => {
  test('declares correct name and required args', () => {
    const fn = regenerateImageFromPlan.schema.function;
    expect(fn.name).toBe('regenerateImageFromPlan');
    expect(fn.parameters.required).toEqual(['shotId', 'planAssetId']);
    expect(fn.parameters.properties.shotId).toBeDefined();
    expect(fn.parameters.properties.planAssetId).toBeDefined();
    expect(fn.parameters.properties.episodeId).toBeDefined();
    expect(fn.parameters.properties.reason).toBeDefined();
  });

  test('is classified as mutating (verbal-approval gated)', () => {
    expect(regenerateImageFromPlan.mutating).toBe(true);
  });

  test('description distinguishes this tool from triggerAgent', () => {
    expect(regenerateImageFromPlan.description).toMatch(/triggerAgent/);
    expect(regenerateImageFromPlan.description).toMatch(/regenerateRefPlan/);
    expect(regenerateImageFromPlan.description).toMatch(/APPROVED/);
  });
});

describe('regenerateImageFromPlan.parse', () => {
  test('rejects missing shotId', () => {
    expect(() =>
      regenerateImageFromPlan.parse(
        JSON.stringify({ planAssetId: '00000000-0000-0000-0000-000000000001' }),
      ),
    ).toThrow(/shotId is required/i);
  });

  test('rejects missing planAssetId', () => {
    expect(() =>
      regenerateImageFromPlan.parse(JSON.stringify({ shotId: 'SH08' })),
    ).toThrow(/planAssetId is required/i);
  });

  test('rejects empty / whitespace shotId', () => {
    expect(() =>
      regenerateImageFromPlan.parse(
        JSON.stringify({ shotId: '   ', planAssetId: 'p' }),
      ),
    ).toThrow();
  });

  test('rejects empty planAssetId', () => {
    expect(() =>
      regenerateImageFromPlan.parse(
        JSON.stringify({ shotId: 'SH08', planAssetId: '' }),
      ),
    ).toThrow();
  });

  test('accepts valid args and trims whitespace', () => {
    const parsed = regenerateImageFromPlan.parse(
      JSON.stringify({
        shotId: '  SS-S15-E01-A2-SC04-SH08  ',
        planAssetId: '  dd7f01d0-829a-46b5-bcc1-6daaff2cecfb  ',
        reason: 'execute the corrected plan',
      }),
    );
    expect(parsed.shotId).toBe('SS-S15-E01-A2-SC04-SH08');
    expect(parsed.planAssetId).toBe('dd7f01d0-829a-46b5-bcc1-6daaff2cecfb');
    expect(parsed.reason).toBe('execute the corrected plan');
  });

  test('optional episodeId and reason omitted → undefined', () => {
    const parsed = regenerateImageFromPlan.parse(
      JSON.stringify({ shotId: 'SH08', planAssetId: 'p' }),
    );
    expect(parsed.episodeId).toBeUndefined();
    expect(parsed.reason).toBeUndefined();
  });

  test('malformed JSON → throws on missing required field', () => {
    expect(() => regenerateImageFromPlan.parse('not json')).toThrow();
  });
});

describe('regenerateImageFromPlan — registry integration', () => {
  test('is exposed through the central tools registry by name', async () => {
    const { findTool, openaiSchemas } = await import('@/lib/concierge/tools');
    expect(findTool('regenerateImageFromPlan')).toBeDefined();
    const names = openaiSchemas.map((s) => s.function.name);
    expect(names).toContain('regenerateImageFromPlan');
  });

  test('is distinct from triggerAgent and regenerateRefPlan in the registry', async () => {
    const { findTool } = await import('@/lib/concierge/tools');
    const exec = findTool('regenerateImageFromPlan');
    const trigger = findTool('triggerAgent');
    const regenPlan = findTool('regenerateRefPlan');
    expect(exec).toBeDefined();
    expect(trigger).toBeDefined();
    expect(regenPlan).toBeDefined();
    // Three different tools, three different functions.
    expect(exec).not.toBe(trigger);
    expect(exec).not.toBe(regenPlan);
  });
});
