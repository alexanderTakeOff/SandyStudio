// Окно 1M — отдельная строка каталога (`-1m` суффикс), не свойство модели.
// Без этого теста рассинхрон каталога и resolveModel молчал бы: неверный
// суффикс ушёл бы на API как часть имени модели и упал 400-й без объяснения,
// откуда взялась «claude-opus-4-8-1m» в сообщении об ошибке.
import { describe, it, expect } from 'vitest';
import { resolveModel } from '@/lib/concierge/anthropic-native';
import { CONCIERGE_PROVIDER_CATALOG } from '@/lib/api/concierge-provider-config';

describe('resolveModel: суффикс 1M-окна', () => {
  it('модель без суффикса — окно не запрошено, имя не тронуто', () => {
    expect(resolveModel('claude-opus-4-8')).toEqual({
      apiModel: 'claude-opus-4-8',
      contextWindow1m: false,
    });
  });

  it('модель с суффиксом -1m — окно запрошено, суффикс снят для API-имени', () => {
    expect(resolveModel('claude-opus-4-8-1m')).toEqual({
      apiModel: 'claude-opus-4-8',
      contextWindow1m: true,
    });
  });

  it('в каталоге строка [1m] действительно резолвится в валидное API-имя модели', () => {
    const entry = CONCIERGE_PROVIDER_CATALOG.find((o) => o.id === 'anthropic:claude-opus-4-8-1m');
    expect(entry).toBeDefined();
    const { apiModel, contextWindow1m } = resolveModel(entry!.model);
    expect(contextWindow1m).toBe(true);
    // API-имя обязано совпасть с соседней НЕ-1m строкой каталога — это тот же
    // API-продукт, отличается только заголовком окна, а не идентификатором модели.
    const plain = CONCIERGE_PROVIDER_CATALOG.find((o) => o.id === 'anthropic:claude-opus-4-8');
    expect(apiModel).toBe(plain!.model);
  });
});
