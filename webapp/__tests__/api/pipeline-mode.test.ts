import { describe, it, expect } from 'vitest';

import { readPipelineMode, DEFAULT_PIPELINE_MODE } from '@/lib/api/pipeline-mode';

describe('readPipelineMode (S-reorder)', () => {
  it("returns 'parallel' when metadata.pipeline_mode is 'parallel'", () => {
    expect(readPipelineMode({ pipeline_mode: 'parallel' })).toBe('parallel');
  });

  it("returns 'sequential' when explicitly set", () => {
    expect(readPipelineMode({ pipeline_mode: 'sequential' })).toBe('sequential');
  });

  it('defaults to sequential when the flag is absent', () => {
    expect(readPipelineMode({})).toBe('sequential');
    expect(readPipelineMode(null)).toBe('sequential');
    expect(readPipelineMode(undefined)).toBe('sequential');
    expect(DEFAULT_PIPELINE_MODE).toBe('sequential');
  });

  it('defaults to sequential on garbage input (fail-safe)', () => {
    expect(readPipelineMode({ pipeline_mode: 'wat' })).toBe('sequential');
    expect(readPipelineMode('string')).toBe('sequential');
    expect(readPipelineMode(42)).toBe('sequential');
    expect(readPipelineMode({ pipeline_mode: true })).toBe('sequential');
  });
});
