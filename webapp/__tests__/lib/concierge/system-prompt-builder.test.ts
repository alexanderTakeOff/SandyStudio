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
    const autoIdx = out.indexOf('AUTO_REACT_GUIDANCE');
    const openIdx = out.indexOf('OPEN_LOOP_AWARENESS');
    expect(autoIdx).toBeGreaterThanOrEqual(0);
    expect(openIdx).toBeGreaterThan(autoIdx);
  });

  test('does not render AUTO_REACT_GUIDANCE on Director-typed turns', () => {
    const out = buildSystemPrompt(baseCtx());
    expect(out).not.toContain('AUTO_REACT_GUIDANCE');
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
