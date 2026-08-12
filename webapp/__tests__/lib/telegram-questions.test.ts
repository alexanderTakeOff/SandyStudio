// Сторож протокола кнопок пульта.
//
// Кнопки телеграма НЕ вводят своего языка ответов: они отправляют тот же код
// `<NN><цифра>`, который Директор набрал бы руками по правилу нумерации
// вопросов. Если формат вопросов однажды поменяется, эти проверки покраснеют —
// и это единственный способ узнать об этом до того, как пульт начнёт молча
// присылать вопросы без кнопок.
import { describe, expect, it } from 'vitest';
import { keyboardForText, parseQuestions } from '../../lib/telegram/questions';

// Живой текст — вопрос этой сессии, слово в слово.
const INLINE = `🔴 03 — Что бот умеет в v1? (1) писать Полине и получать ответ — минимум (2) + «что сейчас» и «стоп» — рекомендую (3) + кнопки аппрува

🔴 04 — Нужен токен: напиши в телеграме @BotFather.`;

// Второй живой стиль — «разговорные» варианты абзацами (правило общения §вопросы).
const PARAGRAPHS = `04 — Каким провайдером генерим IMG-anchor?

(1) openai-edits-multi — тот же gpt-image-2, что уже работает для всех IMG.

(2) Flux Pro Ultra — есть ползунок denoise, но одна референс-картинка.`;

describe('вопросы Директора превращаются в кнопки', () => {
  it('берёт номер, заголовок и варианты из строки с эмодзи-маркером', () => {
    const qs = parseQuestions(INLINE);
    expect(qs.map((q) => q.number)).toEqual(['03', '04']);
    expect(qs[0].title).toContain('Что бот умеет');
    expect(qs[0].options.map((o) => o.digit)).toEqual(['1', '2', '3']);
    // Вопрос без вариантов остаётся открытым — кнопок не рождает.
    expect(qs[1].options).toEqual([]);
  });

  it('ловит варианты, стоящие отдельными абзацами под вопросом', () => {
    const [q] = parseQuestions(PARAGRAPHS);
    expect(q.number).toBe('04');
    expect(q.options.map((o) => o.digit)).toEqual(['1', '2']);
    // Подпись — смысл варианта, а не первое предложение целиком.
    expect(q.options[0].label).toBe('openai-edits-multi');
  });

  it('callback_data — это ответ Директора, а не собственный язык кнопок', () => {
    const kb = keyboardForText(INLINE);
    expect(kb).toHaveLength(1); // ряд только у вопроса с вариантами
    expect(kb[0].map((b) => b.callback_data)).toEqual(['031', '032', '033']);
    for (const b of kb[0]) {
      expect(b.text.length).toBeLessThanOrEqual(64); // предел телеграма
      expect(b.callback_data.length).toBeLessThanOrEqual(64);
    }
  });

  it('текст без вопросов не рождает клавиатуру', () => {
    expect(keyboardForText('Сделано: кат собран, 38 секунд, $27,57.')).toEqual([]);
  });

  it('да/нет — это те же варианты 1 и 2, без отдельной ветки кода', () => {
    const kb = keyboardForText('🟢 07 — Ставить эфир сейчас? (1) да (2) нет');
    expect(kb[0].map((b) => b.callback_data)).toEqual(['071', '072']);
    expect(kb[0].map((b) => b.text)).toEqual(['07·1 да', '07·2 нет']);
  });
});
