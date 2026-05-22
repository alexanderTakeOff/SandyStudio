// Unit tests for buildSystemPrompt blocks.
// Spot-checks for guarantees that downstream code relies on. Not a full
// snapshot — block content is allowed to evolve. TD-25 P1 — 2026-05-21.

import { describe, expect, test } from 'vitest';

import { buildSystemPrompt } from '@/lib/concierge/system-prompt-builder';
import type { PromptContext } from '@/lib/concierge/system-prompt-builder';
import type { ConciergeTurnRow } from '@/lib/concierge/types';

const baseCtx = (overrides: Partial<PromptContext> = {}): PromptContext => ({
  today: '2026-05-21',
  mode: '2.5',
  ...overrides,
});

const pipelineEventTurn = (overrides: Partial<ConciergeTurnRow> = {}): ConciergeTurnRow => ({
  id: 'turn-1',
  thread_id: 'thread-1',
  role: 'system',
  event_type: 'message',
  content:
    '[ambient pipeline event · agent_completed] Reference Designer completed — EXEC-EREF-DESIGNER: Author Reference Plan (actor=EXEC-EREF-DESIGNER)',
  metadata: {
    kind: 'pipeline_event',
    event_type: 'agent_completed',
    actor: 'EXEC-EREF-DESIGNER',
    asset_id: '1177690c-c428-4eab-bf7b-5746ac6c1e50',
    episode_id: 'f019c29f-5e1e-4964-b62b-6c59fc3aa966',
    severity: 'info',
  },
  token_count: null,
  created_at: new Date(Date.now() - 5000).toISOString(),
  ...overrides,
});

describe('buildSystemPrompt — OPEN_LOOP_AWARENESS block (TD-25 P1)', () => {
  test('renders the open-loop awareness block on every Director-typed turn', () => {
    const out = buildSystemPrompt(baseCtx());
    expect(out).toContain('OPEN_LOOP_AWARENESS');
    expect(out).toContain('Never silently wait');
    expect(out).toContain('q-format');
  });

  test('renders the open-loop awareness block on auto_react turns too', () => {
    const out = buildSystemPrompt(baseCtx({ autoReact: true }));
    expect(out).toContain('OPEN_LOOP_AWARENESS');
    // Both blocks must coexist — auto-react guidance does not replace
    // open-loop awareness.
    expect(out).toContain('AUTO_REACT_GUIDANCE');
  });

  test('teaches atomic-directive scope (no requestRevision/wait split)', () => {
    const out = buildSystemPrompt(baseCtx());
    expect(out.toLowerCase()).toContain('atomic');
    expect(out).toContain('requestRevision');
  });

  test('teaches watchdog mindset for prior "если X не сработает" promises', () => {
    const out = buildSystemPrompt(baseCtx());
    expect(out.toLowerCase()).toContain('watchdog');
  });
});

describe('buildSystemPrompt — block ordering and presence', () => {
  test('OPEN_LOOP_AWARENESS comes after AUTO_REACT_GUIDANCE on auto-react turns', () => {
    const out = buildSystemPrompt(baseCtx({ autoReact: true }));
    // Use the block header (with brackets) so this assertion isn't tripped
    // by cross-reference mentions of the name inside other blocks (TD-34
    // added a cross-ref from OPEN_LOOP_AWARENESS body to AUTO_REACT_GUIDANCE).
    const autoIdx = out.indexOf('[AUTO_REACT_GUIDANCE]');
    const openIdx = out.indexOf('[OPEN_LOOP_AWARENESS]');
    expect(autoIdx).toBeGreaterThanOrEqual(0);
    expect(openIdx).toBeGreaterThan(autoIdx);
  });

  test('does not render AUTO_REACT_GUIDANCE block on Director-typed turns', () => {
    const out = buildSystemPrompt(baseCtx());
    // Block header check — substring mentions in OPEN_LOOP_AWARENESS body
    // are intentional cross-references (TD-34) and must not trip this test.
    expect(out).not.toContain('[AUTO_REACT_GUIDANCE]');
  });
});

describe('buildSystemPrompt — PIPELINE_EVENTS_SINCE_LAST_REPLY refs (2026-05-21 read-gap fix)', () => {
  test('emits refs: line with asset_id and actor when pipeline_event metadata present', () => {
    const out = buildSystemPrompt(
      baseCtx({ recentTurns: [pipelineEventTurn()] }),
    );
    expect(out).toContain('PIPELINE_EVENTS_SINCE_LAST_REPLY');
    expect(out).toContain('refs:');
    expect(out).toContain('asset_id=1177690c-c428-4eab-bf7b-5746ac6c1e50');
    expect(out).toContain('actor=EXEC-EREF-DESIGNER');
    expect(out).toContain('event_type=agent_completed');
    expect(out).toContain('episode_id=f019c29f-5e1e-4964-b62b-6c59fc3aa966');
  });

  test('omits refs: bullet line when metadata has no identifying fields', () => {
    const bare = pipelineEventTurn({
      metadata: { kind: 'pipeline_event', severity: 'info' },
    });
    const out = buildSystemPrompt(baseCtx({ recentTurns: [bare] }));
    expect(out).toContain('PIPELINE_EVENTS_SINCE_LAST_REPLY');
    // Bullet line for the event itself must still render…
    expect(out).toContain('Reference Designer completed');
    // …but no indented refs: bullet under it when there is nothing structured.
    // (The block's header text mentions "refs:" once for documentation — that
    // is allowed; what we forbid here is the per-event "    refs: ..." line.)
    expect(out).not.toMatch(/^\s{4}refs:/m);
  });
});

describe('buildSystemPrompt — AUTO_REACT_GUIDANCE 2026-05-21 expanded form', () => {
  test('on auto-react, guidance references refs: line and encourages read-only tools', () => {
    const out = buildSystemPrompt(baseCtx({ autoReact: true }));
    expect(out).toContain('AUTO_REACT_GUIDANCE');
    // Concrete cues the LLM must read to recover from the "won't fabricate" trap.
    expect(out).toContain('refs:');
    expect(out).toContain('getAsset');
    expect(out.toLowerCase()).toContain('read-only');
    // Anti-fabrication exemption must be spelled out so the base-rule does
    // not override it.
    expect(out).toMatch(/(won't fabricate|не буду выдумывать)/i);
  });
});

describe('buildSystemPrompt — BASE_BEHAVIOR fabrication rule clarified (Fix C)', () => {
  test('NEVER-fabricate rule now carries the "when no source is visible" caveat', () => {
    const out = buildSystemPrompt(baseCtx());
    // Must still forbid fabrication of structural codes…
    expect(out).toMatch(/NEVER fabricate episode codes/);
    // …but must also permit reading published structured data.
    expect(out.toLowerCase()).toContain('no source');
    expect(out).toContain('refs:');
  });
});

describe('buildSystemPrompt — TD-34 STANDING_APPROVAL_SCOPE (2026-05-22)', () => {
  test('AUTO_REACT_GUIDANCE includes STANDING APPROVAL SCOPE paragraph with recognition phrases', () => {
    const out = buildSystemPrompt(baseCtx({ autoReact: true }));
    expect(out).toContain('STANDING APPROVAL SCOPE');
    expect(out).toContain('STAYS ACTIVE');
    // At least one Russian + one English recognition phrase example so the
    // LLM picks up the pattern.
    expect(out).toMatch(/(одобряю последовательность|автопроталкивай|продолжай batch)/);
    expect(out).toMatch(/(pre-approved continuing|do the whole batch|i pre-approve the rest)/);
    // Director must be told scope cancels on explicit revoke, not on auto-react.
    expect(out).toMatch(/(стоп|cancel|revoke)/);
  });

  test('AUTO_REACT_GUIDANCE lists TD-34 banned phrases verbatim', () => {
    const out = buildSystemPrompt(baseCtx({ autoReact: true }));
    // The exact Russian regression phrases Polina emitted during the
    // 2026-05-22 SS-S15-E01 smoke — locked verbatim so future prompt edits
    // can't silently drop them.
    expect(out).toContain('инструменты в этом триггере запрещены');
    expect(out).toContain('инструменты в авто-триггере запрещены');
    expect(out).toContain('без свежего одобрения мутаций не запускаю');
    expect(out).toContain('жду Director или следующий pipeline event');
    // Block header must call this out as a TD-34 indicator.
    expect(out).toContain('BANNED PHRASES');
    expect(out).toContain('TD-34');
  });

  test('AUTO_REACT_GUIDANCE enumerates read-only tools as ALWAYS allowed', () => {
    const out = buildSystemPrompt(baseCtx({ autoReact: true }));
    // Must explicitly name the read-only tools so Polina knows "tools
    // forbidden" is never correct for these.
    expect(out).toContain('ALWAYS allowed');
    expect(out).toContain('getAsset');
    expect(out).toContain('listRefPlans');
    expect(out).toContain('getCriticVerdict');
    expect(out).toContain('listShots');
    expect(out).toContain('getRecentActivityEvents');
    // Must explicitly reject the "tools forbidden" misinterpretation.
    expect(out.toLowerCase()).toContain('"tools forbidden" is never a correct statement');
  });

  test('OPEN_LOOP_AWARENESS atomic-scope rule extended to cover auto-react sub-operations', () => {
    const out = buildSystemPrompt(baseCtx({ autoReact: true }));
    expect(out).toContain('OPEN_LOOP_AWARENESS');
    expect(out).toContain('TD-34');
    // The extension paragraph must specifically mention auto-react context
    // as covered by atomic scope, and cross-reference STANDING_APPROVAL_SCOPE
    // so a future LLM read picks up the link.
    expect(out.toLowerCase()).toContain('auto-react');
    expect(out.toLowerCase()).toContain('atomic');
    expect(out).toMatch(/STANDING_APPROVAL_SCOPE|STANDING APPROVAL SCOPE/);
  });
});
