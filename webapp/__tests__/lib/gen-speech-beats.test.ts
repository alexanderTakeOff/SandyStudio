import { describe, it, expect } from 'vitest';
import { parseBeats } from '@/lib/api/speech-beats';

describe('разбор реплики на такты', () => {
  it('такты делятся вертикальной чертой', () => {
    const beats = parseBeats('Первый|Второй|Третий', 0.93);
    expect(beats.map((b) => b.text)).toEqual(['Первый', 'Второй', 'Третий']);
    expect(beats.every((b) => b.speed === 0.93)).toBe(true);
  });

  it('такт несёт СВОИ параметры — иначе дуги не будет', () => {
    // Монотонность — не свойство клона, а отсутствие дуги (O13, 25.08).
    const beats = parseBeats('Тише@0.88|Громче@1.0:1.05', 0.93);
    expect(beats[0]).toEqual({ text: 'Тише', speed: 0.88, vol: 1 });
    expect(beats[1]).toEqual({ text: 'Громче', speed: 1.0, vol: 1.05 });
  });

  it('мусор после @ не роняет такт — текст важнее параметра', () => {
    const beats = parseBeats('Реплика@быстро', 0.93);
    expect(beats[0].text).toBe('Реплика@быстро');
    expect(beats[0].speed).toBe(0.93);
  });

  it('пустые куски отбрасываются', () => {
    expect(parseBeats('Один||Два|', 0.93)).toHaveLength(2);
  });
});
