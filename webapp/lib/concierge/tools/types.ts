// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/tools/types.ts
// Shared contract for Prod Assistant tools (Phase 1-B).
//
// Each tool: declarative schema + parser + executor. The chat route exposes
// the schemas to OpenAI function-calling; when the model emits a tool_call,
// the route looks up the tool, parses args, and calls execute().
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types.gen';
import type { ConciergeMode, ConciergeTurnRow } from '../types';

/** Server-side execution context handed to every tool. */
export interface ToolContext {
  supabase: SupabaseClient<Database>;
  /** Active thread for audit + verbal-approval lookups. */
  threadId: string;
  /** Active governance mode — tools may refuse based on mode (e.g. publish in Mode 1). */
  mode: ConciergeMode;
  /** Episode currently in focus, if any. Many tools default to this when args omit episodeId. */
  episodeId?: string | null;
  /** Episode code (e.g. "SS-S15-E10") for display and fallback resolution. */
  episodeCode?: string | null;
  /** Director's auth user id for activity_events provenance. */
  directorUserId?: string | null;
  /** Recent thread turns, oldest-first. Used for verbal-approval detection. */
  recentTurns?: ConciergeTurnRow[];
  /**
   * Director's session cookies forwarded from the chat request. Mutating
   * tools call existing webapp API routes (e.g. /api/assets/[id]/approve)
   * which run `requireDirector()`; forwarding the cookie keeps the audit
   * trail attributed to the real human and respects existing governance.
   */
  cookieHeader?: string | null;
  /**
   * q9 (2026-06-09): EXEC-DIR-AI service-token bearer for server-to-server
   * mutating calls in bold modes (3/4). Auto-react has no Director cookie, so
   * mutating tools forward this `Authorization: Bearer <EXEC_DIR_AI_TOKEN>`
   * header instead — `requireDirector()` accepts it as Director-equivalent
   * (but hard-limit routes reject it via assertHumanDirector). Null in normal
   * Director-typed chat (cookieHeader is used there).
   */
  authHeader?: string | null;
  /** Origin used for internal fetch (defaults to NEXT_PUBLIC_APP_URL). */
  appOrigin: string;
}

/**
 * Build the auth headers a mutating tool's internal fetch must forward:
 * the Director's session cookie (typed chat) OR the EXEC-DIR-AI bearer
 * (q9 bold-mode auto-react). Centralises the cookie/authorization spread so
 * every tool's fetch authenticates consistently.
 */
export function authHeaders(ctx: ToolContext): Record<string, string> {
  const h: Record<string, string> = {};
  if (ctx.cookieHeader) h.Cookie = ctx.cookieHeader;
  if (ctx.authHeader) h.Authorization = ctx.authHeader;
  return h;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when `v` is a syntactically valid UUID string. */
export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

/**
 * Resolve the episode a tool should act on.
 *
 * The thread-bound episode (`ctx.episodeId`) is the AUTHORITY. The chat route
 * adopts the thread's bound episode into ctx (q13, 2026-06-15), so for a bound
 * thread ctx.episodeId is always the correct UUID. The model-supplied
 * `args.episodeId` is unreliable — Gemini-Polina jams the episode CODE
 * ("SS-S15-E10") or a hallucinated UUID into it, and the old
 * `args.episodeId ?? ctx.episodeId` precedence let that SILENTLY override the
 * right UUID → every episode-scoped query missed → her recurring "no APPROVED
 * storyboard" / "wrong episode" / "forgot episodeId" failures (Director
 * 2026-06-16: a repeating error is our bug, not the model).
 *
 * Precedence:
 *   1. ctx.episodeId — thread binding wins whenever present.
 *   2. args.episodeId — only when it is a VALID UUID AND the thread is unbound
 *      (studio-wide conversation with no episode of its own).
 * A non-UUID args.episodeId (a code in the wrong field) is never used as an id;
 * `resolveEpisodeCode` surfaces it for code-based DB resolution instead.
 */
export function resolveEpisodeId(
  args: { episodeId?: string | null },
  ctx: ToolContext,
): string | null {
  if (ctx.episodeId) return ctx.episodeId;
  if (isUuid(args.episodeId)) return args.episodeId;
  return null;
}

/**
 * Resolve an episode CODE candidate for tools that fall back to code-based
 * lookup (e.g. listShots). A non-UUID value in `args.episodeId` is almost
 * always the episode CODE placed in the wrong field, so it is treated as a code
 * candidate: explicit `args.episodeCode` wins, then the misfiled id, then
 * ctx.episodeCode.
 */
export function resolveEpisodeCode(
  args: { episodeId?: string | null; episodeCode?: string | null },
  ctx: ToolContext,
): string | null {
  const miscodedId = !isUuid(args.episodeId) ? args.episodeId ?? null : null;
  return args.episodeCode ?? miscodedId ?? ctx.episodeCode ?? null;
}

/** Standard tool result envelope. Always JSON-serialisable. */
export type ToolResult =
  | {
      ok: true;
      data: unknown;
      summary?: string;
      /**
       * TD-25 P4 (2026-05-22): optional metadata patch the route merges into
       * the persisted assistant turn at end-of-round. Used by intent-declaring
       * tools like `markAwaitingDirector` to record structured state on the
       * turn (`awaiting_director_input`) instead of letting a downstream
       * regex sniff for it. The route shallow-merges multiple patches if
       * several tools in the same round produce them.
       */
      metadataPatch?: Record<string, unknown>;
    }
  | { ok: false; error: string; code?: string };

/** OpenAI Chat Completions tool definition shape (function calling). */
export interface OpenAIToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
      additionalProperties?: boolean;
    };
  };
}

export interface Tool<TArgs = Record<string, unknown>> {
  /** Unique name matching the OpenAI schema `function.name`. */
  name: string;
  /** Short marketing description shown to the model. */
  description: string;
  /** OpenAI JSON-schema parameter definition. */
  schema: OpenAIToolSchema;
  /** Parse and validate raw JSON args from the model. Throw on invalid input. */
  parse: (raw: string) => TArgs;
  /** Execute the tool against the live studio. */
  execute: (args: TArgs, ctx: ToolContext) => Promise<ToolResult>;
  /**
   * True for tools that change state (triggerAgent, approveAsset, …).
   * Verbal-approval gate is applied to mutating tools only.
   */
  mutating: boolean;
}

/** Helper to produce ok results with optional human summary. */
export function ok(data: unknown, summary?: string): ToolResult {
  return summary ? { ok: true, data, summary } : { ok: true, data };
}

/**
 * TD-25 P4 (2026-05-22): helper for tools that need to attach a metadata
 * patch to the persisted assistant turn (e.g. `markAwaitingDirector`).
 * The route's runTool() shallow-merges the patch into turn.metadata.
 */
export function okWithPatch(
  data: unknown,
  metadataPatch: Record<string, unknown>,
  summary?: string,
): ToolResult {
  return summary
    ? { ok: true, data, summary, metadataPatch }
    : { ok: true, data, metadataPatch };
}

export function fail(error: string, code?: string): ToolResult {
  return code ? { ok: false, error, code } : { ok: false, error };
}
