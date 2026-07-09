// Unit tests for the Realtime push ambient-event decision layer.
// Phase 10A.0 (Director directive 2026-05-13).

import { describe, expect, test } from 'vitest';

import {
  decideAmbientEvent,
  extractAmbientMetadata,
  type ActivityEventRow,
} from '@/lib/concierge/ambient-events';

const baseRow = (overrides: Partial<ActivityEventRow> = {}): ActivityEventRow => ({
  id: '00000000-0000-0000-0000-000000000001',
  event_type: 'agent_completed',
  severity: 'info',
  title: 'Reference Artist completed',
  description: null,
  actor: 'EXEC-EREF',
  episode_id: null,
  asset_id: null,
  job_id: null,
  metadata: { agent: 'EXEC-EREF', file_type: 'IMG-episode_ref' },
  created_at: '2026-05-13T10:00:00Z',
  ...overrides,
});

describe('decideAmbientEvent', () => {
  test('injects actionable agent_completed events', () => {
    const d = decideAmbientEvent(baseRow());
    expect(d.inject).toBe(true);
    expect(d.content).toContain('agent_completed');
    expect(d.content).toContain('Reference Artist completed');
    expect(d.severity).toBe('info');
  });

  test('skips low-signal event types', () => {
    const d = decideAmbientEvent(baseRow({ event_type: 'asset_updated' }));
    expect(d.inject).toBe(false);
    expect(d.reason).toMatch(/not actionable/);
  });

  // D17 curation (2026-07-08): agent_started / approval_granted / manual_trigger
  // were dropped from the injection whitelist (E18 firehose — 284 of 438 noise
  // injections). They are now pure "not actionable" for the ambient gate.
  test.each(['agent_started', 'approval_granted', 'manual_trigger'])(
    'suppresses de-curated event type %s',
    (eventType) => {
      const d = decideAmbientEvent(baseRow({ event_type: eventType }));
      expect(d.inject).toBe(false);
      expect(d.reason).toMatch(/not actionable/);
    },
  );

  test("skips Director's own approval echoes", () => {
    // approval_revision is still actionable AND director-own — exercises the skip.
    const d = decideAmbientEvent(
      baseRow({ event_type: 'approval_revision', actor: 'director-uuid' }),
      { directorUserId: 'director-uuid' },
    );
    expect(d.inject).toBe(false);
    expect(d.reason).toMatch(/already seen/);
  });

  test('still injects approval_revision from another actor (e.g. EXEC-DIR-AI)', () => {
    const d = decideAmbientEvent(
      baseRow({ event_type: 'approval_revision', actor: 'EXEC-DIR-AI' }),
      { directorUserId: 'director-uuid' },
    );
    expect(d.inject).toBe(true);
  });

  test('promotes severity=error to error label', () => {
    const d = decideAmbientEvent(
      baseRow({ event_type: 'agent_failed', severity: 'error', title: 'Composer failed' }),
    );
    expect(d.severity).toBe('error');
    expect(d.content).toContain('Composer failed');
  });

  test('appends short description to title when present', () => {
    const d = decideAmbientEvent(
      baseRow({ description: 'finished 14 of 17 shots' }),
    );
    expect(d.content).toContain('finished 14 of 17 shots');
  });

  test('omits long description (would bloat the prompt)', () => {
    const longDesc = 'x'.repeat(500);
    const d = decideAmbientEvent(baseRow({ description: longDesc }));
    expect(d.content).not.toContain('xxxxxxxxxxxx');
  });
});

describe('extractAmbientMetadata', () => {
  test('forwards a narrow set of fields PA actually needs', () => {
    const row = baseRow({
      asset_id: 'asset-1',
      episode_id: 'ep-1',
      metadata: {
        agent: 'EXEC-SREV',
        file_type: 'REV-script_qa',
        verbose_internal_field: 'should-not-leak',
      },
    });
    const m = extractAmbientMetadata(row);
    expect(m.kind).toBe('pipeline_event');
    expect(m.activity_event_id).toBe(row.id);
    expect(m.event_type).toBe('agent_completed');
    expect(m.agent).toBe('EXEC-SREV');
    expect(m.file_type).toBe('REV-script_qa');
    expect(m.episode_id).toBe('ep-1');
    expect(m.asset_id).toBe('asset-1');
    // Internal fields are NOT forwarded.
    expect(m).not.toHaveProperty('verbose_internal_field');
  });

  test('handles missing metadata gracefully', () => {
    const m = extractAmbientMetadata(baseRow({ metadata: null }));
    expect(m.kind).toBe('pipeline_event');
    expect(m.agent).toBeNull();
    expect(m.file_type).toBeNull();
  });
});
