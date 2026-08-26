/**
 * Утверждение лимитов эпизода С ПУЛЬТА.
 *
 * ПОЧЕМУ ЭТО ЕСТЬ (Директор, 26.08). Гейт траты требует трёх вещей —
 * утверждённого бюджета, потолка и настроек генерации, — и ставились они только
 * в Episode Settings, то есть за компьютером. Директор уходит, работа упирается
 * в гейт и стоит до его возвращения, хотя решение занимает одну строку. На пульте
 * он уже опознан белым списком чатов — то есть право у него есть, не было
 * технической возможности.
 *
 * ЧЕГО ЭТА КОМАНДА НЕ ДЕЛАЕТ: не выбирает провайдеров и качество. Настройки
 * генерации — решение о том, ЧЕМ снимать, и живут в Studio Settings (CLAUDE.md
 * §11 п.9). Пульт лишь подставляет умолчания эпизода, если их нет вовсе, и
 * говорит об этом вслух.
 */

export interface EpisodeLimitsState {
  readonly episodeCode: string;
  readonly ceiling: number | null;
  readonly spent: number;
  readonly approved: boolean;
  readonly hasGenerationConfig: boolean;
}

/** Умолчания генерации — те же, что стоят на живых эпизодах S22. */
export const DEFAULT_GENERATION_CONFIG = {
  image: { provider_id: 'openai-edits-multi', quality: 'high' },
  video: {
    provider_id: 'seedance-fal-img2vid',
    aspect_ratio: '9:16',
    resolution: '720p',
    quality_tier: 'standard',
    allow_shot_overrides: false,
  },
} as const;

/**
 * Разобрать сумму из текста команды. Принимает `25`, `$25`, `25.5`, `25,5` —
 * Директор пишет с телефона одной рукой, и запятая там ближе точки.
 */
export function parseCeiling(text: string): number | null {
  const raw = text.trim().replace(/^\$/, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(raw)) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  // Потолок выше этого — почти наверняка опечатка (лишний ноль), а цена ошибки
  // здесь измеряется в реальных деньгах.
  if (value > 500) return null;
  return value;
}

/** Строка состояния лимитов — то, что пульт печатает без аргумента. */
export function renderLimits(s: EpisodeLimitsState): string {
  const lines = [`${s.episodeCode} · лимиты`];
  lines.push(s.ceiling === null ? 'потолок: НЕ ЗАДАН' : `потолок: $${s.ceiling.toFixed(2)}`);
  lines.push(`потрачено: $${s.spent.toFixed(2)}`);
  lines.push(`бюджет утверждён: ${s.approved ? 'да' : 'НЕТ'}`);
  lines.push(`настройки генерации: ${s.hasGenerationConfig ? 'есть' : 'НЕТ'}`);
  const blocked = !s.approved || s.ceiling === null || !s.hasGenerationConfig;
  lines.push('');
  lines.push(
    blocked
      ? 'Тратить НЕЛЬЗЯ — работа стоит на гейте. Утвердить: /лимит 25'
      : 'Гейт открыт — работа может тратить.',
  );
  return lines.join('\n');
}

/** Что ответить после утверждения. */
export function renderApproved(code: string, ceiling: number, addedConfig: boolean): string {
  const lines = [`${code}: потолок $${ceiling.toFixed(2)} утверждён.`];
  if (addedConfig) {
    lines.push('Настроек генерации не было — подставил умолчания студии (gpt-image-2 · seedance 9:16 720p).');
    lines.push('Если нужны другие — поменяй в Studio Settings, они главнее.');
  }
  lines.push('Гейт открыт, работа пошла.');
  return lines.join('\n');
}
