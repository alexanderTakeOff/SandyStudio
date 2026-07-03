// Unit tests for the thin-agent watchdog scoping (2026-07-03).
// The Inngest cron orchestration (step.run, service-role reads, inngest.send)
// is integration-tested on the live autonomous run; here we lock the one pure
// decision the thin-agent change introduced: which episode classes skip the
// "parked for hours" pre-filter.

import { describe, expect, test } from 'vitest';
import { appliesParkedFilter } from '@/inngest/functions/pa-batch-stall-watchdog';

describe('appliesParkedFilter — thin-agent watchdog scope', () => {
  test('plain Mode-4 idle-sweep candidate → parked filter APPLIES', () => {
    expect(
      appliesParkedFilter({ isFanoutRunning: false, isAutonomousRun: false }),
    ).toBe(true);
  });

  test('FANOUT_RUNNING episode → parked filter skipped', () => {
    expect(
      appliesParkedFilter({ isFanoutRunning: true, isAutonomousRun: false }),
    ).toBe(false);
  });

  test('autonomous-run episode → parked filter skipped (driven via new-state guard only)', () => {
    expect(
      appliesParkedFilter({ isFanoutRunning: false, isAutonomousRun: true }),
    ).toBe(false);
  });

  test('both flags → still skipped', () => {
    expect(
      appliesParkedFilter({ isFanoutRunning: true, isAutonomousRun: true }),
    ).toBe(false);
  });
});
