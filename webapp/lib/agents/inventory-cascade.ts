// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/inventory-cascade.ts
// Motor 2 of the WCHK strengthening (2026-06-11) — CHK-W04 props vs the
// cascading inventory: union(Bible SBL-object_* canon ∪ episode brief
// prop_delta). PURE — no I/O; the runner assembles the inventory and feeds
// the SAME ShotStateDelta[] the extraction pass produced for the state
// ledger (no second LLM call — anti-additivity).
//
// Cascade doctrine (Director, 2026-06-11): recurrent-location props live in
// the Bible as series canon; per-episode additions live in the brief's
// `prop_delta`; a location recurring across 2-3 episodes gets PROMOTED to the
// Bible (manual, PA proposes → Director confirms). The check judges against
// the UNION.
//
// Data-gated activation: an empty union means the Bible/brief have not been
// populated yet → status NO_INVENTORY, zero violations, surfaced explicitly.
// No feature flag needed beyond CONTINUITY_LEDGER_ENABLED — absent data
// cannot produce noise by construction.
//
// Severity: UNRESOLVED_PROP is always MINOR and never enters the MAJOR
// verdict pool — extraction invents normalized snake_case ids and the match
// is exact+aliases, so naming drift is expected; this check informs the
// Director and seeds Bible data-work, it does not bounce storyboards.
// ──────────────────────────────────────────────────────────────────────────────

import type { ShotStateDelta } from './state-ledger';

export interface PropSpec {
  /** Canonical snake_case name ("round_side_table"). */
  name: string;
  /** Alternative ids the extractor may emit ("side_table", "round_table"). */
  aliases?: string[];
  /** Geometry/physics note ("flat round top, no legs — can roll on its rim"). */
  geometry?: string;
}

export interface InventoryViolation {
  rule: 'UNRESOLVED_PROP';
  entity: string;
  shot_id: string;
  severity: 'MINOR';
  description: string;
}

export interface InventoryCheckResult {
  status: 'OK' | 'NO_INVENTORY';
  violations: InventoryViolation[];
  /** Distinct entities that DID resolve against the union. */
  resolvedCount: number;
  /** Distinct entity ids that resolved nowhere (deduped, first-shot order). */
  unresolvedEntities: string[];
}

function normalize(id: string): string {
  return id.trim().toLowerCase().replace(/\s+/g, '_');
}

/** Build the lookup set from the inventory union (names + aliases). */
function inventoryIndex(inventory: readonly PropSpec[]): Set<string> {
  const idx = new Set<string>();
  for (const p of inventory) {
    if (p.name) idx.add(normalize(p.name));
    for (const a of p.aliases ?? []) idx.add(normalize(a));
  }
  return idx;
}

/**
 * CHK-W04 — every extracted entity must resolve to the inventory union or to
 * a known non-prop (characters, locations). Pure and deterministic.
 */
export function validateInventory(
  deltas: readonly ShotStateDelta[],
  inventory: readonly PropSpec[],
  knownNonProps: readonly string[],
): InventoryCheckResult {
  const idx = inventoryIndex(inventory);
  if (idx.size === 0) {
    return {
      status: 'NO_INVENTORY',
      violations: [],
      resolvedCount: 0,
      unresolvedEntities: [],
    };
  }

  const nonProps = new Set(knownNonProps.map(normalize));
  const seen = new Set<string>();
  const resolved = new Set<string>();
  const violations: InventoryViolation[] = [];
  const unresolved: string[] = [];

  const ordered = [...deltas].sort((a, b) => a.shot_index - b.shot_index);
  for (const delta of ordered) {
    const entities = [
      ...(delta.entities_introduced ?? []),
      ...delta.actions.map((a) => a.entity),
    ];
    for (const raw of entities) {
      const id = normalize(raw);
      if (seen.has(id)) continue;
      seen.add(id);
      if (nonProps.has(id)) continue;
      if (idx.has(id)) {
        resolved.add(id);
        continue;
      }
      unresolved.push(id);
      violations.push({
        rule: 'UNRESOLVED_PROP',
        entity: id,
        shot_id: delta.shot_id,
        severity: 'MINOR',
        description:
          `«${id}» (впервые в ${delta.shot_id}) не найден ни в Bible-каноне ` +
          `объектов, ни в prop_delta брифа. Либо добавить в инвентарь ` +
          `(alias к существующему пропу?), либо это объект из ниоткуда.`,
      });
    }
  }

  return {
    status: 'OK',
    violations,
    resolvedCount: resolved.size,
    unresolvedEntities: unresolved,
  };
}

/**
 * Parse the episode brief's optional `prop_delta` (Director q3a, 2026-06-11:
 * the brief is the home of per-episode prop additions). Convention: the brief
 * markdown carries a fenced JSON block with an optional `prop_delta` array of
 * PropSpec-shaped entries. Absent block / absent field → empty delta (the
 * episode adds nothing beyond Bible canon).
 */
export function parseBriefPropDelta(briefContent: string | null | undefined): PropSpec[] {
  if (!briefContent) return [];
  const matches = [...briefContent.matchAll(/```json\s*([\s\S]+?)```/g)];
  if (matches.length === 0) return [];
  for (const m of matches) {
    try {
      const parsed = JSON.parse(m[1].trim()) as { prop_delta?: unknown };
      if (!Array.isArray(parsed.prop_delta)) continue;
      const out: PropSpec[] = [];
      for (const raw of parsed.prop_delta) {
        if (!raw || typeof raw !== 'object') continue;
        const p = raw as Record<string, unknown>;
        if (typeof p.name !== 'string' || p.name.length === 0) continue;
        out.push({
          name: p.name,
          aliases: Array.isArray(p.aliases)
            ? p.aliases.filter((x): x is string => typeof x === 'string')
            : undefined,
          geometry: typeof p.geometry === 'string' ? p.geometry : undefined,
        });
      }
      return out;
    } catch {
      // not the JSON block we're looking for — try the next one
    }
  }
  return [];
}
