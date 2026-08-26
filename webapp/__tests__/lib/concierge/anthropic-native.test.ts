// Legacy API helper: the live Polina catalog is subscription-harness-only now,
// but direct callers still need the suffix stripped correctly.
import { describe, it, expect } from 'vitest';
import { resolveModel } from '@/lib/concierge/anthropic-native';

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
});
