import {
  CONCIERGE_PROVIDER_CATALOG,
  conciergeOptionId,
  type ConciergeProviderChoice,
  type ConciergeProviderOption,
} from '@/lib/api/concierge-provider-config';
import type { InlineButton } from './api';

export const MODEL_CALLBACK_PREFIX = 'model:';
const BUTTONS_PER_ROW = 2;

export function modelChoiceFromText(raw: string): ConciergeProviderOption | null {
  const needle = raw.trim().toLowerCase();
  if (!needle) return null;
  return (
    CONCIERGE_PROVIDER_CATALOG.find((option) => {
      const aliases = [
        option.id,
        option.model,
        shortModelName(option),
      ].map((value) => value.toLowerCase());
      return aliases.includes(needle);
    }) ?? null
  );
}

export function modelChoiceFromCallback(data: string): ConciergeProviderOption | null {
  if (!data.startsWith(MODEL_CALLBACK_PREFIX)) return null;
  const id = data.slice(MODEL_CALLBACK_PREFIX.length);
  return CONCIERGE_PROVIDER_CATALOG.find((option) => option.id === id) ?? null;
}

export function modelKeyboard(activeId: string | null): InlineButton[][] {
  const buttons = CONCIERGE_PROVIDER_CATALOG.map((option) => ({
    text: `${option.id === activeId ? '✓ ' : ''}${shortModelName(option)}`,
    callback_data: `${MODEL_CALLBACK_PREFIX}${option.id}`,
  }));
  const rows: InlineButton[][] = [];
  for (let i = 0; i < buttons.length; i += BUTTONS_PER_ROW) {
    rows.push(buttons.slice(i, i + BUTTONS_PER_ROW));
  }
  return rows;
}

export function modelStatusText(
  selected: ConciergeProviderChoice,
  executed?: ConciergeProviderChoice | null,
): string {
  return [
    'Модель Полины',
    `выбрано: ${modelDisplayName(selected)}`,
    `последний ход: ${executed ? modelDisplayName(executed) : 'ещё нет данных'}`,
  ].join('\n');
}

export function modelDisplayName(choice: ConciergeProviderChoice): string {
  const short = shortModelName(choice);
  return choice.provider === 'codex'
    ? `Подписка OpenAI · ${short}`
    : `Подписка · ${short}`;
}

export function modelChoiceId(choice: ConciergeProviderChoice): string {
  return conciergeOptionId(choice);
}

function shortModelName(choice: ConciergeProviderChoice): string {
  if (choice.provider === 'codex') {
    const tier = choice.model.split('-').at(-1) ?? choice.model;
    return titleCase(tier);
  }
  return titleCase(choice.model);
}

function titleCase(value: string): string {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}
