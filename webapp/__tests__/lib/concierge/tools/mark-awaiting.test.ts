// Unit tests for markAwaitingDirector — TD-25 P4 / Step 3 of the 2026-05-22
// Supabase recovery sprint. Replaces the regex-based await-detector with an
// intentional tool Polina calls explicitly.

import { describe, expect, test } from 'vitest';
import { markAwaitingDirector } from '@/lib/concierge/tools/mark-awaiting';
import type { ToolContext } from '@/lib/concierge/tools/types';

const STUB_CTX = {
  supabase: {} as ToolContext['supabase'],
  threadId: 't1',
  mode: '2.5',
  appOrigin: 'http://test',
} as ToolContext;

describe('markAwaitingDirector — schema and registration', () => {
  test('schema declares question as required, deadline_sec as optional number', () => {
    expect(markAwaitingDirector.schema.function.name).toBe('markAwaitingDirector');
    const params = markAwaitingDirector.schema.function.parameters;
    expect(params.required).toEqual(['question']);
    expect(params.properties.question).toBeDefined();
    expect(params.properties.deadline_sec).toBeDefined();
    expect(params.properties.choices).toBeDefined();
  });

  test('not classified as mutating (no verbal-approval gate)', () => {
    expect(markAwaitingDirector.mutating).toBe(false);
  });
});

describe('markAwaitingDirector.parse', () => {
  test('rejects missing question', () => {
    expect(() => markAwaitingDirector.parse('{}')).toThrow(/question is required/i);
  });

  test('rejects empty / whitespace-only question', () => {
    expect(() => markAwaitingDirector.parse('{"question":""}')).toThrow();
    expect(() => markAwaitingDirector.parse('{"question":"   "}')).toThrow();
  });

  test('rejects question exceeding 200 chars', () => {
    const long = 'q'.repeat(201);
    expect(() => markAwaitingDirector.parse(JSON.stringify({ question: long }))).toThrow(
      /exceeds 200 chars/i,
    );
  });

  test('accepts a 200-char question (boundary)', () => {
    const exact = 'q'.repeat(200);
    const parsed = markAwaitingDirector.parse(JSON.stringify({ question: exact }));
    expect(parsed.question).toHaveLength(200);
  });

  test('defaults deadline_sec to 90 when omitted', () => {
    const parsed = markAwaitingDirector.parse(JSON.stringify({ question: 'ok?' }));
    expect(parsed.deadline_sec).toBe(90);
  });

  test('clamps deadline_sec below 30 → 30', () => {
    const parsed = markAwaitingDirector.parse(
      JSON.stringify({ question: 'ok?', deadline_sec: 5 }),
    );
    expect(parsed.deadline_sec).toBe(30);
  });

  test('clamps deadline_sec above 3600 → 3600', () => {
    const parsed = markAwaitingDirector.parse(
      JSON.stringify({ question: 'ok?', deadline_sec: 99999 }),
    );
    expect(parsed.deadline_sec).toBe(3600);
  });

  test('accepts valid choices array', () => {
    const parsed = markAwaitingDirector.parse(
      JSON.stringify({
        question: 'go?',
        choices: [
          { id: 'q5y', label: 'Да' },
          { id: 'q5n', label: 'Нет' },
        ],
      }),
    );
    expect(parsed.choices).toEqual([
      { id: 'q5y', label: 'Да' },
      { id: 'q5n', label: 'Нет' },
    ]);
  });

  test('drops malformed choice entries silently', () => {
    const parsed = markAwaitingDirector.parse(
      JSON.stringify({
        question: 'go?',
        choices: [
          { id: 'q5y', label: 'Да' },
          { id: 'q5n' }, // missing label
          { label: 'orphan' }, // missing id
          { id: '', label: 'empty id' }, // blank id
          'string',
          null,
        ],
      }),
    );
    expect(parsed.choices).toEqual([{ id: 'q5y', label: 'Да' }]);
  });

  test('caps choices at 4 entries', () => {
    const parsed = markAwaitingDirector.parse(
      JSON.stringify({
        question: 'go?',
        choices: Array.from({ length: 8 }, (_, i) => ({
          id: `q${i}`,
          label: `${i}`,
        })),
      }),
    );
    expect(parsed.choices).toHaveLength(4);
  });

  test('treats malformed JSON as empty object → throws on missing question', () => {
    expect(() => markAwaitingDirector.parse('not json')).toThrow();
  });
});

describe('markAwaitingDirector.execute', () => {
  test('returns ok ToolResult with metadataPatch containing awaiting_director_input', async () => {
    const result = await markAwaitingDirector.execute(
      { question: 'one-glance test', deadline_sec: 90 },
      STUB_CTX,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.metadataPatch).toBeDefined();
    const awaiting = result.metadataPatch!.awaiting_director_input as
      | Record<string, unknown>
      | undefined;
    expect(awaiting).toBeDefined();
    expect(awaiting!.question).toBe('one-glance test');
    expect(awaiting!.deadline_sec).toBe(90);
    expect(awaiting!.source).toBe('markAwaitingDirector');
    expect(typeof awaiting!.marked_at).toBe('string');
  });

  test('omits choices key when no choices supplied', async () => {
    const result = await markAwaitingDirector.execute(
      { question: 'no choices', deadline_sec: 60 },
      STUB_CTX,
    );
    if (!result.ok) throw new Error('unreachable');
    const awaiting = result.metadataPatch!.awaiting_director_input as Record<
      string,
      unknown
    >;
    expect('choices' in awaiting).toBe(false);
  });

  test('includes choices in metadataPatch when supplied', async () => {
    const result = await markAwaitingDirector.execute(
      {
        question: 'pick',
        choices: [
          { id: 'q1a', label: 'A' },
          { id: 'q1b', label: 'B' },
        ],
        deadline_sec: 120,
      },
      STUB_CTX,
    );
    if (!result.ok) throw new Error('unreachable');
    const awaiting = result.metadataPatch!.awaiting_director_input as Record<
      string,
      unknown
    >;
    expect(awaiting.choices).toEqual([
      { id: 'q1a', label: 'A' },
      { id: 'q1b', label: 'B' },
    ]);
  });

  test('returns a human-readable summary', async () => {
    const result = await markAwaitingDirector.execute(
      { question: 'go?', deadline_sec: 90 },
      STUB_CTX,
    );
    if (!result.ok) throw new Error('unreachable');
    expect(result.summary).toBeDefined();
    expect(result.summary).toContain('awaiting Director');
    expect(result.summary).toContain('90s');
  });

  test('rejects empty question even via direct execute call (belt-and-braces)', async () => {
    const result = await markAwaitingDirector.execute(
      { question: '', deadline_sec: 90 },
      STUB_CTX,
    );
    expect(result.ok).toBe(false);
  });
});

describe('markAwaitingDirector — registry integration', () => {
  test('is exposed through the central tools registry by name', async () => {
    const { findTool, openaiSchemas } = await import('@/lib/concierge/tools');
    expect(findTool('markAwaitingDirector')).toBeDefined();
    const schemaNames = openaiSchemas.map((s) => s.function.name);
    expect(schemaNames).toContain('markAwaitingDirector');
  });
});
