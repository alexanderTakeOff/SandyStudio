// ──────────────────────────────────────────────────────────────────────────────
// lib/api/canon-extensions.ts
// Bible Extension Proposal flow — Director-arbitrated canon growth.
//
// Per Director's 2026-05-02 architecture decision: agents that need a non-
// canonical asset must surface a structured proposal — never invent silently.
//
// Flow:
//   1. Agent runner emits asset.content with `proposed_canon_extensions[]`
//      (or REV-continuity emits `violations[]` which we convert here)
//   2. factory.ts spots them after saveAgentOutput, calls emitExtensionRequest
//   3. Director sees the request in Inbox (input_requested event)
//   4. CanonExtensionsPanel UI lets Director Approve / Reject per row
//   5. Approve → creates SBL-* DRAFT in series Bible (via createBibleDraft)
//   6. After all proposals resolved → event.resolved_at set, Inbox clears
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types.gen';

export type CanonExtensionKind = 'character' | 'location' | 'object' | 'style';

export interface CanonExtensionProposal {
  /** Stable slug; lowercase a-z0-9_- only. */
  name: string;
  kind: CanonExtensionKind;
  /** Why the agent thinks this needs to enter the canon. */
  rationale: string;
  /** Description for the proposed Bible asset (Director can edit before approve). */
  proposed_description: string;
  /** Optional: id of the upstream asset that referenced this proposal. */
  source_asset_id?: string;
}

/**
 * Parse `proposed_canon_extensions[]` out of an asset's content. Looks for the
 * last fenced ```json block (same convention as scenes_v1 / review_v1 / etc.).
 *
 * Continuity Check assets (file_type === REV-world_check) emit `violations[]`
 * instead — we map those to extension proposals automatically.
 */
export function parseExtensionsFromContent(
  content: string | null | undefined,
  fileType: string,
): CanonExtensionProposal[] {
  if (!content) return [];
  const matches = [...content.matchAll(/```json\s*([\s\S]+?)```/g)];
  if (matches.length === 0) return [];
  const last = matches[matches.length - 1]?.[1];
  if (!last) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(last.trim());
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];

  const obj = parsed as Record<string, unknown>;
  const out: CanonExtensionProposal[] = [];

  // Path 1: explicit proposed_canon_extensions[] (used by Brief / SW / SB / COPY)
  const explicit = obj.proposed_canon_extensions;
  if (Array.isArray(explicit)) {
    for (const e of explicit) {
      const p = normalizeProposal(e);
      if (p) out.push(p);
    }
    return out;
  }

  // Path 2: Continuity Check — derive from violations[]
  if (fileType === 'REV-world_check' || fileType === 'REV-continuity') {
    const violations = obj.violations;
    if (Array.isArray(violations)) {
      for (const v of violations) {
        const p = violationToProposal(v);
        if (p) out.push(p);
      }
    }
    return out;
  }

  return out;
}

function normalizeProposal(raw: unknown): CanonExtensionProposal | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const kindRaw = String(r.kind ?? r.type ?? '').toLowerCase();
  const kinds: CanonExtensionKind[] = ['character', 'location', 'object', 'style'];
  const kind = kinds.find((k) => kindRaw === k || kindRaw === `${k}s`);
  if (!kind) return null;
  const name = slugify(String(r.name ?? r.id ?? ''));
  if (!name) return null;
  const rationale = String(r.rationale ?? r.note ?? r.reason ?? '');
  const proposed_description = String(r.proposed_description ?? r.description ?? r.body ?? '');
  return { kind, name, rationale, proposed_description };
}

function violationToProposal(raw: unknown): CanonExtensionProposal | null {
  if (typeof raw === 'string') {
    // String form: "LOCATION: 'Central Public Square' used in all 13 shots — not in LOCKED Bible..."
    const m = raw.match(/^(LOCATION|CHARACTER|OBJECT|STYLE)\s*:?\s*['"]?([^'":]+)['"]?\s*[—\-:]?\s*(.*)$/i);
    if (!m) return null;
    const kindMap: Record<string, CanonExtensionKind> = {
      LOCATION: 'location', CHARACTER: 'character', OBJECT: 'object', STYLE: 'style',
    };
    const kind = kindMap[m[1]!.toUpperCase()];
    if (!kind) return null;
    const name = slugify(m[2]!.trim());
    if (!name) return null;
    return {
      kind,
      name,
      rationale: (m[3] ?? '').trim() || raw,
      proposed_description: (m[3] ?? '').trim(),
    };
  }
  if (raw && typeof raw === 'object') {
    return normalizeProposal(raw);
  }
  return null;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

/**
 * Emit an `input_requested` activity event linking the agent's asset to the
 * Director Inbox. Idempotent on (asset_id) — reusing existing event when one
 * is already unresolved.
 */
export async function emitExtensionRequest(
  supabase: SupabaseClient<Database>,
  args: {
    assetId: string;
    episodeId: string | null;
    agentId: string;
    proposals: CanonExtensionProposal[];
  },
): Promise<{ eventId: string; created: boolean }> {
  if (args.proposals.length === 0) return { eventId: '', created: false };

  // Idempotency: don't double-emit if an unresolved one already exists.
  const { data: existing } = await supabase
    .from('activity_events')
    .select('id')
    .eq('event_type', 'canon_extension_proposed')
    .is('resolved_at', null)
    .contains('metadata', { asset_id: args.assetId })
    .limit(1);
  if (existing && existing.length > 0) {
    return { eventId: (existing[0] as { id: string }).id, created: false };
  }

  const titleKinds = [...new Set(args.proposals.map((p) => p.kind))].sort().join(', ');
  const ins = await supabase
    .from('activity_events')
    .insert({
      event_type: 'canon_extension_proposed',
      severity: 'warning',
      title: `Bible extension proposed (${args.proposals.length}): ${titleKinds}`,
      description: `${args.agentId} proposes adding ${args.proposals.length} new ${titleKinds} to the Series Bible. Review in Inbox.`,
      actor: args.agentId,
      asset_id: args.assetId,
      episode_id: args.episodeId,
      metadata: {
        kind: 'canon_extension',
        asset_id: args.assetId,
        proposal_count: args.proposals.length,
        proposals: args.proposals,
      },
    } as never)
    .select('id')
    .single();

  if (ins.error) {
    throw new Error(`emitExtensionRequest insert failed: ${ins.error.message}`);
  }
  return { eventId: (ins.data as { id: string }).id, created: true };
}

/**
 * Mark an extension-proposal event as resolved. Director's Approve/Reject
 * sweep calls this after each proposal is dispositioned.
 */
export async function resolveExtensionRequest(
  supabase: SupabaseClient<Database>,
  eventId: string,
): Promise<void> {
  await supabase
    .from('activity_events')
    .update({ resolved_at: new Date().toISOString() })
    .eq('id', eventId);
}
