// ──────────────────────────────────────────────────────────────────────────────
// __tests__/lib/agents/runners/on-model-detector.test.ts
// On-model detector — the fail-open skip paths (no vision call).
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runOnModelDetector } from '@/lib/agents/runners/on-model-detector';

const baseArgs = {
  candidateImageB64: 'AAAA',
  episodeCode: 'SS-S1-E1',
  shotId: 'SH01',
  model: 'claude-opus-4-8',
};

describe('runOnModelDetector — fail-open skips (never bounce on an outage)', () => {
  let savedKey: string | undefined;
  beforeEach(() => {
    savedKey = process.env.ANTHROPIC_API_KEY;
  });
  afterEach(() => {
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = savedKey;
  });

  it('skips to PASS when ANTHROPIC_API_KEY is absent', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const r = await runOnModelDetector({
      ...baseArgs,
      characterRefs: [{ slug: 'hero', image_b64: 'IMG', description: 'a glass hero' }],
    });
    expect(r.skipped).toBe(true);
    expect(r.silhouette_ok).toBe(true);
    expect(r.transparency_ok).toBe(true);
    expect(r.cost_usd).toBe(0);
  });

  it('skips to PASS when there is no LOCKED character reference image to anchor identity', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const r = await runOnModelDetector({
      ...baseArgs,
      characterRefs: [{ slug: 'hero', image_b64: null, description: 'text only' }],
    });
    expect(r.skipped).toBe(true);
    expect(r.silhouette_ok).toBe(true);
    expect(r.transparency_ok).toBe(true);
  });
});
