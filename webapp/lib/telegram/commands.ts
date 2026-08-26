/**
 * Commands may arrive with quoted/forwarded history after the first line.
 * Identity-like arguments (`/e <code>`) must never swallow that history.
 */
export function firstCommandArgument(text: string): string {
  return text.trim().split(/\s+/)[1] ?? '';
}

/**
 * Разобрать команду в СЛИТНОЙ форме: `/e02` = `/e 02`, `/лимит50` = `/лимит 50`.
 *
 * ЗАЧЕМ (Директор, 26.08): он набрал `/e02` с телефона одной рукой, команда не
 * распозналась и ушла Полине обычным текстом. Пульт остался на сериале, следующий
 * `/лимит 50` отбился «эпизод не выбран», а подтверждения перехода не пришло —
 * снаружи это выглядело как молчание прибора. Телефонная клавиатура не поощряет
 * пробелы, и требовать их — перекладывать свою строгость на того, кто печатает
 * на бегу.
 *
 * Граница — «буквы → цифры»: имя команды буквенное, аргумент числовой.
 */
export function splitGluedCommand(token: string): { cmd: string; arg: string } {
  const match = /^(\/[a-zA-Zа-яА-ЯёЁ]+)(\d.*)$/.exec(token.trim());
  if (!match) return { cmd: token.trim(), arg: '' };
  return { cmd: match[1], arg: match[2] };
}
