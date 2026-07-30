// D8 (2026-07-30) — the canon writer learns to REVISE.
//
// Before this it could only compose from scratch: `enrichBible` took one
// argument, the seed came from the `description` column, and the writer never
// read its own article. So every Director correction was applied by a human
// rewriting the whole entry — which is exactly the «Polina is an administrator,
// not an author» defect, one level up.
//
// The shape pinned here is the one that saved the shot plan from being replaced
// by a critic's retelling: BASE is untouchable, notes are a DELTA on top, and
// the delta goes LAST where a prompt dilutes it least.

import { describe, it, expect } from 'vitest';
import { buildDescriptionPrompt } from '@/lib/agents/runners/bible-author';

const BASE_ARGS = {
  seriesTitle: 'Deep',
  section: 'location' as const,
  slug: 'bathyscaphe_interior',
  seedDescription: 'A one-line summary left over from the previous pass.',
  generalIdea: 'Abyssal survey series.',
  styleGuide: 'Photoreal, darkness as material.',
  canonDigest: '### character_bathyscaphe_turnaround\nPale grey-white hull.',
};

const EXISTING_ARTICLE = '# BATHYSCAPHE INTERIOR\n\n## Identity\nA single-occupant cabin.';
const CORRECTIONS = 'Black beyond the glass. Three times fewer instruments.';

describe('buildDescriptionPrompt — revision mode', () => {
  it('is byte-for-byte unchanged when no corrections are given', () => {
    const plain = buildDescriptionPrompt(BASE_ARGS);
    const explicitNulls = buildDescriptionPrompt({ ...BASE_ARGS, notes: null, baseContent: null });

    expect(explicitNulls).toEqual(plain);
    expect(plain.systemPrompt).not.toContain('REVISION');
    expect(plain.userMessage).toContain('Write the canonical Bible entry');
    expect(plain.userMessage).not.toContain('## BASE');
  });

  it('needs BOTH the base and the corrections — half a revision is no revision', () => {
    const plain = buildDescriptionPrompt(BASE_ARGS);

    // Corrections with nothing to revise, and a base nobody asked to change.
    expect(buildDescriptionPrompt({ ...BASE_ARGS, notes: CORRECTIONS })).toEqual(plain);
    expect(buildDescriptionPrompt({ ...BASE_ARGS, baseContent: EXISTING_ARTICLE })).toEqual(plain);
  });

  it('carries the base and the corrections, corrections last', () => {
    const { systemPrompt, userMessage } = buildDescriptionPrompt({
      ...BASE_ARGS,
      baseContent: EXISTING_ARTICLE,
      notes: CORRECTIONS,
    });

    expect(systemPrompt).toContain('REVISION.');
    expect(systemPrompt).toContain('Reproduce it IN FULL');
    expect(userMessage).toContain('Revise the canonical Bible entry');
    expect(userMessage).toContain(EXISTING_ARTICLE);
    expect(userMessage).toContain(CORRECTIONS);
    expect(userMessage.indexOf(CORRECTIONS)).toBeGreaterThan(userMessage.indexOf(EXISTING_ARTICLE));
  });

  it('drops the stale seed on a revision — it was derived from the article being revised', () => {
    const { userMessage } = buildDescriptionPrompt({
      ...BASE_ARGS,
      baseContent: EXISTING_ARTICLE,
      notes: CORRECTIONS,
    });

    expect(userMessage).not.toContain(BASE_ARGS.seedDescription);
    // Series context the writer must still obey is untouched.
    expect(userMessage).toContain('Abyssal survey series.');
    expect(userMessage).toContain('character_bathyscaphe_turnaround');
  });
});
