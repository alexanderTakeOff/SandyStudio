/**
 * Commands may arrive with quoted/forwarded history after the first line.
 * Identity-like arguments (`/e <code>`) must never swallow that history.
 */
export function firstCommandArgument(text: string): string {
  return text.trim().split(/\s+/)[1] ?? '';
}
