// ──────────────────────────────────────────────────────────────────────────────
// components/onboarding/SeriesStep.tsx
// Step 2 — create first series. Per onboarding.md §5.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

interface SeriesStepProps {
  onAdvance: (seriesId: string) => void;
}

export function SeriesStep({ onAdvance }: SeriesStepProps) {
  const [code, setCode] = useState('SS01');
  const [title, setTitle] = useState('');
  const [audience, setAudience] = useState<'adult' | 'kids' | 'mixed' | 'other'>('adult');
  const [genre, setGenre] = useState<'comedy' | 'drama' | 'doc' | 'sci_fi' | 'other'>('comedy');
  const [logline, setLogline] = useState('');
  const [budget, setBudget] = useState('25.00');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    const res = await fetch('/api/series', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        code,
        title,
        audience,
        genre,
        logline: logline || undefined,
        episode_budget_ceiling: Number(budget) || 25,
      }),
    });
    setPending(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError((j as { error?: string }).error ?? 'Series creation failed');
      return;
    }
    const j = (await res.json()) as { data: { id: string } };
    await fetch('/api/onboarding/advance', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ step: 2, payload: { series_id: j.data.id } }),
    });
    onAdvance(j.data.id);
  }

  const valid = title.trim().length > 0 && code.match(/^[A-Z]{2,6}[0-9]{0,2}$/);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">Your first series</h2>
        <p className="text-sm text-text-secondary mt-1">
          Bibles (world, characters, style) populate during episode 1 — you don't write them now.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Series code">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm font-mono text-text-primary focus:outline-none focus:border-[var(--accent-primary)]"
          />
        </Field>
        <Field label="Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Sandy"
            className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm text-text-primary focus:outline-none focus:border-[var(--accent-primary)]"
          />
        </Field>
        <Field label="Audience">
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value as typeof audience)}
            className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm text-text-primary focus:outline-none focus:border-[var(--accent-primary)]"
          >
            <option value="adult">Adult</option>
            <option value="kids">Kids</option>
            <option value="mixed">Mixed</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Genre">
          <select
            value={genre}
            onChange={(e) => setGenre(e.target.value as typeof genre)}
            className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm text-text-primary focus:outline-none focus:border-[var(--accent-primary)]"
          >
            <option value="comedy">Comedy</option>
            <option value="drama">Drama</option>
            <option value="doc">Documentary</option>
            <option value="sci_fi">Sci-fi</option>
            <option value="other">Other</option>
          </select>
        </Field>
      </div>

      <Field label="Logline (optional)">
        <input
          value={logline}
          onChange={(e) => setLogline(e.target.value)}
          placeholder="One-sentence pitch"
          maxLength={200}
          className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm text-text-primary focus:outline-none focus:border-[var(--accent-primary)]"
        />
      </Field>

      <Field label="Episode budget ceiling">
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-muted">$</span>
          <input
            type="number"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            step="0.01"
            min="0"
            className="w-32 h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm font-mono text-text-primary focus:outline-none focus:border-[var(--accent-primary)]"
          />
          <span className="text-xs text-text-muted">per episode default</span>
        </div>
      </Field>

      {error && (
        <div className="rounded-lg p-3 text-xs" style={{
          background: 'color-mix(in oklab, var(--accent-danger) 14%, transparent)',
          color: 'var(--accent-danger)',
        }}>
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-3">
        <Button onClick={submit} disabled={!valid || pending}>
          {pending ? 'Creating…' : 'Continue →'}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wider text-text-muted mb-1.5">{label}</label>
      {children}
    </div>
  );
}
