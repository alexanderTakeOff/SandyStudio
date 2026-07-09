// Regression lock for the E25 2026-07-09 fix: an empty updateWorkPlan call is a
// GRACEFUL NO-OP, never a thrown error. Before the fix, `parse` threw
// "content is required" on an empty call; the model retried until the 6-round
// backstop escalated to the Director ("Полину дёргают писать в план, а нечего").
import { describe, expect, test } from 'vitest';
import { updateWorkPlan } from '@/lib/concierge/tools/work-plan';
import type { ToolContext } from '@/lib/concierge/tools/types';

const EP = '11111111-1111-4111-8111-111111111111';

// Supabase stub that EXPLODES if touched — proves the no-op path never hits the DB.
const explodingSupabase = new Proxy(
  {},
  { get() { throw new Error('supabase must not be touched on a no-op updateWorkPlan'); } },
) as ToolContext['supabase'];

const CTX = {
  supabase: explodingSupabase,
  threadId: 't1',
  mode: '3',
  episodeId: EP,
  appOrigin: 'http://test',
} as ToolContext;

describe('updateWorkPlan.parse — empty content is not an error', () => {
  test('missing content parses to empty string (does NOT throw)', () => {
    expect(() => updateWorkPlan.parse('{}')).not.toThrow();
    expect(updateWorkPlan.parse('{}').content).toBe('');
  });

  test('whitespace-only content parses without throwing', () => {
    expect(() => updateWorkPlan.parse('{"content":"   "}')).not.toThrow();
  });

  test('real content is preserved', () => {
    const parsed = updateWorkPlan.parse(JSON.stringify({ content: '# plan\n- step' }));
    expect(parsed.content).toBe('# plan\n- step');
  });
});

describe('updateWorkPlan.execute — no-op on empty content', () => {
  test('empty content returns ok no-op and never touches the DB', async () => {
    const res = await updateWorkPlan.execute({ content: '' }, CTX);
    expect(res.ok).toBe(true);
    if (res.ok) expect((res.data as { noop?: boolean }).noop).toBe(true);
  });

  test('whitespace-only content is also a no-op', async () => {
    const res = await updateWorkPlan.execute({ content: '  \n ' }, CTX);
    expect(res.ok).toBe(true);
  });

  test('no episode in focus still fails cleanly (not a throw)', async () => {
    const res = await updateWorkPlan.execute({ content: '' }, { ...CTX, episodeId: null });
    expect(res.ok).toBe(false);
  });
});
