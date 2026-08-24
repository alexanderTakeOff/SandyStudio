import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { firstCommandArgument } from '../../lib/telegram/commands';

describe('Telegram command routing', () => {
  it('/e takes only the first token even when quoted history follows', () => {
    const pasted = `/e SS-S20-E08

[24.08.2026 19:43] Alexander: previous message
[24.08.2026 19:49] Alexander: another message`;

    expect(firstCommandArgument(pasted)).toBe('SS-S20-E08');
  });

  it('returns an empty argument for a bare command', () => {
    expect(firstCommandArgument('/e')).toBe('');
  });

  it('wires /e to the first-token helper', () => {
    const source = readFileSync(resolve(process.cwd(), 'scripts', 'telegram-bot.ts'), 'utf8');
    expect(source).toContain('const episodeArg = firstCommandArgument(text)');
    expect(source).toContain('episodeByCode(episodeArg)');
  });
});
