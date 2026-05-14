// ──────────────────────────────────────────────────────────────────────────────
// components/settings/AppearanceSettings.tsx
// Theme + ambient selectors per uiux.md §7.
// Persistence: localStorage in v1 (no user_settings table yet).
//
// Muted descriptive text rows have been replaced with <PeekHint> — auto-peek
// on first paint, then collapse into a small `i` affordance.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useAppearance } from '@/components/providers/AppearanceProvider';
import { THEMES } from '@/lib/uiux/themes';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { PeekHint } from '@/components/ui/PeekHint';
import type { AmbientMode } from '@/lib/uiux/types';
import { cn } from '@/lib/utils';

const AMBIENT_OPTIONS: { id: AmbientMode; label: string; description: string }[] = [
  { id: 'on',      label: 'On',      description: 'Subtle motion + parallax. Recommended.' },
  { id: 'reduced', label: 'Reduced', description: 'Static field, no motion.' },
  { id: 'off',     label: 'Off',     description: 'Plain themed background, no field.' },
];

export function AppearanceSettings() {
  const { theme, ambient, setTheme, setAmbient } = useAppearance();

  return (
    <div className="space-y-6">
      {/* Theme */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Theme</CardTitle>
            <PeekHint autoPeekMs={3500}>
              Pick a visual direction. Applied across the whole studio shell.
            </PeekHint>
          </div>
        </CardHeader>
        <CardBody>
          <div className="grid sm:grid-cols-3 gap-3">
            {THEMES.map((t) => {
              const active = theme === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTheme(t.id)}
                  className={cn(
                    'group text-left rounded-xl border p-3 transition-all',
                    active
                      ? 'border-glass-active bg-[var(--panel-hover-bg)]'
                      : 'border-glass hover:border-glass-active hover:bg-[var(--panel-hover-bg)]',
                  )}
                >
                  <div
                    className="h-20 rounded-lg mb-3 border border-glass relative overflow-hidden"
                    style={{
                      background: `linear-gradient(135deg, ${t.swatch.from}, ${t.swatch.to})`,
                    }}
                  >
                    <span
                      className="absolute bottom-2 right-2 h-3 w-3 rounded-full ring-2 ring-black/30"
                      style={{ background: t.swatch.accent }}
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-text-primary">{t.label}</span>
                    <PeekHint side="top" autoPeekMs={0}>
                      {t.description}
                    </PeekHint>
                  </div>
                </button>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {/* Ambient */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Ambient background</CardTitle>
            <PeekHint autoPeekMs={3500}>
              Settings persist in browser local storage. A user_settings table will store this
              per-Director once multi-user lands (auth.md §5).
            </PeekHint>
          </div>
        </CardHeader>
        <CardBody>
          <div className="grid sm:grid-cols-3 gap-3">
            {AMBIENT_OPTIONS.map((opt) => {
              const active = ambient === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setAmbient(opt.id)}
                  className={cn(
                    'text-left rounded-xl border p-4 transition-all',
                    active
                      ? 'border-glass-active bg-[var(--panel-hover-bg)]'
                      : 'border-glass hover:bg-[var(--panel-hover-bg)]',
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-text-primary">{opt.label}</span>
                    <PeekHint side="top" autoPeekMs={0}>
                      {opt.description}
                    </PeekHint>
                  </div>
                </button>
              );
            })}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
