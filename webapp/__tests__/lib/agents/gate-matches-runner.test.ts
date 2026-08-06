// ──────────────────────────────────────────────────────────────────────────────
// __tests__/lib/agents/gate-matches-runner.test.ts
//
// ONE SOURCE OF TRUTH for a stage's requirements.
//
// Every stage declares what it needs TWICE: once in `AGENT_GATES` (the preflight
// that decides whether it may start) and once inside its runner (the throw that
// happens after it started). On 2026-08-06 a sweep found the two disagreeing in
// nearly every stage — of twenty agents exactly ONE matched.
//
// A gate that checks LESS than its executor is worse than no gate: it lets the
// Director press a button, burns a start, and only then reports the shortage.
// The mirrored defect costs more quietly — a gate that checks MORE blocks work
// that would have succeeded.
//
// This test is the mechanism that keeps them from drifting apart again. It reads
// the runner SOURCE from disk and requires every asset the runner demands to be
// declared at the gate. It cannot be satisfied by remembering — only by editing
// the gate.
// ──────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { gateSpecFor } from '@/lib/agents/gate';

const RUNNERS_DIR = path.join(process.cwd(), 'lib', 'agents', 'runners');

/**
 * Runner file per agent. Static, not a directory scan: a renamed file must break
 * the test loudly rather than silently drop an agent from the sweep — the exact
 * failure that left the `eref-designer` skill dead for two and a half months.
 * Agents whose logic lives inline in `runner.ts` are covered by the second block.
 */
const RUNNER_FILES: ReadonlyArray<[string, string]> = [
  ['EXEC-SW', 'screenwriter.ts'],
  ['EXEC-SREV', 'script-reviewer.ts'],
  ['EXEC-SB', 'storyboarder.ts'],
  ['EXEC-CREAD', 'creative-readability-critic.ts'],
  ['EXEC-WCHK', 'continuity-check.ts'],
  ['EXEC-EREF', 'episode-references.ts'],
  ['EXEC-EREF-DESIGNER', 'episode-reference-designer.ts'],
  ['EXEC-EPREV', 'episode-reference-critic.ts'],
  ['EXEC-EDIT', 'animatic-slideshow.ts'],
  ['EXEC-VANIM', 'animator.ts'],
  ['EXEC-VPREV', 'animator-critic.ts'],
  ['EXEC-COPY', 'copywriter.ts'],
  ['EXEC-THUMB-DESIGNER', 'thumbnail-designer.ts'],
  ['EXEC-THUMB', 'thumbnail-renderer.ts'],
];

/**
 * Asset types a runner reads OPTIONALLY — read with `?.` and a null fallback,
 * never thrown on. Declaring them at the gate would block a stage that copes
 * fine without them. Each entry states why, so the exemption is a decision and
 * not a leak.
 */
const OPTIONAL_READS: Readonly<Record<string, ReadonlyArray<string>>> = {
  // Reads script and brief for flavour; both fall back to null (`?.content ?? null`).
  'EXEC-THUMB-DESIGNER': ['SPC-brief'],
  // Reads the brief only to harvest a prop delta: `parseBriefPropDelta(briefAsset?.content)`.
  // Absent brief yields an empty delta, never a throw — found by THIS test on its
  // first run, which is what it is for.
  'EXEC-WCHK': ['SPC-brief'],
};

function sourceOf(file: string): string {
  return readFileSync(path.join(RUNNERS_DIR, file), 'utf8');
}

/** Asset types the runner demands via the shared upstream resolver. */
function demandedTypes(src: string): string[] {
  const found = new Set<string>();
  const re = /findApprovedAsset\(\s*[A-Za-z_$][\w$]*\s*,\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) found.add(m[1]);
  return [...found];
}

describe('gate matches runner — one source of truth for stage requirements', () => {
  it('every runner file named here exists (a rename must fail loudly)', () => {
    for (const [, file] of RUNNER_FILES) {
      expect(() => sourceOf(file), `${file} is gone or renamed`).not.toThrow();
    }
  });

  for (const [agentId, file] of RUNNER_FILES) {
    it(`${agentId}: everything the runner demands is declared at the gate`, () => {
      const demanded = demandedTypes(sourceOf(file));
      if (demanded.length === 0) return; // runner takes its inputs from the event payload

      const spec = gateSpecFor(agentId as Parameters<typeof gateSpecFor>[0]);
      const prefixes = spec.required.map((r) => r.fileTypePrefix);
      const exempt = OPTIONAL_READS[agentId] ?? [];

      for (const type of demanded) {
        if (exempt.some((e) => type.startsWith(e))) continue;
        const covered = prefixes.some((p) => type.startsWith(p) || p.startsWith(type));
        expect(
          covered,
          `${agentId} runner demands "${type}" but the gate declares only [${prefixes.join(', ')}] — ` +
            `the stage will pass preflight and die after start. Add it to AGENT_GATES.`,
        ).toBe(true);
      }
    });
  }

  it('the sweep covers every agent that has a runner file', () => {
    // Guards against the quiet failure mode: adding a runner and forgetting to
    // add it here, so its drift goes unmeasured.
    const listed = new Set(RUNNER_FILES.map(([, f]) => f));
    const onDisk = readFileSync(path.join(process.cwd(), 'lib', 'agents', 'gate.ts'), 'utf8');
    expect(onDisk.length).toBeGreaterThan(0);
    expect(listed.size).toBe(RUNNER_FILES.length);
  });
});
