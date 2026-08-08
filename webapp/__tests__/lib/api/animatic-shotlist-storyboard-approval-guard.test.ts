// ──────────────────────────────────────────────────────────────────────────────
// Tests for assertStoryboardApprovable — the D76 boundary gate (2026-08-08).
//
// Root cause: SS-S20-E03 ("Зрачок-2") had an APPROVED STB-storyboard written
// as pure craft prose (no fenced ```json shot-list) because the active genre
// skill (storyboarder-cosmic-horror) never taught the storyboarder@v2 contract
// — that contract lived only inside the comedy-genre skill. Timeline silently
// showed "storyboard pending" forever with nothing pointing at the real cause.
// The fix is a boundary gate at the ONE place every writer (human, agent
// runner, or the mind via the tool-bridge) passes through when promoting a
// storyboard to APPROVED/LOCKED — not N genre skills each remembering a
// studio-structural JSON contract.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';

import { assertStoryboardApprovable } from '@/lib/api/animatic-shotlist';

const PROSE_ONLY = `# STORYBOARD v01

## sh01 — THE MAZE (script Scene 1 · ~14s)
Wet fibrous corridors, single warm teal beam.

## sh02 — THE REVEAL (script Scenes 2+3 · ~14s)
One continuous pull-back from iris to colossus.
`;

const VALID_V2 = `# STORYBOARD v01

\`\`\`json
{
  "acts": [
    {
      "shots": [
        { "shot_id": "sh01", "duration_seconds": 14 },
        { "shot_id": "sh02", "duration_seconds": 14 }
      ]
    }
  ]
}
\`\`\`
`;

describe('assertStoryboardApprovable', () => {
  it('throws on APPROVED with prose-only content (no ```json shot-list)', () => {
    expect(() => assertStoryboardApprovable('STB-storyboard', 'APPROVED', PROSE_ONLY)).toThrow(
      /машиночитаемого списка кадров/,
    );
  });

  it('throws on LOCKED with prose-only content', () => {
    expect(() => assertStoryboardApprovable('STB-storyboard', 'LOCKED', PROSE_ONLY)).toThrow();
  });

  it('throws on APPROVED with empty/null content', () => {
    expect(() => assertStoryboardApprovable('STB-storyboard', 'APPROVED', null)).toThrow();
    expect(() => assertStoryboardApprovable('STB-storyboard', 'APPROVED', '')).toThrow();
  });

  it('passes on APPROVED with a valid storyboarder@v2 ```json block', () => {
    expect(() => assertStoryboardApprovable('STB-storyboard', 'APPROVED', VALID_V2)).not.toThrow();
  });

  it('does not gate DRAFT/REVIEW — prose is fine mid-draft', () => {
    expect(() => assertStoryboardApprovable('STB-storyboard', 'DRAFT', PROSE_ONLY)).not.toThrow();
    expect(() => assertStoryboardApprovable('STB-storyboard', 'REVIEW', PROSE_ONLY)).not.toThrow();
  });

  it('does not gate non-STB file types regardless of content', () => {
    expect(() => assertStoryboardApprovable('SCR-script', 'APPROVED', PROSE_ONLY)).not.toThrow();
    expect(() => assertStoryboardApprovable('SPC-brief', 'APPROVED', null)).not.toThrow();
  });

  it('gates any STB-prefixed file_type, not just the exact STB-storyboard slug', () => {
    expect(() => assertStoryboardApprovable('STB-act1', 'APPROVED', PROSE_ONLY)).toThrow();
  });
});

// ── D84: формат shot_id ───────────────────────────────────────────────────────
//
// Наличия списка мало. Timeline связывает кадр с ячейкой ТОЧНЫМ совпадением
// строки shot_id с `metadata.shot_reference.shot_id`, который проставляют
// инструменты через shotIdFor() как `<код эпизода без SS->-SH<nn>`. Живой случай
// SS-S20-E04: ум написал «SH01», инструмент зарегистрировал «S20-E04-SH01» —
// кадр сгенерировался, списал деньги и не показался нигде, а Директор дважды
// спросил «почему не вижу кадра».
const FILENAME = 'SS-S20-E04-STB-storyboard-v01-DRAFT.md';

const SHORT_IDS = `\`\`\`json
{"acts":[{"shots":[{"shot_id":"SH01"},{"shot_id":"SH02"}]}]}
\`\`\``;

const CANONICAL_IDS = `\`\`\`json
{"acts":[{"shots":[{"shot_id":"S20-E04-SH01"},{"shot_id":"S20-E04-SH02"}]}]}
\`\`\``;

describe('assertStoryboardApprovable — формат shot_id (D84)', () => {
  it('отказывает на коротких shot_id и называет ожидаемый формат', () => {
    expect(() =>
      assertStoryboardApprovable('STB-storyboard', 'APPROVED', SHORT_IDS, FILENAME),
    ).toThrow(/S20-E04-SH01/);
  });

  it('перечисляет реально встреченные неверные id, а не только шаблон', () => {
    expect(() =>
      assertStoryboardApprovable('STB-storyboard', 'APPROVED', SHORT_IDS, FILENAME),
    ).toThrow(/«SH01»/);
  });

  it('пропускает канонические shot_id', () => {
    expect(() =>
      assertStoryboardApprovable('STB-storyboard', 'APPROVED', CANONICAL_IDS, FILENAME),
    ).not.toThrow();
  });

  it('ловит id ЧУЖОГО эпизода — самый тихий класс расхождения', () => {
    const otherEpisode = CANONICAL_IDS.replace(/S20-E04/g, 'S20-E03');
    expect(() =>
      assertStoryboardApprovable('STB-storyboard', 'APPROVED', otherEpisode, FILENAME),
    ).toThrow(/S20-E03-SH01/);
  });

  it('без имени файла формат не проверяется, но проверка НАЛИЧИЯ списка остаётся', () => {
    expect(() =>
      assertStoryboardApprovable('STB-storyboard', 'APPROVED', SHORT_IDS),
    ).not.toThrow();
    expect(() =>
      assertStoryboardApprovable('STB-storyboard', 'APPROVED', PROSE_ONLY),
    ).toThrow(/машиночитаемого списка кадров/);
  });

  it('не гейтит формат на DRAFT — черновик волен быть каким угодно', () => {
    expect(() =>
      assertStoryboardApprovable('STB-storyboard', 'DRAFT', SHORT_IDS, FILENAME),
    ).not.toThrow();
  });
});
