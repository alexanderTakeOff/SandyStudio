import { describe, expect, it } from 'vitest';
import {
  buildHarnessInvocation,
  consumeCodexJsonEvent,
  nextProviderSessions,
  providerSessionId,
  sanitizeSubscriptionEnv,
  type CodexJsonState,
} from '../../../lib/concierge/mind-harness';

const PATHS = {
  cloneWebapp: 'C:\\SandyStudio-polina\\webapp',
  roleFile: 'C:\\SandyStudio-polina\\webapp\\roles\\polina.md',
  claudeSettingsFile: 'C:\\SandyStudio-polina\\.claude\\polina-settings.json',
  studioFilmsDir: 'C:\\SandyStudio\\FILMS',
  allowedClaudeTools: 'Bash,PowerShell,Read',
};

describe('mind harness adapters', () => {
  it('оставляет существующий Claude CLI-контракт без изменений', () => {
    const invocation = buildHarnessInvocation(
      { provider: 'claude-code', model: 'opus' },
      'claude-session',
      PATHS,
    );

    expect(invocation.command).toBe('claude');
    expect(invocation.args).toEqual([
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--model', 'opus',
      '--allowedTools', PATHS.allowedClaudeTools,
      '--append-system-prompt-file', PATHS.roleFile,
      '--resume', 'claude-session',
      '--settings', PATHS.claudeSettingsFile,
    ]);
  });

  it('стартует Terra через подписочный codex exec с JSONL и гейтами', () => {
    const invocation = buildHarnessInvocation(
      { provider: 'codex', model: 'gpt-5.6-terra' },
      null,
      PATHS,
    );

    expect(invocation.command).toBe('codex');
    expect(invocation.args).toEqual([
      'exec',
      '--json',
      '--model', 'gpt-5.6-terra',
      '--approve-for-me',
      '--dangerously-bypass-hook-trust',
      '-c', 'sandbox_workspace_write.network_access=true',
      '--add-dir', PATHS.studioFilmsDir,
      '-C', PATHS.cloneWebapp,
      '-',
    ]);
  });

  it('возобновляет только Codex-сессию этого треда', () => {
    const invocation = buildHarnessInvocation(
      { provider: 'codex', model: 'gpt-5.6-terra' },
      'codex-thread',
      PATHS,
    );

    expect(invocation.args).toEqual([
      'exec', 'resume',
      '--json',
      '--model', 'gpt-5.6-terra',
      '--dangerously-bypass-hook-trust',
      '-c', 'sandbox_workspace_write.network_access=true',
      'codex-thread',
      '-',
    ]);
  });

  it('не передаёт API-ключи в подписочные harness-процессы', () => {
    const env = sanitizeSubscriptionEnv({
      NODE_ENV: 'test',
      OPENAI_API_KEY: 'secret-openai',
      CODEX_API_KEY: 'secret-codex',
      ANTHROPIC_API_KEY: 'secret-anthropic',
      RUN_EPISODE_ID: 'episode',
    });

    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.CODEX_API_KEY).toBeUndefined();
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.RUN_EPISODE_ID).toBe('episode');
  });

  it('не пытается resume-нуть Claude session id в Codex', () => {
    expect(
      providerSessionId(
        { session_id: 'legacy-claude', provider: 'claude-code' },
        'codex',
      ),
    ).toBeNull();
    expect(
      providerSessionId(
        {
          session_id: 'current-codex',
          provider: 'codex',
          session_ids: { 'claude-code': 'claude-id', codex: 'codex-id' },
        },
        'claude-code',
      ),
    ).toBe('claude-id');
  });

  it('сохраняет legacy Claude-память при первом переключении на Codex', () => {
    expect(
      nextProviderSessions(
        { session_id: 'legacy-claude' },
        'codex',
        'new-codex',
      ),
    ).toEqual({
      'claude-code': 'legacy-claude',
      codex: 'new-codex',
    });
  });

  it('читает thread, финальный текст и usage из Codex JSONL', () => {
    let state: CodexJsonState = {};
    state = consumeCodexJsonEvent(state, {
      type: 'thread.started',
      thread_id: 'thread-1',
    });
    state = consumeCodexJsonEvent(state, {
      type: 'item.completed',
      item: { id: 'item-1', type: 'agent_message', text: 'Готово.' },
    });
    state = consumeCodexJsonEvent(state, {
      type: 'turn.completed',
      usage: { input_tokens: 1000, cached_input_tokens: 800, output_tokens: 50 },
    });

    expect(state).toMatchObject({
      sessionId: 'thread-1',
      finalText: 'Готово.',
      contextTokens: 1000,
      inputTokens: 1000,
      cachedInputTokens: 800,
      outputTokens: 50,
      isError: false,
    });
  });
});
