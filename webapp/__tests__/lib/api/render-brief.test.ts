// The parser that splits a Bible entry's two readers apart. It had no test
// coverage of any kind before 2026-07-30 — nor did any of the three image paths
// it feeds — so these cases exist mainly to pin the ONE property everything
// else leans on: an entry without a RENDER block must parse to null, because
// that null is what makes every pre-existing SS-S15 entry keep its old
// behaviour byte for byte.
import { describe, expect, test } from 'vitest';
import { parseRenderBrief } from '@/lib/api/series-bible';

const LEGACY_ENTRY = `# SANDY CHRONICLES S15 — OBJECT BIBLE
## Prop: LEASH

### 1. Identity
The Leash is a recurring utility prop.

### 2. Form & materials
Flat woven strap, brass clip.`;

const NEW_ENTRY = `# SS-S20 — LOCATION BIBLE
## The bathyscaphe interior

**Canon ID:** S20-LOC-001
Production note: a panel parked in a corner vanishes in the vertical crop.

## RENDER
Interior of a hemispherical blister canopy, camera looking forward. Glass fills
the frame; a low arc crosses the bottom with a keyboard and joystick at its centre.
Refs: bathyscaphe_turnaround, s20_style_canon_v1

## NEGATIVE
- porthole rim
- rust brown
- text or signage`;

describe('parseRenderBrief', () => {
  test('returns null for an entry with no RENDER section, so callers keep their fallback', () => {
    expect(parseRenderBrief(LEGACY_ENTRY)).toBeNull();
  });

  test('returns null for empty or missing content', () => {
    expect(parseRenderBrief('')).toBeNull();
    expect(parseRenderBrief(null)).toBeNull();
    expect(parseRenderBrief(undefined)).toBeNull();
  });

  test('extracts only the RENDER body — production reasoning above it stays out of the prompt', () => {
    const brief = parseRenderBrief(NEW_ENTRY);
    expect(brief).not.toBeNull();
    expect(brief!.render).toContain('hemispherical blister canopy');
    expect(brief!.render).not.toContain('Canon ID');
    expect(brief!.render).not.toContain('vertical crop');
  });

  test('the Refs line is metadata, not something to draw', () => {
    const brief = parseRenderBrief(NEW_ENTRY)!;
    expect(brief.refSlugs).toEqual(['bathyscaphe_turnaround', 's20_style_canon_v1']);
    expect(brief.render).not.toContain('Refs:');
  });

  test('negative terms come out as a list, never as prose in the positive prompt', () => {
    const brief = parseRenderBrief(NEW_ENTRY)!;
    expect(brief.negative).toEqual(['porthole rim', 'rust brown', 'text or signage']);
    expect(brief.render).not.toContain('porthole rim');
  });

  test('a RENDER block without a NEGATIVE section yields no negatives, not a crash', () => {
    const brief = parseRenderBrief('## RENDER\nA single faceted tooth in a raking beam.')!;
    expect(brief.negative).toEqual([]);
    expect(brief.refSlugs).toEqual([]);
  });

  test('a single-line NEGATIVE written with separators still splits into terms', () => {
    const brief = parseRenderBrief(
      '## RENDER\nA tooth.\n\n## NEGATIVE\nsmooth cone; needle; cartoon eyes',
    )!;
    expect(brief.negative).toEqual(['smooth cone', 'needle', 'cartoon eyes']);
  });

  test('a RENDER heading whose body is only a Refs line is not a usable brief', () => {
    // Otherwise the assembler would send an empty positive prompt.
    expect(parseRenderBrief('## RENDER\nRefs: hero')).toBeNull();
  });

  test('headings must be exact — a decorated heading does not accidentally match', () => {
    expect(parseRenderBrief('## RENDER NOTES\nsomething')).toBeNull();
  });
});
