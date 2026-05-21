// Unit tests for the Polina "awaiting Director input" detector.
// TD-25 P1+P3 — 2026-05-21.

import { describe, expect, test } from 'vitest';

import { detectAwaitingDirectorInput } from '@/lib/concierge/await-detector';

describe('detectAwaitingDirectorInput', () => {
  test('returns null on empty input', () => {
    expect(detectAwaitingDirectorInput('')).toBeNull();
    expect(detectAwaitingDirectorInput('   ')).toBeNull();
  });

  test('returns null when Polina did not write a question and is not waiting', () => {
    const content = 'Готово. SH04 регенерировала, новый IMG в очереди review.';
    expect(detectAwaitingDirectorInput(content)).toBeNull();
  });

  test('detects explicit q1y/q1n yes/no question', () => {
    const content =
      'Я завершила requestRevision на SH04. Auto-retry не работает для IMG REQUEST_REVISION.\n\nq3y/q3n: запустить regenerateImage сейчас?';
    const result = detectAwaitingDirectorInput(content);
    expect(result).not.toBeNull();
    expect(result?.question).toContain('запустить regenerateImage сейчас');
    expect(result?.choices).toEqual([
      { id: 'q3y', label: 'Да' },
      { id: 'q3n', label: 'Нет' },
    ]);
  });

  test('detects multi-choice q1a/q1b/q1c marker', () => {
    const content =
      'Выбор пути:\n\nq5a/q5b/q5c: дёрнуть SH05 одного, парочку SH05+SH06, или все 18?';
    const result = detectAwaitingDirectorInput(content);
    expect(result).not.toBeNull();
    expect(result?.choices).toHaveLength(3);
    expect(result?.choices?.[0]).toEqual({ id: 'q5a', label: 'A' });
    expect(result?.choices?.[2]).toEqual({ id: 'q5c', label: 'C' });
  });

  test('detects bare q1: open-ended question without choices', () => {
    const content = 'Bible v2.0 готов в draft. q7: добавить ещё одну character section или мержим как есть?';
    const result = detectAwaitingDirectorInput(content);
    expect(result).not.toBeNull();
    expect(result?.question).toContain('добавить ещё одну character section');
    expect(result?.choices).toBeUndefined();
  });

  test('takes the LAST q-marker when multiple appear', () => {
    const content = `Подведу итоги:
- q1 был про модель
- q2 был про cost
- q3 был про smoke target

q4y/q4n: ок начинать?`;
    const result = detectAwaitingDirectorInput(content);
    expect(result?.question).toContain('ок начинать');
    expect(result?.choices).toEqual([
      { id: 'q4y', label: 'Да' },
      { id: 'q4n', label: 'Нет' },
    ]);
  });

  test('handles markdown bold around the q-marker', () => {
    const content = 'Всё подготовлено.\n\n**q2y/q2n: запускаем fanout на 18?**';
    const result = detectAwaitingDirectorInput(content);
    expect(result?.question).toContain('запускаем fanout на 18');
    expect(result?.choices).toHaveLength(2);
  });

  test('handles guillemet-wrapped question', () => {
    const content = '«q1y/q1n: запустить regen для SH04 сейчас?»';
    const result = detectAwaitingDirectorInput(content);
    expect(result?.question).toContain('запустить regen для SH04');
  });

  test('passive "жду X" without q-format still flags (open-loop fallback)', () => {
    const content =
      'Сделала requestRevision на SH04. Жду подхватит ли Reference Artist автоматически; если не появится новый job/event, следующим ходом запущу регенерацию.';
    const result = detectAwaitingDirectorInput(content);
    expect(result).not.toBeNull();
    expect(result?.question.toLowerCase()).toContain('жду');
    // No q-format means no structured choices — UI shows the snippet only.
    expect(result?.choices).toBeUndefined();
  });

  test('passive "waiting for" in English also flags', () => {
    const content = 'Waiting for the runner to pick this up. If it does not, I will rerun.';
    const result = detectAwaitingDirectorInput(content);
    expect(result).not.toBeNull();
  });

  test('passive "мониторю появление" flags (expansion 2026-05-21)', () => {
    // Director's real-session example: Polina wrote this after approving 2
    // ref plans and got stuck silently. Pre-fix regex missed "мониторю".
    const content =
      'Утвердила оба плана. Reference Artist запущен.\n\nСледующее действие: мониторю появление image references по SH05/SH06; когда художник завершит, сразу читаю оба результата и дам breakdown.';
    const result = detectAwaitingDirectorInput(content);
    expect(result).not.toBeNull();
  });

  test('passive "monitoring" in English also flags', () => {
    const content = 'Plans approved. Next step: monitoring activity_events for completion.';
    const result = detectAwaitingDirectorInput(content);
    expect(result).not.toBeNull();
  });

  test('passive "слежу за" flags', () => {
    const content = 'Сделала. Слежу за следующим шагом pipeline.';
    const result = detectAwaitingDirectorInput(content);
    expect(result).not.toBeNull();
  });

  test('does NOT flag past-tense "ждала" (not the verb we look for)', () => {
    // Substring «жду» is not a prefix of «ждала», and the regex matches whole
    // tokens only — so this stays null. Good: avoids false-positive chips on
    // narrative-tense mentions.
    const content = 'Раньше я ждала событие, но теперь система чинится.';
    expect(detectAwaitingDirectorInput(content)).toBeNull();
  });

  test('truncates very long question text to 200 chars', () => {
    const long = 'a'.repeat(500);
    const content = `**q9y/q9n: ${long}?**`;
    const result = detectAwaitingDirectorInput(content);
    expect(result?.question.length).toBeLessThanOrEqual(200);
    expect(result?.question.endsWith('…')).toBe(true);
  });
});
