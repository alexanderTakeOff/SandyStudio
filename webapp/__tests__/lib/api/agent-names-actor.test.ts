import { describe, it, expect } from 'vitest';
import { actorKind, isDirectorAction } from '@/lib/api/agent-names';

describe('actor classification', () => {
  it('classifies a UUID actor as the human Director', () => {
    expect(actorKind('95c8bf1a-9f4b-43b7-b40a-359e3ac8a5ea')).toBe('director');
    expect(isDirectorAction('95c8bf1a-9f4b-43b7-b40a-359e3ac8a5ea')).toBe(true);
  });
  it('classifies agent codes and machine principals as non-Director', () => {
    expect(actorKind('EXEC-VGEN')).toBe('agent');
    expect(actorKind('exec-dir-ai')).toBe('ai-director');
    expect(actorKind(null)).toBe('system');
    expect(isDirectorAction('EXEC-VGEN')).toBe(false);
    expect(isDirectorAction('exec-dir-ai')).toBe(false);
    expect(isDirectorAction(null)).toBe(false);
  });
});
