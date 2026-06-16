// Unit tests for the Shot Plan contract parser + round-trip serializer.
// Guards the Director-facing contract page (ShotPlanContract.tsx) and the
// runner's plan-driven branch reading the SAME fields.

import { describe, it, expect } from 'vitest';
import {
  parseShotPlanContract,
  serializeShotPlanContract,
} from '@/lib/api/shot-plan-contract';

const PLAN = `# Shot Plan — SS-S15-E10-A1-SC01-SH02

Some prose the Animator wrote about the beat.

\`\`\`json
{
  "prompt": "Sandy points at the call button, deadpan.",
  "provider": { "id": "seedance-with-end-image" },
  "quality_tier": "standard",
  "resolution": "720p",
  "seed_strategy": { "seed": 4242 },
  "end_image": { "asset_id": "end-asset-1" },
  "start_anchor": { "asset_id": "start-asset-1" },
  "end_anchor": { "asset_id": "end-anchor-1" },
  "duration_seconds": 2
}
\`\`\`

Trailing notes after the block.
`;

describe('parseShotPlanContract', () => {
  it('extracts every structured field from the last json block', () => {
    const c = parseShotPlanContract(PLAN);
    expect(c.error).toBeNull();
    expect(c.prompt).toBe('Sandy points at the call button, deadpan.');
    expect(c.providerId).toBe('seedance-with-end-image');
    expect(c.qualityTier).toBe('standard');
    expect(c.resolution).toBe('720p');
    expect(c.seed).toBe(4242);
    expect(c.endImageAssetId).toBe('end-asset-1');
    expect(c.startAnchorAssetId).toBe('start-asset-1');
    expect(c.endAnchorAssetId).toBe('end-anchor-1');
    expect(c.durationSeconds).toBe(2);
  });

  it('reports a clear error when no json block exists', () => {
    const c = parseShotPlanContract('# Just prose, no fence');
    expect(c.prompt).toBeNull();
    expect(c.error).toMatch(/no fenced/i);
  });

  it('reports a clear error on malformed JSON', () => {
    const c = parseShotPlanContract('```json\n{ not valid }\n```');
    expect(c.error).toMatch(/valid JSON/i);
  });

  it('leaves optional fields null when absent', () => {
    const c = parseShotPlanContract('```json\n{ "prompt": "hi" }\n```');
    expect(c.prompt).toBe('hi');
    expect(c.providerId).toBeNull();
    expect(c.resolution).toBeNull();
    expect(c.seed).toBeNull();
  });
});

describe('serializeShotPlanContract — round-trip', () => {
  it('updates prompt while preserving prose outside the block', () => {
    const next = serializeShotPlanContract(PLAN, { prompt: 'New prompt text.' });
    expect(next).toContain('Some prose the Animator wrote');
    expect(next).toContain('Trailing notes after the block.');
    const re = parseShotPlanContract(next);
    expect(re.prompt).toBe('New prompt text.');
    // Untouched fields survive.
    expect(re.providerId).toBe('seedance-with-end-image');
    expect(re.seed).toBe(4242);
    expect(re.durationSeconds).toBe(2);
  });

  it('updates provider id without dropping sibling provider keys', () => {
    const withExtra = PLAN.replace(
      '{ "id": "seedance-with-end-image" }',
      '{ "id": "seedance-with-end-image", "note": "keep me" }',
    );
    const next = serializeShotPlanContract(withExtra, { providerId: 'veo-standard' });
    expect(parseShotPlanContract(next).providerId).toBe('veo-standard');
    expect(next).toContain('keep me');
  });

  it('clears the seed when patched with null', () => {
    const next = serializeShotPlanContract(PLAN, { seed: null });
    expect(parseShotPlanContract(next).seed).toBeNull();
  });

  it('a no-op patch round-trips to an equivalent contract', () => {
    const next = serializeShotPlanContract(PLAN, {});
    const re = parseShotPlanContract(next);
    const orig = parseShotPlanContract(PLAN);
    expect(re).toEqual(orig);
  });

  it('throws when there is no json block to update', () => {
    expect(() => serializeShotPlanContract('no block', { prompt: 'x' })).toThrow(/no fenced/i);
  });
});
