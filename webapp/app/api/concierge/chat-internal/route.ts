// ──────────────────────────────────────────────────────────────────────────────
// app/api/concierge/chat-internal/route.ts
// TD-20.B autonomy 2026-05-20 — Polina auto-reaction endpoint.
//
// Called server-to-server by the `exec-pa-react` Inngest function when a
// non-Director turn (ambient pipeline event or claude_message from Тео)
// lands in a concierge_thread and Polina should react without waiting on
// Director input.
//
// Differs from /api/concierge/chat:
//   - No Director message in the body — invocation is triggered, not typed.
//   - No tool dispatch — auto-react is reflective only. PA can describe
//     what just happened and announce intent, but cannot fire destructive
//     tools without Director's verbal approval (which she does not have).
//   - No streaming — caller is Inngest, not a browser. Result is a single
//     persisted assistant turn that Realtime broadcasts to the UI.
//   - Anti-cascade guard: if the last turn in the thread is already an
//     assistant turn newer than ANTI_CASCADE_WINDOW_MS, skip — avoids PA
//     replying to her own freshly-published reaction.
//
// AUTH: Bearer token in `PA_INTERNAL_TOKEN`. The Inngest function holds
// the same env var; distinct from TEAM_CHAT_TOKEN so we can revoke either
// channel independently.
// ──────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import {
  createConciergeClient,
  conciergeModel,
  conciergeMaxTokensParam,
  conciergeSupportsTemperature,
  conciergeReasoningParam,
} from '@/lib/concierge/llm';
import {
  recordConciergeCost,
  isConciergeBudgetTripped,
  conciergeBudgetCapConfig,
  conciergeAutoReactEnabled,
} from '@/lib/concierge/cost';
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionAssistantMessageParam,
} from 'openai/resources/chat/completions';
import { z } from 'zod';
import { getServerEnv } from '@/lib/env';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { buildSystemPrompt } from '@/lib/concierge/system-prompt-builder';
import { getThread, loadRecentTurns, persistTurn } from '@/lib/concierge/threads';
import { resolveSkillsContext } from '@/lib/concierge/build-context';
import { TOOLS, findTool, openaiSchemas, type ToolContext } from '@/lib/concierge/tools';
import { isHardLimitTool } from '@/lib/concierge/approval-check';
import type { ConciergeMode } from '@/lib/concierge/types';
import { resolveEffectiveConciergeMode } from '@/lib/concierge/resolve-mode';
import {
  AUTO_REACT_ROUND_BACKSTOP,
  evaluateRound,
  type RoundCall,
} from '@/lib/concierge/auto-react-loop';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ANTI_CASCADE_WINDOW_MS = 10_000;
// 2026-06-25 cost trim (W4.a): auto-react only needs the recent burst + her last
// turn to react to an event, not 80 turns of (mostly tool_call/tool_result)
// history that inflated input to ~24k tokens/call. Env-overridable. Interactive
// /chat keeps its own deeper window for real Director conversations.
const RECENT_TURN_WINDOW = Math.max(
  4,
  Number(process.env.CONCIERGE_AUTO_REACT_TURN_WINDOW) || 24,
);

/**
 * Auto-react tool loop cap (goal-loop slice 1, 2026-06-23). REPLACES the old
 * 3 (strict) / 5 (bold) split, which functionally capped Polina's WORK at 3-5
 * think→act cycles → she ran out of rounds mid-task, "announced + waited", and
 * nothing woke her (the E07 hour-long stall). The cap is now a runaway BACKSTOP
 * ({@link AUTO_REACT_ROUND_BACKSTOP}): a real task ends far sooner because the
 * model returns no tool calls when done; the loop also stops on SPIN
 * (evaluateRound — duplicate mutating call or no forward progress). Strict vs
 * bold still differ in the TOOL SET exposed (read-only vs mutating), not in the
 * round count.
 */

/**
 * TD-51 (2026-05-25): read-only / analysis subset of the concierge tool
 * registry. Filtered by Tool.mutating: false. Cached at module load — the
 * registry is frozen and module-lived so this list never changes at runtime.
 */
const READ_ONLY_TOOL_NAMES = new Set(
  TOOLS.filter((t) => t.mutating === false).map((t) => t.name),
);
const READ_ONLY_TOOL_SCHEMAS = openaiSchemas.filter((s) =>
  READ_ONLY_TOOL_NAMES.has(s.function.name),
);

/**
 * q9 (2026-06-09): bold-mode auto-react tool surface. In Mode 3 (DELEGATED) and
 * Mode 4 (AUTOTEST) Polina may act autonomously, so auto-react exposes the
 * MUTATING tools too — EXCEPT hard limits (publish via triggerAgent EXEC-PUB,
 * skill-canon writes), which stay Director-only in every mode and are never
 * offered here. Strict modes (1 / 2 / 2.5) keep the read-only surface only.
 *
 * Cached at module load — the registry is frozen and module-lived.
 */
const BOLD_MODES: ReadonlySet<ConciergeMode> = new Set(['3', '4']);
const BOLD_TOOL_SCHEMAS = openaiSchemas.filter(
  (s) => !isHardLimitTool(s.function.name),
);

const Body = z.object({
  thread_id: z.string().uuid(),
  // TD-25 P2 (2026-05-21): 'watchdog' source — re-ping after Polina's
  // prior turn left an unresolved awaiting_director_input flag.
  // 2026-06-03: 'timer' — escalation-timer + orphaned-awaiting-sweep post this
  // (typed in client.ts but missing here → silent 400s killed Polina's proactive nudges).
  source: z.enum(['ambient', 'claude_message', 'watchdog', 'timer']),
  trigger_id: z.string().min(1),
  event_type: z.string().optional(),
});

function getAuthToken(req: Request): string | null {
  const h = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

export async function POST(req: Request) {
  const expected = process.env.PA_INTERNAL_TOKEN?.trim();
  if (!expected) {
    return NextResponse.json(
      { error: 'PA_INTERNAL_TOKEN env var is not configured' },
      { status: 503 },
    );
  }
  const presented = getAuthToken(req);
  if (!presented || presented !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid body', detail: err instanceof Error ? err.message : 'unknown' },
      { status: 400 },
    );
  }

  const env = getServerEnv();
  if (!env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OPENAI_API_KEY missing' }, { status: 503 });
  }

  const supabase = createSupabaseServiceRoleClient();

  // Verify the thread exists and is open before doing any expensive work.
  const thread = await getThread(supabase, parsed.thread_id);
  if (!thread) {
    return NextResponse.json({ skipped: 'thread_not_found' }, { status: 200 });
  }
  if (thread.ended_at) {
    return NextResponse.json({ skipped: 'thread_ended' }, { status: 200 });
  }

  const recentTurns = await loadRecentTurns(supabase, parsed.thread_id, RECENT_TURN_WINDOW);

  // Anti-cascade guard: if the last turn is already an assistant turn newer
  // than ANTI_CASCADE_WINDOW_MS, PA just spoke — don't pile on. This
  // protects against tool-fired-event-fired-PA-fired-tool storms.
  //
  // F4 (2026-06-12, E07 smoke): FAILURES bypass the guard. During an active
  // batch Polina narrates constantly, so an agent_failed landing right after
  // her turn was swallowed as `recent_assistant_turn` — the Director learned
  // about the dead Designer 20 minutes later by looking himself. A failure
  // must always produce a reaction; the per-bucket debounce in exec-pa-react
  // still caps the rate.
  // 2026-06-22 (Director): a direct team-chat message addressed to Polina is a
  // direct order from her producer (Pascal / AI EP) — she MUST always react to
  // it, even if she just spoke, and she must obey + reply (it looked rude /
  // broken that she ignored Pascal). Fetch the actual message so we can inject
  // its content + an obey-and-acknowledge directive below, and let it bypass
  // the anti-cascade guard like a failure does.
  const isDirectAddress = parsed.source === 'claude_message';
  let directMessage: { author: string; content: string; authorized: boolean } | null = null;
  if (isDirectAddress) {
    const { data: trig } = await supabase
      .from('concierge_turns')
      .select('content, metadata')
      .eq('id', parsed.trigger_id)
      .maybeSingle();
    if (trig) {
      const meta = ((trig as { metadata?: unknown }).metadata ?? {}) as {
        author?: unknown;
        authorized_principal?: unknown;
      };
      const rawContent =
        typeof (trig as { content?: unknown }).content === 'string'
          ? ((trig as { content: string }).content)
          : '';
      // Strip the persisted "**Author:** " prefix so the model reads the order cleanly.
      const cleaned = rawContent.replace(/^\*\*[^*]+:\*\*\s*/, '').trim();
      directMessage = {
        author: typeof meta.author === 'string' ? meta.author : 'Pascal',
        content: cleaned,
        authorized: meta.authorized_principal === true,
      };
    }
  }

  const isFailureTrigger = parsed.event_type === 'agent_failed';
  const lastTurn = recentTurns[recentTurns.length - 1];
  if (!isFailureTrigger && !isDirectAddress && lastTurn && lastTurn.role === 'assistant') {
    const lastTs = new Date(lastTurn.created_at).getTime();
    if (Number.isFinite(lastTs) && Date.now() - lastTs < ANTI_CASCADE_WINDOW_MS) {
      return NextResponse.json({ skipped: 'recent_assistant_turn' }, { status: 200 });
    }
  }

  // ── Auto-react harness (2026-06-25) ──────────────────────────────────────────
  // The autonomous loop is gated by two PROVIDER-INDEPENDENT reins, in order:
  //   1. master kill-switch — CONCIERGE_AUTO_REACT_ENABLED=false fully disarms the
  //      loop (the visible header flag). Director chat (claude_message + /chat) is
  //      never gated, so disarming the loop never silences the Director's PA.
  //   2. rolling-window breaker — trips on call-COUNT (universal) or $ spend.
  // Direct messages (claude_message) are deliberate, low-volume Director/AI-EP
  // orders — let those through; the interactive /chat route is never gated.
  if (parsed.source !== 'claude_message') {
    if (!conciergeAutoReactEnabled()) {
      return NextResponse.json({ skipped: 'auto_react_disabled' }, { status: 200 });
    }
    const cap = conciergeBudgetCapConfig();
    const status = await isConciergeBudgetTripped(supabase, cap);
    if (status.tripped) {
      const alreadyNotified =
        lastTurn?.role === 'assistant' &&
        !!(lastTurn.metadata as { concierge_budget_tripped?: unknown } | null)
          ?.concierge_budget_tripped;
      // Honest limb attribution: which rein tripped (count vs $).
      const limb =
        status.reason === 'calls'
          ? `${status.calls} авто-реакт вызовов (cap ${status.maxCalls})`
          : `расход $${status.spent.toFixed(2)} (cap $${cap.capUsd})`;
      if (!alreadyNotified) {
        await persistTurn(supabase, parsed.thread_id, {
          role: 'assistant',
          event_type: 'message',
          content:
            `⚠️ Авто-реакт приостановлен: за ${cap.windowHours}ч достигнут предел — ${limb}. ` +
            `Жду Директора — поднять лимит (CONCIERGE_AUTO_REACT_MAX_CALLS / ` +
            `CONCIERGE_DAILY_CAP_USD) или разобрать причину всплеска.`,
          metadata: {
            awaiting_director_input: {
              question: `Concierge auto-react fence tripped (${limb} per ${cap.windowHours}h). Raise the limit or investigate the spike?`,
              deadline_sec: 3600,
              source: 'markAwaitingDirector',
            },
            concierge_budget_tripped: true,
          },
        });
      }
      return NextResponse.json(
        {
          skipped: 'concierge_budget_tripped',
          reason: status.reason,
          spent: status.spent,
          cap: status.cap,
          calls: status.calls,
          maxCalls: status.maxCalls,
        },
        { status: 200 },
      );
    }
  }

  // Resolve the episode in focus: the thread's pinned episode first, else the
  // episode that owns the triggering activity event (ambient pipeline reaction).
  let episodeId: string | null = thread.episode_id ?? null;
  let episodeCode: string | null = null;
  if (!episodeId && parsed.source === 'ambient') {
    const { data: evt } = await supabase
      .from('activity_events')
      .select('episode_id')
      .eq('id', parsed.trigger_id)
      .maybeSingle();
    episodeId = (evt as { episode_id?: string | null } | null)?.episode_id ?? null;
  }
  // Resolve episodeCode for display in system prompt (helps Polina see which episode)
  if (episodeId) {
    const { data: ep } = await supabase
      .from('episodes')
      .select('episode_code')
      .eq('id', episodeId)
      .maybeSingle();
    episodeCode = (ep as { episode_code?: string | null } | null)?.episode_code ?? null;
  }

  // q13 (2026-06-15): single source of truth — episode.governance_mode (override)
  // layered over the global default. Shared with the interactive chat + auto-react
  // routes so every concierge surface reports the SAME mode the pipeline runs under
  // (was: per-route inline reads that drifted — see lib/concierge/resolve-mode.ts).
  const mode: ConciergeMode = await resolveEffectiveConciergeMode(supabase, episodeId);
  const nextGate: string | null = thread.active_gate ?? null;
  const today = new Date().toISOString().slice(0, 10);

  const { availablePlaybooks } = await resolveSkillsContext(supabase, episodeId);

  const model = conciergeModel();
  const temperature = env.OPENAI_TEMPERATURE ? Number(env.OPENAI_TEMPERATURE) : 0.2;
  // W5 (2026-06-25): auto-react replies are short (name artifact + status + next
  // step). Cap output at 800 (Opus output is $75/M) instead of the 8000 the
  // interactive path uses. Env-overridable.
  const maxCompletionTokens = Number(process.env.CONCIERGE_AUTO_REACT_MAX_TOKENS) || 800;
  const reasoningEffort = env.OPENAI_REASONING_EFFORT as
    | 'minimal'
    | 'low'
    | 'medium'
    | 'high'
    | undefined;
  const isGpt5 = /^gpt-5(\.|-|$)/.test(model);

  const systemPrompt = buildSystemPrompt({
    today,
    mode,
    episodeId,
    nextGate,
    recentTurns,
    modelId: model,
    availablePlaybooks,
    autoReact: true,
  });

  // Synthetic user message that names what triggered the reaction. Anchors
  // the model's attention since pure system-prompt-only calls can be hit
  // and miss with gpt-5.* on long threads.
  const directAuthor = directMessage?.author ?? 'Pascal';
  const triggerLabel =
    parsed.source === 'ambient'
      ? `[autonomous trigger] pipeline event ${parsed.event_type ?? 'unknown'} (activity_event ${parsed.trigger_id})`
      : parsed.source === 'watchdog'
        ? `[autonomous trigger] **OPEN-LOOP WATCHDOG re-ping** — your prior turn (${parsed.trigger_id}) had awaiting_director_input set but nothing has resolved it for >90s. Director may have missed your question or you may need to take the next concrete step yourself.`
        : `[DIRECT MESSAGE TO YOU] ${directAuthor}${directMessage?.authorized ? ' (your Executive Producer, acting under delegated Director authority)' : ''} just wrote to you:\n\n«${directMessage?.content ?? '(see the latest team-chat turn above)'}»`;

  // TD-51 (2026-05-25): per-source tool policy.
  // - watchdog: still no tools. Goal is re-prompting Director, not acting.
  //             Director must see Polina's re-ping as a text message, not a
  //             tool-call burst.
  // - ambient (agent_completed / agent_failed / approval_revision / etc) +
  //   claude_message: read-only / analysis tools allowed (getAsset,
  //   getRecentActivityEvents, getCriticVerdict, getAnimatorCriticVerdict,
  //   getGagVerdict, listShots, etc). Mutating tools (triggerAgent,
  //   approveAsset, requestRevision, regenerate*) remain blocked at the
  //   per-tool guard — Polina may "suggest" them in her text response, and
  //   Director invokes via the next Director turn.
  const allowTools = parsed.source !== 'watchdog';
  // q9: in bold modes (3 DELEGATED / 4 AUTOTEST) Polina may ACT autonomously —
  // expose + permit the mutating tools (minus hard limits). Strict modes keep
  // the read-only surface and the propose-don't-act instruction.
  const boldMode = BOLD_MODES.has(mode);
  const userInstruction = !allowTools
    ? 'Read your prior assistant turn (above). Either (a) take the next concrete sub-step yourself if the original Director directive logically covers it — don\'t wait for new approval; or (b) re-ask Director more explicitly with a fresh q-format question and a tighter framing. Do not just echo your previous wait. Do not request tools.'
    : isDirectAddress
      ? [
          `${directAuthor} addressed you DIRECTLY (message above). This is a direct instruction from your Executive Producer — treat it as the authoritative next task, ahead of your own work-plan reading.`,
          `FIRST: acknowledge ${directAuthor} by name in one short line.`,
          boldMode
            ? `THEN EXECUTE exactly what the message asks as your next concrete tool action(s) NOW. You are in Mode ${mode} with delegated authority — do NOT wait for a separate Director token. If it names a shot_key and tools (approveAsset / triggerAgent / etc.), call them THIS turn. Do not merely read getWorkPlan and stop.`
            : `THEN, because you are in Mode ${mode} (not a bold/delegated mode), you cannot fire mutating tools yourself — state that explicitly to ${directAuthor} and propose the exact action for the Director to confirm.`,
          'NEVER re-generate a shot that already has a video — one render per shot; re-generation only on an explicit Director decision after visual review.',
          'HARD LIMITS (publish, LOCK, budget, governance mode, skill-canon) stay Director-only in every mode — if one is asked for, propose it instead of firing it.',
          `END with a SHORT reply to ${directAuthor}: what you just did (or will do) and the single next step.`,
        ].join('\n')
      : boldMode
      ? [
          `Run the [WORK_PLAN] loop (reconcile → advance → act). Recap what just happened in this thread (read the recent turns above). You are in Mode ${mode} (DELEGATED/AUTOTEST) — you have delegated authority to ACT now without waiting for a fresh Director token.`,
          '',
          'You MAY call READ-ONLY tools to inspect the artifact, AND MUTATING tools to ACT (triggerAgent, approveAsset, requestRevision, regenerate*, etc.) when the next step is clear. Judge done-ness from REAL status (APPROVED = done; REVISION / REVISE / FAIL = blocked-pending-rework), not from events. The cost ceiling still backstops spend; surface your decisions for Director awareness.',
          '',
          'After you act, MARK THE STEP DONE via updateWorkPlan and move to the next concrete step — keep the plan current. If the SAME step has failed or stalled across repeated attempts, do NOT keep retrying: call markAwaitingDirector with a one-line summary of what was tried and why it is stuck.',
          '',
          'HARD LIMITS remain Director-only in every mode and are NOT available to you: publishing (triggerAgent EXEC-PUB), marking LOCKED, changing budget, changing governance mode, and skill-canon writes. If one of those is the right step, propose it for the Director instead.',
          '',
          'After your tool calls, produce a SHORT final text: name the artifact, the action you took (or recommend, for a hard limit), and 1-3 observations.',
        ].join('\n')
      : [
          'Run the [WORK_PLAN] loop (reconcile → advance → report). Recap what just happened in this thread (read the recent turns above), then decide whether to ACT now or WAIT for Director.',
          '',
          'You MAY call READ-ONLY and ANALYSIS tools to inspect the artifact this event references (getAsset, getRecentActivityEvents, getCriticVerdict, getAnimatorCriticVerdict, listShots, listPendingApprovals, etc). Use them when the event references an asset_id you have not yet read — silent-stall is worse than a tool call. JUDGE DONE-NESS FROM REAL STATUS, not from the presence/absence of events: an asset is DONE only when APPROVED; a REVISION status or REVISE/FAIL verdict is blocked-pending-rework, NOT "still working". Never report "still in progress" without having read the artifact status this turn.',
          '',
          'You MUST NOT call MUTATING tools (triggerAgent, approveAsset, requestRevision, regenerateRefPlan, regenerateImageFromPlan, regenerateShotPlan, enrichBible, setBibleContent, createSeries, createEpisode, editBrief, copyAssetImage, proposeSkill, updateSkill, approveSkill). Those require explicit Director approval. If a mutation is the right next step, propose it in your text response and let Director invoke it.',
          '',
          'After your tool calls (if any), produce a SHORT final text: name the artifact, give its REAL status/verdict, list 1-3 concrete observations, and state the SINGLE concrete next step — either (a) the one approve/revise/regen action you need the Director to invoke, or (b) why no action is possible yet. Do not narrate the whole episode.',
        ].join('\n');

  const conversation: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `${triggerLabel}\n\n${userInstruction}`,
    },
  ];

  // ── Tool execution context.
  //   Strict modes (1/2/2.5): read-only/analysis only — mutating tools are
  //   blocked at the per-tool guard. No cookie, no service token.
  //   Bold modes (3/4): q9 — mutating tools (minus hard limits) are permitted.
  //   Auto-react has no Director cookie, so mutating tools authenticate to the
  //   Director-only routes via the EXEC_DIR_AI_TOKEN bearer (authHeader). The
  //   token resolves to a synthetic EXEC-DIR-AI principal; hard-limit routes
  //   reject it (assertHumanDirector), so it cannot publish/LOCK/budget/mode.
  const appOrigin = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const execDirAiToken = process.env.EXEC_DIR_AI_TOKEN?.trim();
  const authHeader =
    boldMode && execDirAiToken ? `Bearer ${execDirAiToken}` : null;
  const toolCtx: ToolContext = {
    supabase,
    threadId: parsed.thread_id,
    mode,
    episodeId,
    episodeCode,
    cookieHeader: null,
    authHeader,
    appOrigin,
    recentTurns,
  };

  const client = createConciergeClient();
  let assistantText = '';

  // ── TD-51 (2026-05-25) tool-call loop ────────────────────────────────────
  // Per-round shape mirrors /api/concierge/chat#L342-L443 but trimmed: no
  // streaming, no metadata patches, no per-tool timeout (auto-react is
  // server-to-server and not Director-facing — slow tools just slow the
  // batch). Last round force-disables tools so the model produces a final
  // text response instead of looping.
  let roundCount = 0;
  const maxRounds = AUTO_REACT_ROUND_BACKSTOP;
  // Spin guard state, threaded across rounds (see lib/concierge/auto-react-loop).
  const seenToolSigs = new Set<string>();
  const spinState = { noProgress: 0 };
  let stalledReason: string | null = null;
  let cutoff = false;
  let prevRoundActed = false;
  try {
    for (let round = 0; round < maxRounds; round++) {
      roundCount = round + 1;
      const isLastRound = round === maxRounds - 1;
      // q9: bold modes (3/4) expose mutating tools (minus hard limits) so Polina
      // can ACT; strict modes keep the read-only surface.
      const roundSchemas = boldMode ? BOLD_TOOL_SCHEMAS : READ_ONLY_TOOL_SCHEMAS;
      const toolsThisRound = allowTools && !isLastRound ? [...roundSchemas] : undefined;

      const params: ChatCompletionCreateParamsNonStreaming = {
        model,
        messages: conversation,
        ...conciergeMaxTokensParam(maxCompletionTokens),
        stream: false,
        tools: toolsThisRound,
        tool_choice: toolsThisRound ? 'auto' : undefined,
      };
      if (!isGpt5 && conciergeSupportsTemperature() && Number.isFinite(temperature)) {
        params.temperature = temperature;
      }
      // gpt-5* rejects tools + reasoning_effort combination — only pass
      // reasoning_effort on tool-disabled rounds (mirror main /chat).
      if (reasoningEffort && isGpt5 && !toolsThisRound) {
        (params as { reasoning_effort?: string }).reasoning_effort = reasoningEffort;
      }
      // 2026-06-25 $-fix: cap Opus extended thinking on EVERY round (returns {}
      // for non-anthropic). This is the single biggest per-call cost lever — the
      // root cause was Opus running UNCAPPED thinking because the isGpt5 gate
      // above dropped reasoning_effort for claude-*.
      Object.assign(params, conciergeReasoningParam());

      const completion = await client.chat.completions.create(params);
      if (Symbol.asyncIterator in (completion as object)) {
        throw new Error('expected non-streaming completion');
      }
      // Record this call's tokens+cost (best-effort, fire-and-forget). Was
      // previously UNTRACKED — the reason the Opus drain was invisible.
      const usage = (completion as {
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      }).usage;
      if (usage) {
        void recordConciergeCost(supabase, {
          model,
          usage: {
            promptTokens: usage.prompt_tokens ?? 0,
            completionTokens: usage.completion_tokens ?? 0,
          },
          source: 'auto_react',
          episodeId,
        });
      }
      const msg = (completion as {
        choices: Array<{ message: ChatCompletionAssistantMessageParam }>;
      }).choices[0]?.message;
      if (!msg) break;

      const toolCalls = msg.tool_calls ?? [];

      if (toolCalls.length === 0) {
        // Final text from the model — exit the loop. If this is the forced
        // tools-disabled last round AND she was still acting the round before,
        // she was CUT OFF mid-task (not naturally done) → escalate below.
        const text = typeof msg.content === 'string' ? msg.content.trim() : '';
        assistantText = text;
        if (isLastRound && prevRoundActed) cutoff = true;
        break;
      }

      // Spin guard (goal-loop slice 1): stop BEFORE executing a duplicate
      // mutating call (= duplicate generation = wasted spend) or after several
      // rounds with no forward progress. Her LLM rounds are not budget-tracked,
      // so this is the runaway bound at the working end of the loop.
      const verdict = evaluateRound(
        toolCalls.map(
          (c): RoundCall => ({
            name: c.function.name,
            argsJson: c.function.arguments,
            mutating: !READ_ONLY_TOOL_NAMES.has(c.function.name),
          }),
        ),
        seenToolSigs,
        spinState,
      );
      if (verdict.stop) {
        stalledReason = verdict.reason;
        break;
      }

      // Persist the intermediate tool_call turn so Director's UI shows the
      // chips and the audit trail matches Director-turn flow.
      await persistTurn(supabase, parsed.thread_id, {
        role: 'assistant',
        event_type: 'tool_call',
        content: toolCalls
          .map((c) => `🔧 ${c.function.name}(${truncateForLog(c.function.arguments ?? '', 120)})`)
          .join('\n'),
        metadata: {
          model,
          auto_react: true,
          source: parsed.source,
          trigger_id: parsed.trigger_id,
          tool_calls: toolCalls.map((c) => ({
            id: c.id,
            name: c.function.name,
            arguments: c.function.arguments,
          })),
        },
      });

      // OpenAI protocol: the assistant message with tool_calls must precede
      // its matching tool result messages.
      conversation.push({
        role: 'assistant',
        content: msg.content ?? null,
        tool_calls: toolCalls,
      });

      // Execute tools sequentially. Read-only / analysis only — mutating
      // tools are rejected by the per-tool guard with a structured error
      // the model can read in the next round.
      for (const call of toolCalls) {
        const result = await runAutoReactTool(call, toolCtx);
        const resultJson = JSON.stringify(result);

        await persistTurn(supabase, parsed.thread_id, {
          role: 'tool',
          event_type: 'tool_result',
          content: truncateForLog(resultJson, 700),
          metadata: {
            ok: result.ok,
            tool_name: call.function.name,
            tool_call_id: call.id,
            auto_react: true,
          },
        });

        conversation.push({
          role: 'tool',
          tool_call_id: call.id,
          content: resultJson,
        });
      }
      prevRoundActed = true;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown OpenAI error';
    return NextResponse.json({ error: 'openai_failed', detail: message }, { status: 502 });
  }

  // Stall / cut-off escalation (goal-loop slice 1): if the loop ended because of
  // the runaway backstop or the spin guard — NOT because the model finished —
  // surface a VISIBLE blocker instead of the old silent "announce + sleep".
  // Persisting a turn with metadata.awaiting_director_input arms the existing
  // pa-escalation-timer (threads.ts → sandystudio/pa/awaiting-set), so Director
  // sees the question and a re-wake fires if it goes unanswered.
  if (stalledReason || cutoff) {
    const note = stalledReason
      ? `Остановилась: ${stalledReason}. Нужно решение Директора, чтобы продолжить к цели.`
      : `Уперлась в предохранитель цикла (${maxRounds} раундов) с незавершённой задачей — нужно решение/уточнение Директора.`;
    const content =
      assistantText && assistantText.trim().length > 0 ? assistantText.trim() : note;
    await persistTurn(supabase, parsed.thread_id, {
      role: 'assistant',
      event_type: 'message',
      content,
      metadata: {
        auto_react: true,
        source: parsed.source,
        trigger_id: parsed.trigger_id,
        event_type: parsed.event_type ?? null,
        tool_rounds: roundCount,
        stalled_reason: stalledReason ?? 'round_backstop',
        awaiting_director_input: {
          question: note,
          deadline_sec: 90,
          source: 'loop_guard',
        },
      },
    });
    return NextResponse.json(
      {
        ok: true,
        thread_id: parsed.thread_id,
        stalled: stalledReason ?? 'round_backstop',
        tool_rounds: roundCount,
      },
      { status: 200 },
    );
  }

  if (!assistantText) {
    return NextResponse.json({ skipped: 'empty_response', rounds: roundCount }, { status: 200 });
  }

  await persistTurn(supabase, parsed.thread_id, {
    role: 'assistant',
    event_type: 'message',
    content: assistantText,
    metadata: {
      auto_react: true,
      source: parsed.source,
      trigger_id: parsed.trigger_id,
      event_type: parsed.event_type ?? null,
      tool_rounds: roundCount,
    },
  });

  return NextResponse.json({
    ok: true,
    thread_id: parsed.thread_id,
    chars: assistantText.length,
    tool_rounds: roundCount,
  });
}

/**
 * TD-51 (2026-05-25): execute one tool call in auto-react context.
 *
 * q9 (2026-06-09): mode-aware. In STRICT modes (1/2/2.5) mutating tools stay
 * hard-blocked (Polina proposes, Director invokes). In BOLD modes (3/4) Polina
 * MAY fire mutating tools autonomously — EXCEPT hard limits (publish via
 * triggerAgent EXEC-PUB, skill-canon writes), which `gateMutation` inside each
 * tool already blocks. We parse args BEFORE the mutating decision so the
 * triggerAgent EXEC-PUB hard limit can be detected here too (defence-in-depth).
 */
async function runAutoReactTool(
  call: ChatCompletionMessageToolCall,
  ctx: ToolContext,
): Promise<
  | { ok: true; data: unknown; summary?: string }
  | { ok: false; error: string; code?: string }
> {
  const tool = findTool(call.function.name);
  if (!tool) {
    return { ok: false, error: `unknown tool: ${call.function.name}` };
  }

  let args: Record<string, unknown>;
  try {
    args = tool.parse(call.function.arguments ?? '{}') as Record<string, unknown>;
  } catch (e) {
    return { ok: false, error: `parse error: ${(e as Error).message}` };
  }

  if (tool.mutating) {
    const bold = ctx.mode === '3' || ctx.mode === '4';
    // Hard limits are never auto-runnable (any mode). gateMutation inside the
    // tool is the real gate; this is an early, explicit refusal for clarity.
    if (isHardLimitTool(tool.name, args)) {
      return {
        ok: false,
        error: `tool "${tool.name}" is a HARD LIMIT (Publish / LOCK / Budget / Mode per CLAUDE.md §6) — Director-only in every mode. Recommend it in your text response instead.`,
        code: 'auto_react_hard_limit_blocked',
      };
    }
    if (!bold) {
      return {
        ok: false,
        error: `tool "${tool.name}" is MUTATING — blocked in auto-react context for Mode ${ctx.mode}. Suggest the action in your text response so Director can invoke it on the next turn.`,
        code: 'auto_react_mutating_blocked',
      };
    }
    // Bold mode: fall through and execute. The tool's own gateMutation will
    // auto-pass it (non-hard-limit in mode 3/4) and the budget ceiling backs
    // cost. Auth to Director-only routes uses ctx.authHeader (EXEC-DIR-AI token).
  }

  try {
    const result = await tool.execute(args, ctx);
    return result;
  } catch (e) {
    return { ok: false, error: `execute error: ${(e as Error).message}` };
  }
}

function truncateForLog(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}… [${s.length - max} more chars]`;
}
