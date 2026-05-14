// ──────────────────────────────────────────────────────────────────────────────
// components/settings/HintsToggle.tsx
// Global "show inline hints" switch. Lives in the Settings page header so
// Directors who don't want chatty descriptions can silence them in one click.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { Lightbulb } from 'lucide-react';
import { useHintsEnabled, setHintsEnabled } from '@/lib/hints/preferences';
import { cn } from '@/lib/utils';

export function HintsToggle() {
  const enabled = useHintsEnabled();

  return (
    <button
      type="button"
      onClick={() => setHintsEnabled(!enabled)}
      aria-pressed={enabled}
      title={enabled ? 'Inline hints are showing' : 'Inline hints are hidden'}
      className={cn(
        'inline-flex items-center gap-2 h-8 px-3 rounded-full text-xs font-medium',
        'border border-glass transition-colors',
        enabled
          ? 'bg-[var(--panel-hover-bg)] text-text-primary'
          : 'bg-transparent text-text-muted hover:text-text-secondary',
      )}
    >
      <Lightbulb size={13} aria-hidden />
      Hints {enabled ? 'on' : 'off'}
    </button>
  );
}
