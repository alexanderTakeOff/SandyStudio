import type { MindSessionMap } from './threads';

export type MindHarnessProvider = 'claude-code' | 'codex';

export interface MindHarnessChoice {
  provider: MindHarnessProvider;
  model: string;
}

export interface MindHarnessPaths {
  cloneWebapp: string;
  roleFile: string;
  claudeSettingsFile: string;
  studioFilmsDir: string;
  allowedClaudeTools: string;
}

export interface MindHarnessInvocation {
  command: 'claude' | 'codex';
  args: string[];
  apiProvider: 'anthropic' | 'openai';
  contextLimit: number;
}

const CODEX_CONTEXT_LIMIT = 1_050_000;
const CLAUDE_CONTEXT_LIMIT = 1_000_000;

/**
 * Build argv only. Process spawning stays in mind-bridge so cancellation,
 * persistence and watchdog behaviour remain one shared mechanism.
 */
export function buildHarnessInvocation(
  choice: MindHarnessChoice,
  sessionId: string | null,
  paths: MindHarnessPaths,
): MindHarnessInvocation {
  if (choice.provider === 'claude-code') {
    const args = [
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--model', choice.model,
      '--allowedTools', paths.allowedClaudeTools,
      '--append-system-prompt-file', paths.roleFile,
    ];
    if (sessionId) args.push('--resume', sessionId);
    args.push('--settings', paths.claudeSettingsFile);
    return {
      command: 'claude',
      args,
      apiProvider: 'anthropic',
      contextLimit: CLAUDE_CONTEXT_LIMIT,
    };
  }

  if (sessionId) {
    return {
      command: 'codex',
      args: [
        'exec', 'resume',
        '--json',
        '--model', choice.model,
        '--dangerously-bypass-hook-trust',
        '-c', 'sandbox_workspace_write.network_access=true',
        sessionId,
        '-',
      ],
      apiProvider: 'openai',
      contextLimit: CODEX_CONTEXT_LIMIT,
    };
  }

  return {
    command: 'codex',
    args: [
      'exec',
      '--json',
      '--model', choice.model,
      '--approve-for-me',
      '--dangerously-bypass-hook-trust',
      '-c', 'sandbox_workspace_write.network_access=true',
      '--add-dir', paths.studioFilmsDir,
      '-C', paths.cloneWebapp,
      '-',
    ],
    apiProvider: 'openai',
    contextLimit: CODEX_CONTEXT_LIMIT,
  };
}

/**
 * Subscription paths must never inherit API billing credentials, and they must keep
 * the HOUR-long prompt cache.
 *
 * The hour is a load-bearing assumption of this harness, not an optimisation: the
 * whole episode stays in ONE session precisely because hand-offs between sessions are
 * where errors are born. Until F6 we built the request ourselves and set the 1h
 * cache_control ttl by hand (measured: 56K creation -> 85K read, $0.36 -> $0.04). F6
 * handed request building to the CLI and the knob went with it, unnoticed, because the
 * assumption lived in a plan and not in a line of code. The CLI decides TTL in this
 * order: FORCE_PROMPT_CACHING_5M -> ENABLE_PROMPT_CACHING_1H -> (no subscription or
 * overage) -> an allowlist of call-sites. Setting the flag here takes the knob back and
 * survives overage, which otherwise drops every turn to the 5-minute window - shorter
 * than the Director's pauses between messages.
 */
export function sanitizeSubscriptionEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...source };
  delete env.ANTHROPIC_API_KEY;
  delete env.OPENAI_API_KEY;
  delete env.CODEX_API_KEY;
  env.ENABLE_PROMPT_CACHING_1H = '1';
  return env;
}

/**
 * Sessions are provider-scoped. The legacy scalar belongs to Claude unless a
 * provider was already stamped; this preserves every existing conversation.
 */
export function providerSessionId(
  mind: Pick<MindSessionMap, 'session_id' | 'session_ids' | 'provider'>,
  provider: MindHarnessProvider,
): string | null {
  const scoped = mind.session_ids?.[provider];
  if (typeof scoped === 'string' && scoped) return scoped;
  if (mind.provider === provider && mind.session_id) return mind.session_id;
  if (!mind.provider && provider === 'claude-code' && mind.session_id) return mind.session_id;
  return null;
}

/** Preserve the pre-migration Claude scalar before the active scalar changes. */
export function nextProviderSessions(
  mind: Pick<MindSessionMap, 'session_id' | 'session_ids' | 'provider'>,
  provider: MindHarnessProvider,
  sessionId: string | null,
): NonNullable<MindSessionMap['session_ids']> {
  const next = { ...(mind.session_ids ?? {}) };
  if (!mind.provider && mind.session_id && !next['claude-code']) {
    next['claude-code'] = mind.session_id;
  }
  next[provider] = sessionId;
  return next;
}

export interface CodexJsonState {
  sessionId?: string;
  finalText?: string;
  contextTokens?: number;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  isError?: boolean;
  error?: string;
  commandAudits?: string[];
}

/** Pure reducer for the documented `codex exec --json` event stream. */
export function consumeCodexJsonEvent(
  state: CodexJsonState,
  event: Record<string, unknown>,
): CodexJsonState {
  if (event.type === 'thread.started' && typeof event.thread_id === 'string') {
    return { ...state, sessionId: event.thread_id };
  }

  if (event.type === 'item.completed') {
    const item = (event.item ?? {}) as Record<string, unknown>;
    if (item.type === 'agent_message' && typeof item.text === 'string') {
      return { ...state, finalText: item.text };
    }
    if (item.type === 'command_execution' && typeof item.command === 'string') {
      return {
        ...state,
        commandAudits: [...(state.commandAudits ?? []), item.command.slice(0, 240)],
      };
    }
  }

  if (event.type === 'turn.completed') {
    const usage = (event.usage ?? {}) as Record<string, unknown>;
    const inputTokens = numberOrUndefined(usage.input_tokens);
    return {
      ...state,
      contextTokens: inputTokens,
      inputTokens,
      cachedInputTokens: numberOrUndefined(usage.cached_input_tokens),
      outputTokens: numberOrUndefined(usage.output_tokens),
      isError: false,
    };
  }

  if (event.type === 'turn.failed' || event.type === 'error') {
    const detail = event.error;
    const message =
      typeof detail === 'string'
        ? detail
        : detail && typeof detail === 'object' && typeof (detail as { message?: unknown }).message === 'string'
          ? String((detail as { message: string }).message)
          : 'Codex turn failed';
    return { ...state, isError: true, error: message };
  }

  return state;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
