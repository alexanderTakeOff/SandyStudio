import { describe, it, expect } from 'vitest';

import { enforceMode } from '@/lib/governance';

describe('enforceMode — Mode 1-3 contract with category map', () => {
  const episode = (mode: number) => ({ id: 'ep-test', governance_mode: mode });

  it('Mode 1 PUBLISH blocks without directorConfirm', () => {
    const decision = enforceMode('PUBLISH', episode(1), {});
    expect(decision.passed).toBe(false);
    expect(decision.code).toBe('no_director_confirm');
    expect(decision.reason).toMatch(/hard limit/i);
    expect(decision.category).toBe('A');
    expect(decision.requiresDirector).toBe(true);
    expect(decision.autoFireAllowed).toBe(false);
  });

  it('Mode 1 PUBLISH passes WITH directorConfirm=true', () => {
    const decision = enforceMode('PUBLISH', episode(1), { directorConfirm: true });
    expect(decision.passed).toBe(true);
    expect(decision.code).toBe('director_confirmed');
  });

  it('Mode 2 PUBLISH blocks without directorConfirm', () => {
    expect(enforceMode('PUBLISH', episode(2)).passed).toBe(false);
  });

  it('Mode 3 PUBLISH blocks without directorConfirm', () => {
    expect(enforceMode('PUBLISH', episode(3)).passed).toBe(false);
  });

  it('Category A actions (LOCK/BUDGET/MODE_CHANGE) require directorConfirm in Modes 1-3', () => {
    for (const mode of [1, 2, 3]) {
      expect(enforceMode('LOCK', episode(mode)).passed).toBe(false);
      expect(enforceMode('BUDGET_OVERRIDE', episode(mode)).passed).toBe(false);
      expect(enforceMode('MODE_CHANGE', episode(mode)).passed).toBe(false);
      expect(enforceMode('LOCK', episode(mode), { directorConfirm: true }).passed).toBe(true);
    }
  });

  it('AGENT_RUN passes through in all modes (Category C — downstream of approval)', () => {
    for (const mode of [1, 2, 3]) {
      const d = enforceMode('AGENT_RUN', episode(mode));
      expect(d.passed).toBe(true);
      expect(d.category).toBe('C');
    }
  });

  it('Category B (REGENERATE_IMAGE) requires directorConfirm in Mode 1 only', () => {
    // Mode 1 — manual confirm required
    expect(enforceMode('REGENERATE_IMAGE', episode(1)).passed).toBe(false);
    expect(enforceMode('REGENERATE_IMAGE', episode(1), { directorConfirm: true }).passed).toBe(true);
    // Mode 2-3 — pipeline auto-fire allowed
    for (const mode of [2, 3]) {
      const d = enforceMode('REGENERATE_IMAGE', episode(mode));
      expect(d.passed).toBe(true);
      expect(d.autoFireAllowed).toBe(true);
      expect(d.code).toBe('category_b_pipeline_auto');
    }
  });

  it('Category C (UPLOAD_ASSET, EDIT_DESCRIPTION) always passes', () => {
    for (const mode of [1, 2, 3]) {
      expect(enforceMode('UPLOAD_ASSET', episode(mode)).passed).toBe(true);
      expect(enforceMode('EDIT_DESCRIPTION', episode(mode)).passed).toBe(true);
    }
  });

  it('directorConfirm=false is treated like missing flag', () => {
    const decision = enforceMode('PUBLISH', episode(1), { directorConfirm: false });
    expect(decision.passed).toBe(false);
  });

  it('decision.modeAtTime echoes the episode mode for audit', () => {
    expect(enforceMode('PUBLISH', episode(1)).modeAtTime).toBe(1);
    expect(enforceMode('AGENT_RUN', episode(3)).modeAtTime).toBe(3);
  });
});
