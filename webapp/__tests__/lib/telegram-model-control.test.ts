import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MODEL_CALLBACK_PREFIX,
  modelChoiceFromCallback,
  modelChoiceFromText,
  modelKeyboard,
  modelStatusText,
} from '../../lib/telegram/model-control';

describe('Telegram /model uses the shared Polina catalog', () => {
  it('accepts short aliases and full model ids', () => {
    expect(modelChoiceFromText('terra')).toMatchObject({
      provider: 'codex',
      model: 'gpt-5.6-terra',
    });
    expect(modelChoiceFromText('gpt-5.6-sol')).toMatchObject({
      provider: 'codex',
      model: 'gpt-5.6-sol',
    });
    expect(modelChoiceFromText('opus')).toMatchObject({
      provider: 'claude-code',
      model: 'opus',
    });
    expect(modelChoiceFromText('unknown')).toBeNull();
  });

  it('builds at most two buttons per row and marks the selected model', () => {
    const keyboard = modelKeyboard('codex:gpt-5.6-terra');
    expect(keyboard.flat()).toHaveLength(5);
    expect(keyboard.every((row) => row.length <= 2)).toBe(true);
    expect(keyboard.flat().find((b) => b.callback_data.endsWith('gpt-5.6-terra'))?.text)
      .toContain('✓');
    for (const button of keyboard.flat()) {
      expect(button.callback_data.startsWith(MODEL_CALLBACK_PREFIX)).toBe(true);
      expect(button.callback_data.length).toBeLessThanOrEqual(64);
    }
  });

  it('parses only callbacks that point to a live catalog runner', () => {
    expect(modelChoiceFromCallback('model:codex:gpt-5.6-luna')).toMatchObject({
      provider: 'codex',
      model: 'gpt-5.6-luna',
    });
    expect(modelChoiceFromCallback('model:openai:gpt-5.5')).toBeNull();
    expect(modelChoiceFromCallback('031')).toBeNull();
  });

  it('shows selected and last executed separately', () => {
    expect(
      modelStatusText(
        { provider: 'codex', model: 'gpt-5.6-terra' },
        { provider: 'claude-code', model: 'opus' },
      ),
    ).toContain('выбрано: Подписка OpenAI · Terra');
    expect(
      modelStatusText(
        { provider: 'codex', model: 'gpt-5.6-terra' },
        { provider: 'claude-code', model: 'opus' },
      ),
    ).toContain('последний ход: Подписка · Opus');
  });

  it('wires model callbacks before generic question-button forwarding', () => {
    const source = readFileSync(resolve(process.cwd(), 'scripts', 'telegram-bot.ts'), 'utf8');
    expect(source).toContain("case '/model'");
    expect(source).toContain('setConciergeProviderOverride');
    const modelBranch = source.indexOf('modelChoiceFromCallback(code)');
    const genericForward = source.indexOf("sayToMind(state, code, { via: 'button' })");
    expect(modelBranch).toBeGreaterThan(-1);
    expect(genericForward).toBeGreaterThan(modelBranch);
  });
});
