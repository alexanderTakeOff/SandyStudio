import { describe, it, expect } from 'vitest';

import { enforceMode } from '@/lib/governance';

describe('enforceMode — Phase 4 contract', () => {
  const episode = (mode: number) => ({ id: 'ep-test', governance_mode: mode });

  it('Mode 4 AUTOTEST passes any action without confirmation', () => {
    expect(enforceMode('PUBLISH', episode(4)).passed).toBe(true);
    expect(enforceMode('LOCK', episode(4)).passed).toBe(true);
    expect(enforceMode('AGENT_RUN', episode(4)).passed).toBe(true);
  });

  it('Mode 1 PUBLISH blocks without directorConfirm', () => {
    const decision = enforceMode('PUBLISH', episode(1), {});
    expect(decision.passed).toBe(false);
    expect(decision.code).toBe('no_director_confirm');
    expect(decision.reason).toMatch(/PUBLISH blocked/);
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

  it('non-PUBLISH actions pass through in Modes 1/2/3 (Phase 4 contract)', () => {
    for (const mode of [1, 2, 3]) {
      expect(enforceMode('AGENT_RUN', episode(mode)).passed).toBe(true);
      expect(enforceMode('LOCK', episode(mode)).passed).toBe(true);
      expect(enforceMode('BUDGET_OVERRIDE', episode(mode)).passed).toBe(true);
      expect(enforceMode('MODE_CHANGE', episode(mode)).passed).toBe(true);
    }
  });

  it('directorConfirm=false is treated like missing flag', () => {
    const decision = enforceMode('PUBLISH', episode(1), { directorConfirm: false });
    expect(decision.passed).toBe(false);
  });
});
