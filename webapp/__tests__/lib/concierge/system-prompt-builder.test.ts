// Unit tests for buildSystemPrompt blocks.
// Spot-checks for guarantees that downstream code relies on. Not a full
// snapshot — block content is allowed to evolve. TD-25 P1 — 2026-05-21.

import { describe, expect, test } from 'vitest';

import { buildSystemPrompt } from '@/lib/concierge/system-prompt-builder';
import type { PromptContext } from '@/lib/concierge/system-prompt-builder';

const baseCtx = (overrides: Partial<PromptContext> = {}): PromptContext => ({
  today: '2026-05-21',
  mode: '2.5',
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
