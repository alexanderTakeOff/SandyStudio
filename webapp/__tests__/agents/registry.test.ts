import { describe, it, expect } from 'vitest';

import {
  AGENT_REGISTRY,
  ALL_AGENT_IDS,
  agentByCode,
  agentsByCategory,
  displayName,
  displayWithEmoji,
  getAgent,
  inngestAgents,
  resolveModelId,
} from '@/lib/agents/registry';

describe('AGENT_REGISTRY structural integrity', () => {
  it('id field matches the map key for every entry', () => {
    for (const [key, entry] of Object.entries(AGENT_REGISTRY)) {
      expect(entry.id).toBe(key);
    }
  });

  it('each agent has both display_ru and display_en, non-empty', () => {
    for (const entry of Object.values(AGENT_REGISTRY)) {
      expect(entry.display_ru.length).toBeGreaterThan(0);
      expect(entry.display_en.length).toBeGreaterThan(0);
    }
  });

  it('exactly 16 agents have Inngest functions (Sprint «Дизайнер и Аниматор» Day 6-7: +EXEC-VANIM)', () => {
    // Backbone v2 (2026-05-01) added EXEC-EREF (12). Phase A.2 PR β
    // (2026-05-08) adds EXEC-STITCH → 13. Sprint «Дизайнер и Аниматор»
    // (2026-05-18) adds EXEC-EREF-DESIGNER → 14. Day 4 (2026-05-19) adds
    // EXEC-EPREV (Designer's Critic) → 15. Day 6-7 (2026-05-19) adds
    // EXEC-VANIM (Animator) → 16. Day 8 adds EXEC-VPREV → 17 (separate commit).
    const inngestable = inngestAgents();
    expect(inngestable).toHaveLength(16);
  });

  it('every Inngest agent has a prompt_file (no orphaned prompts)', () => {
    for (const entry of inngestAgents()) {
      // EXEC-EDIT, EXEC-VGEN, etc. all have specs.
      expect(entry.prompt_file).not.toBeNull();
    }
  });

  it('next_agent fields point to valid registry ids', () => {
    for (const entry of Object.values(AGENT_REGISTRY)) {
      if (entry.next_agent !== null) {
        expect(AGENT_REGISTRY).toHaveProperty(entry.next_agent);
      }
    }
  });

  it('codes are unique (no duplicate machine slugs)', () => {
    const codes = Object.values(AGENT_REGISTRY).map((e) => e.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('skills arrays are arrays (composability invariant)', () => {
    for (const entry of Object.values(AGENT_REGISTRY)) {
      expect(Array.isArray(entry.skills)).toBe(true);
    }
  });
});

describe('AGENT_REGISTRY helpers', () => {
  it('getAgent throws on unknown id', () => {
    // @ts-expect-error testing runtime guard
    expect(() => getAgent('EXEC-FAKE')).toThrow(/Unknown agent id/);
  });

  it('agentByCode round-trips with id lookup', () => {
    const sw = getAgent('EXEC-SW');
    const found = agentByCode(sw.code);
    expect(found?.id).toBe('EXEC-SW');
  });

  it('displayName returns Russian by default', () => {
    expect(displayName('EXEC-SW')).toBe('Главный сценарист');
  });

  it('displayName returns English when requested', () => {
    expect(displayName('EXEC-SW', 'en')).toBe('Head Screenwriter');
  });

  it('displayWithEmoji prefixes the emoji', () => {
    expect(displayWithEmoji('EXEC-SW')).toMatch(/^.+\sГлавный сценарист$/);
  });

  it('agentsByCategory returns all media agents', () => {
    const media = agentsByCategory('media');
    const ids = media.map((e) => e.id).sort();
    // Phase A.2 PR β (2026-05-08): EXEC-STITCH joins the media category
    // alongside VGEN/MGEN/THUMB.
    expect(ids).toEqual(['EXEC-MGEN', 'EXEC-STITCH', 'EXEC-THUMB', 'EXEC-VGEN']);
  });

  it('resolveModelId maps tiers to concrete models', () => {
    expect(resolveModelId('EXEC-SW')).toBe('claude-sonnet-4-6');
    expect(resolveModelId('EXEC-VGEN')).toBe('claude-haiku-4-5');
    expect(resolveModelId('EXEC-STY')).toBe('claude-opus-4-7');
    expect(resolveModelId('EXEC-ARCH')).toBe('');
  });

  it('ALL_AGENT_IDS contains every registry key', () => {
    expect(new Set(ALL_AGENT_IDS)).toEqual(new Set(Object.keys(AGENT_REGISTRY)));
  });
});
