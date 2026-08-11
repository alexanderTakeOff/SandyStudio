// ──────────────────────────────────────────────────────────────────────────────
// app/(studio)/error.tsx — сеть безопасности студии.
//
// До 10.08 в проекте не было НИ ОДНОГО error boundary: любое исключение при
// рендере всплывало до корня, React размонтировал всё дерево, и Директор получал
// дефолтную страницу Next — «вернуться можно только куда-то наружу эпизода».
// Ровно так вело себя падение дровера на кадре без `test_plan`.
//
// Граница стоит на уровне (studio), а не страницы: оболочка с навигацией остаётся
// живой, и из ошибки есть выход НАЗАД В РАБОТУ, а не только в браузерную историю.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function StudioError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // В консоль — целиком: без стека дефект ловится глазами, а глазами он ловится плохо.
    console.error('[studio] ошибка рендера:', error);
  }, [error]);

  return (
    <div className="p-6 max-w-3xl">
      <div
        className="rounded-xl border border-glass p-5 space-y-4"
        style={{ background: 'color-mix(in oklab, var(--accent-danger) 6%, var(--bg-elevated))' }}
      >
        <div className="text-base font-semibold text-text-primary">Эта панель не отрисовалась</div>
        <div className="text-sm text-text-secondary">
          Остальная студия жива — ошибка не выкидывает вас из эпизода. Нажмите «Повторить»;
          если повторяется, скажите Тео и покажите строку ниже.
        </div>
        <pre
          className="text-[11px] font-mono whitespace-pre-wrap p-3 rounded-lg overflow-x-auto"
          style={{ background: 'var(--bg-base)', color: 'var(--text-muted)' }}
        >
          {error.message}
          {error.digest ? `\ndigest: ${error.digest}` : ''}
        </pre>
        <Button variant="ghost" onClick={reset}>
          <RotateCcw size={13} /> Повторить
        </Button>
      </div>
    </div>
  );
}
