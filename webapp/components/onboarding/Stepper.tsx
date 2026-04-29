// ──────────────────────────────────────────────────────────────────────────────
// components/onboarding/Stepper.tsx
// 4-step progress indicator per onboarding.md §3.
// ──────────────────────────────────────────────────────────────────────────────

interface StepperProps {
  current: 1 | 2 | 3 | 4;
  completed: number[];
}

const STEPS: Array<{ id: 1 | 2 | 3 | 4; label: string }> = [
  { id: 1, label: 'Storage' },
  { id: 2, label: 'Series' },
  { id: 3, label: 'Authority' },
  { id: 4, label: 'Episode' },
];

export function Stepper({ current, completed }: StepperProps) {
  return (
    <div className="flex items-center justify-center gap-3 mb-8">
      {STEPS.map((s, i) => {
        const done = completed.includes(s.id);
        const active = current === s.id;
        return (
          <div key={s.id} className="flex items-center gap-3">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className="w-3 h-3 rounded-full border-2"
                style={{
                  borderColor: done || active ? 'var(--accent-primary)' : 'var(--text-muted)',
                  background: done ? 'var(--accent-primary)' : active ? 'color-mix(in oklab, var(--accent-primary) 30%, transparent)' : 'transparent',
                }}
              />
              <span
                className="text-[10px] uppercase tracking-wider"
                style={{ color: done || active ? 'var(--text-primary)' : 'var(--text-muted)' }}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className="h-px w-12"
                style={{
                  background: done ? 'var(--accent-primary)' : 'var(--panel-glass-border)',
                  opacity: 0.6,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
