// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/tools/work-plan.ts
// Unit A (2026-06-03) — Polina's durable per-episode work-plan / decision ledger.
//
// Problem: the Prod Assistant (EXEC-CONC) had no durable memory of the
// Director's standing decisions/approvals. She re-derived "Director approved
// shots 21-30, continue without stopping" from activity_events every turn and
// forgot once it scrolled past the 80-turn window.
//
// Solution: a per-episode STATE asset (file_type='STA-work_plan') that:
//   (a) is stored as a DB asset row,
//   (b) is auto-loaded into her system prompt EVERY turn (system-prompt-builder
//       WORK_PLAN block, fetched in both route handlers),
//   (c) is auto-appended deterministically the instant an approval is detected
//       server-side (chat route, via appendApprovalLine below).
//
// A STATE asset (STA-* prefix) needs no migration and does not trip the naming
// hook. The content PUT route already whitelists the 'STA' prefix as a text
// asset (app/api/assets/[id]/content/route.ts TEXT_FILE_TYPE_PREFIXES).
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types.gen';
import { fail, ok, resolveEpisodeId, type Tool, type ToolContext, type ToolResult } from './types';

type AnyArgs = Record<string, unknown>;

/** Canonical file_type for the per-episode work-plan STATE asset. */
export const WORK_PLAN_FILE_TYPE = 'STA-work_plan';

/** Statuses that PUT /api/assets/[id]/content allows overwriting in place. */
const EDITABLE_STATUSES: ReadonlySet<string> = new Set(['DRAFT', 'REVIEW', 'REVISION']);

type Sb = SupabaseClient<Database>;

interface EpisodeCodeParts {
  season: string;
  episode: string;
}

/**
 * Derive SEASON + EPISODE codes from an episode row's `episode_code`. The
 * stored code is the FULL form (e.g. 'SS-S15-E01' or 'SS-PILOT-E03'), so we
 * extract the SEASON segment (S15 / PILOT) and EPISODE segment (E01). Falls
 * back to safe placeholders when the code is malformed so filename building
 * never throws — the asset is still uniquely keyed by episode_id + file_type.
 */
function parseEpisodeCode(episodeCode: string | null | undefined): EpisodeCodeParts {
  const code = (episodeCode ?? '').trim().toUpperCase();
  const seasonMatch = code.match(/SS-(S\d{2}|PILOT)/);
  const episodeMatch = code.match(/-(E\d{1,3})\b/);
  return {
    season: seasonMatch ? seasonMatch[1] : 'S00',
    episode: episodeMatch ? episodeMatch[1] : 'E00',
  };
}

/**
 * Build the canonical work-plan filename per CLAUDE.md §3:
 *   SS-{SEASON}-{EPISODE}-STA-work_plan-v01-DRAFT.md
 */
function buildWorkPlanFilename(parts: EpisodeCodeParts): string {
  return `SS-${parts.season}-${parts.episode}-STA-work_plan-v01-DRAFT.md`;
}

interface WorkPlanRow {
  id: string;
  status: string;
  content: string | null;
}

/**
 * Find the newest work-plan STATE asset for an episode. Returns null when the
 * episode has no work plan yet. Newest-first by version then created_at so a
 * historical re-version (rare for STATE) still resolves to the latest.
 */
async function findWorkPlan(sb: Sb, episodeId: string): Promise<WorkPlanRow | null> {
  const { data, error } = await sb
    .from('assets')
    .select('id,status,content,version,created_at')
    .eq('episode_id', episodeId)
    .eq('file_type', WORK_PLAN_FILE_TYPE)
    .order('version', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`work-plan lookup failed: ${error.message}`);
  if (!data) return null;
  return { id: data.id, status: data.status as string, content: (data.content as string | null) ?? null };
}

/**
 * Read the work-plan content for an episode, or null if absent. Shared by the
 * route handlers (system-prompt WORK_PLAN block) and the getWorkPlan tool so
 * there is a single read path. Never throws on a missing plan — only on a real
 * DB error (which callers may choose to swallow into a null doc).
 */
export async function loadWorkPlanDoc(sb: Sb, episodeId: string): Promise<string | null> {
  const row = await findWorkPlan(sb, episodeId);
  return row?.content ?? null;
}

export interface UpsertWorkPlanResult {
  ok: true;
  assetId: string;
  created: boolean;
  status: string;
}

/**
 * Find-or-overwrite the work-plan STATE asset for an episode and set its
 * content to `content`. Mirrors the setBibleContent overwrite pattern but
 * writes directly via the service-role client (no internal HTTP round-trip):
 * STATE is operational, not a creative gate, so there is no approval cookie to
 * forward and a direct upsert keeps both the tool and the deterministic
 * server-side approval-append on one code path.
 *
 * - Existing row in an editable status → overwrite content in place.
 * - No row yet → insert a fresh DRAFT row with the canonical SS-... filename.
 * - Existing row LOCKED/APPROVED/REJECTED → flip back to DRAFT and overwrite
 *   (STATE is not a versioned creative deliverable; the ledger is mutable).
 *
 * The episode row is read once to derive SEASON/EPISODE codes + series_id for
 * the filename and the asset's series linkage.
 */
export async function upsertWorkPlan(
  sb: Sb,
  episodeId: string,
  content: string,
): Promise<UpsertWorkPlanResult> {
  const existing = await findWorkPlan(sb, episodeId);

  if (existing && EDITABLE_STATUSES.has(existing.status)) {
    const { error } = await sb
      .from('assets')
      .update({ content } as never)
      .eq('id', existing.id);
    if (error) throw new Error(`work-plan overwrite failed: ${error.message}`);
    return { ok: true, assetId: existing.id, created: false, status: existing.status };
  }

  if (existing) {
    // Non-editable status (LOCKED/APPROVED/REJECTED). STATE is a mutable
    // ledger, not a frozen deliverable — reopen to DRAFT and overwrite.
    const { error } = await sb
      .from('assets')
      .update({ content, status: 'DRAFT' } as never)
      .eq('id', existing.id);
    if (error) throw new Error(`work-plan reopen failed: ${error.message}`);
    return { ok: true, assetId: existing.id, created: false, status: 'DRAFT' };
  }

  // No work plan yet — insert a fresh DRAFT row with the canonical filename.
  const { data: episode, error: epErr } = await sb
    .from('episodes')
    .select('id,episode_code,series_id')
    .eq('id', episodeId)
    .maybeSingle();
  if (epErr) throw new Error(`episode lookup failed: ${epErr.message}`);
  if (!episode) throw new Error(`episode ${episodeId} not found`);

  const parts = parseEpisodeCode(episode.episode_code as string | null);
  const filename = buildWorkPlanFilename(parts);

  const { data: inserted, error: insErr } = await sb
    .from('assets')
    .insert({
      episode_id: episodeId,
      // episodes.series_id holds a series CODE ("SS-S15"), NOT a UUID; the
      // assets.series_id column is a UUID FK, so copying it threw
      // "invalid input syntax for type uuid". Other asset rows leave it null —
      // the work-plan row is uniquely keyed by episode_id + file_type anyway.
      series_id: null,
      file_type: WORK_PLAN_FILE_TYPE,
      filename,
      status: 'DRAFT',
      version: 1,
      agent_id: 'EXEC-CONC',
      content,
      description: 'Polina durable work-plan & decision ledger for this episode.',
    } as never)
    .select('id')
    .maybeSingle();
  if (insErr) throw new Error(`work-plan insert failed: ${insErr.message}`);
  const assetId = (inserted as { id?: string } | null)?.id ?? '';
  return { ok: true, assetId, created: true, status: 'DRAFT' };
}

/**
 * Deterministic server-side approval append (Unit A q6). Appends a single
 * dated line to the episode's work-plan ledger the instant an approval is
 * detected, independent of whether the model remembers to call updateWorkPlan.
 *
 * Reuses upsertWorkPlan so creation/overwrite logic is never duplicated. The
 * caller MUST guard so this only fires when an approval token was actually
 * detected — never fabricate an approval line.
 */
export async function appendApprovalLine(
  sb: Sb,
  episodeId: string,
  scope: string,
): Promise<void> {
  const existing = await loadWorkPlanDoc(sb, episodeId);
  const isoNow = new Date().toISOString();
  const cleanScope = scope.replace(/\s+/g, ' ').trim().slice(0, 240);
  const line = `[${isoNow}] APPROVED: ${cleanScope}`;
  const next = existing && existing.trim() !== ''
    ? `${existing.replace(/\s+$/, '')}\n${line}`
    : `# Work Plan & Decision Ledger\n\n## Standing approvals\n${line}`;
  await upsertWorkPlan(sb, episodeId, next);
}

// ──────────────────────────────────────────────────────────────────────────────
// Tool: getWorkPlan — read-only.
// ──────────────────────────────────────────────────────────────────────────────

interface GetWorkPlanArgs {
  episodeId?: string;
}

export const getWorkPlan: Tool<GetWorkPlanArgs> = {
  name: 'getWorkPlan',
  description:
    "Read your durable work-plan & decision ledger for an episode (the STA-work_plan STATE asset). It records the Director's standing approvals and the current todo list, and survives the whole session. The same content is auto-loaded into your [WORK_PLAN] system-prompt block every turn — call this tool only when you need the full body explicitly or are operating on a non-focused episode. If episodeId is omitted, uses the active conversation episode.",
  mutating: false,
  schema: {
    type: 'function',
    function: {
      name: 'getWorkPlan',
      description: 'Read the durable per-episode work-plan / decision ledger. Read-only.',
      parameters: {
        type: 'object',
        properties: {
          episodeId: {
            type: 'string',
            description: 'Episode UUID. Omit to use the active conversation episode.',
          },
        },
        additionalProperties: false,
      },
    },
  },
  parse(raw) {
    const obj = safeParse(raw);
    return {
      episodeId: typeof obj.episodeId === 'string' && obj.episodeId.trim() !== ''
        ? obj.episodeId.trim()
        : undefined,
    };
  },
  async execute(args, ctx): Promise<ToolResult> {
    const episodeId = resolveEpisodeId(args, ctx);
    if (!episodeId) {
      return fail(
        'No episode in focus — pass episodeId explicitly or open an episode first.',
        'no_episode_id',
      );
    }
    try {
      const doc = await loadWorkPlanDoc(ctx.supabase, episodeId);
      if (!doc || doc.trim() === '') {
        return ok(
          { episodeId, content: null },
          'No work plan yet for this episode. Use updateWorkPlan to start the ledger when the Director makes a standing decision.',
        );
      }
      return ok({ episodeId, content: doc }, `Work plan loaded (${doc.length} chars).`);
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'unknown', 'tool_error');
    }
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Tool: updateWorkPlan — non-mutating (operational STATE, not a creative gate).
// ──────────────────────────────────────────────────────────────────────────────

interface UpdateWorkPlanArgs {
  episodeId?: string;
  content: string;
}

export const updateWorkPlan: Tool<UpdateWorkPlanArgs> = {
  name: 'updateWorkPlan',
  description:
    "Overwrite your durable work-plan & decision ledger for an episode with new markdown content (the STA-work_plan STATE asset). Use this to record the Director's standing approvals, the current todo list, and any plan/decision changes so they survive past the conversation window — you read this back every turn via the [WORK_PLAN] block. This is operational state you maintain yourself, NOT a creative gate, so it needs NO verbal approval — just keep it current. Pass the FULL new ledger body (not a diff); it overwrites in place. If episodeId is omitted, uses the active conversation episode.",
  // STATE ledger is operational memory Polina maintains, not a creative gate —
  // intentionally NOT mutating, so the verbal-approval gate is NOT applied.
  mutating: false,
  schema: {
    type: 'function',
    function: {
      name: 'updateWorkPlan',
      description:
        'Overwrite the durable per-episode work-plan / decision ledger. No verbal approval required (operational state).',
      parameters: {
        type: 'object',
        properties: {
          episodeId: {
            type: 'string',
            description: 'Episode UUID. Omit to use the active conversation episode.',
          },
          content: {
            type: 'string',
            description: 'The full new ledger markdown body to persist verbatim.',
            minLength: 1,
            maxLength: 200000,
          },
        },
        required: ['content'],
        additionalProperties: false,
      },
    },
  },
  parse(raw) {
    const obj = safeParse(raw);
    const episodeId = typeof obj.episodeId === 'string' && obj.episodeId.trim() !== ''
      ? obj.episodeId.trim()
      : undefined;
    // Empty content is NOT a parse error — a wake with nothing new to record must
    // no-op gracefully in execute(), never throw. Throwing turned "nothing to
    // write" into a tool-error the model retried until the 6-round backstop
    // escalated to the Director (E25 2026-07-09). See the no-op guard in execute().
    const content = typeof obj.content === 'string' ? obj.content : '';
    return { episodeId, content };
  },
  async execute(args, ctx): Promise<ToolResult> {
    const episodeId = resolveEpisodeId(args, ctx);
    if (!episodeId) {
      return fail(
        'No episode in focus — pass episodeId explicitly or open an episode first.',
        'no_episode_id',
      );
    }
    // Graceful no-op: called on a wake with nothing new to record. Return ok so
    // the model sees "nothing to do" and stops — never an error it would retry
    // (which used to spin to the 6-round backstop and escalate to the Director).
    if (args.content.trim().length < 1) {
      return ok(
        { episodeId, noop: true },
        'No change to record — work plan left unchanged. Do not call updateWorkPlan again unless something actually changed.',
      );
    }
    try {
      const res = await upsertWorkPlan(ctx.supabase, episodeId, args.content);
      return ok(
        { episodeId, asset_id: res.assetId, created: res.created, status: res.status },
        res.created
          ? `Work plan created (${args.content.length} chars). It now auto-loads every turn.`
          : `Work plan updated in place (${args.content.length} chars).`,
      );
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'unknown', 'tool_error');
    }
  },
};

function safeParse(raw: string): AnyArgs {
  if (!raw || raw.trim() === '') return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as AnyArgs;
    return {};
  } catch {
    return {};
  }
}
