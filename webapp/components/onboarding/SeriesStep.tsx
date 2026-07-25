// ──────────────────────────────────────────────────────────────────────────────
// components/onboarding/SeriesStep.tsx
// Step 2 — create first series. Per onboarding.md §5.
// Form body lives in the shared <SeriesForm> (multi-channel Phase 2 dedup) —
// this step only adds the wizard heading and the onboarding/advance call.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { SeriesForm } from '@/components/series/SeriesForm';

interface SeriesStepProps {
  onAdvance: (seriesId: string) => void;
}

export function SeriesStep({ onAdvance }: SeriesStepProps) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">Your first series</h2>
        <p className="text-sm text-text-secondary mt-1">
          Bibles (world, characters, style) populate during episode 1 — you do not write them now.
        </p>
      </div>

      <SeriesForm
        submitLabel="Continue →"
        onCreated={async (seriesId) => {
          await fetch('/api/onboarding/advance', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ step: 2, payload: { series_id: seriesId } }),
          });
          onAdvance(seriesId);
        }}
      />
    </div>
  );
}
