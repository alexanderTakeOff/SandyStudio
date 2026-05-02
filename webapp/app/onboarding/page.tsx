// ──────────────────────────────────────────────────────────────────────────────
// app/onboarding/page.tsx — First-run wizard host per onboarding.md.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Stepper } from '@/components/onboarding/Stepper';
import { StorageStep } from '@/components/onboarding/StorageStep';
import { SeriesStep } from '@/components/onboarding/SeriesStep';
import { AuthorityStep } from '@/components/onboarding/AuthorityStep';
import { EpisodeStep } from '@/components/onboarding/EpisodeStep';

interface OnboardingState {
  current_step: 1 | 2 | 3 | 4;
  completed_steps: number[];
  draft_series_id: string | null;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState | null>(null);

  useEffect(() => {
    fetch('/api/onboarding/state')
      .then((r) => r.json())
      .then((j: { data?: OnboardingState }) => {
        if (j.data) setState(j.data);
      });
  }, []);

  if (!state) {
    return (
      <div className="text-text-secondary text-sm">Loading…</div>
    );
  }

  const reload = () =>
    fetch('/api/onboarding/state')
      .then((r) => r.json())
      .then((j: { data?: OnboardingState }) => {
        if (j.data) setState(j.data);
      });

  return (
    <div className="relative w-full max-w-3xl">
      <div className="text-center mb-2">
        <div className="inline-flex items-center gap-2 mb-3">
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center font-bold text-[var(--text-inverse)]"
            style={{
              background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
            }}
          >
            S
          </div>
          <span className="text-sm font-semibold text-text-primary">SandyStudio</span>
        </div>
        <p className="text-[11px] uppercase tracking-wider text-text-muted">
          First-run setup · Step {state.current_step} of 4
        </p>
      </div>

      <div className="rounded-2xl border border-glass bg-panel-glass-strong backdrop-blur-xl shadow-glass p-7">
        <Stepper current={state.current_step} completed={state.completed_steps} />
        {state.current_step === 1 && <StorageStep onAdvance={reload} />}
        {state.current_step === 2 && <SeriesStep onAdvance={reload} />}
        {state.current_step === 3 && state.draft_series_id && (
          <AuthorityStep seriesId={state.draft_series_id} onAdvance={reload} />
        )}
        {state.current_step === 3 && !state.draft_series_id && (
          <p className="text-sm text-[var(--accent-danger)]">
            Series was not created in step 2. Refresh and re-do step 2.
          </p>
        )}
        {state.current_step === 4 && state.draft_series_id && (
          <EpisodeStep seriesId={state.draft_series_id} onSkip={() => router.push('/')} />
        )}
      </div>
    </div>
  );
}
