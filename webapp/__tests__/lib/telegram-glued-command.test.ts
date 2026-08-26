import { describe, it, expect } from 'vitest';
import { splitGluedCommand, firstCommandArgument } from '@/lib/telegram/commands';

describe('слитная форма команды пульта', () => {
  it('`/e02` понимается как `/e 02` — иначе команда уходит текстом в чат', () => {
    // Живой случай 26.08: Директор набрал `/e02`, команда не распозналась,
    // ушла Полине обычным текстом, пульт остался на сериале — и следующий
    // `/лимит 50` отбился «эпизод не выбран» без объяснения.
    expect(splitGluedCommand('/e02')).toEqual({ cmd: '/e', arg: '02' });
    expect(splitGluedCommand('/лимит50')).toEqual({ cmd: '/лимит', arg: '50' });
    expect(splitGluedCommand('/limit25.5')).toEqual({ cmd: '/limit', arg: '25.5' });
  });

  it('обычная форма с пробелом не ломается', () => {
    expect(splitGluedCommand('/e')).toEqual({ cmd: '/e', arg: '' });
    expect(splitGluedCommand('/лимит')).toEqual({ cmd: '/лимит', arg: '' });
    expect(splitGluedCommand('/status')).toEqual({ cmd: '/status', arg: '' });
  });

  it('код эпизода целиком не разрывается по первой цифре', () => {
    // `/e SS-S22-E02` — аргумент буквенный, слитной формы здесь нет.
    expect(splitGluedCommand('/e')).toEqual({ cmd: '/e', arg: '' });
    expect(firstCommandArgument('/e SS-S22-E02')).toBe('SS-S22-E02');
  });

  it('не команда — возвращается как есть', () => {
    expect(splitGluedCommand('привет')).toEqual({ cmd: 'привет', arg: '' });
  });
});
