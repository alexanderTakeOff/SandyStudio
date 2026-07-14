// ──────────────────────────────────────────────────────────────────────────────
// components/onboarding/EpisodeStep.tsx
// Step 4 — first episode brief (optional). Per onboarding.md §7.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';

interface EpisodeStepProps {
  seriesId: string;
  onSkip: () => void;
}

export function EpisodeStep({ seriesId, onSkip }: EpisodeStepProps) {
  const router = useRouter();
  const [code, setCode] = useState('E01');
  const [title, setTitle] = useState('');
  const [runtime, setRuntime] = useState('60');
  const [premise, setPremise] = useState('');
  const [governance, setGovernance] = useState<1 | 2 | 3>(1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    const res = await fetch('/api/episodes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        series_id: seriesId,
        episode_code: code,
        title_working: title,
        target_runtime_seconds: Number(runtime),
        premise,
        governance_mode: governance,
      }),
    });
    setPending(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError((j as { error?: string }).error ?? 'Failed');
      return;
    }
    await fetch('/api/onboarding/exit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'completed' }),
    });
    router.push('/');
  }

  async function skip() {
    await fetch('/api/onboarding/exit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'skipped_episode' }),
    });
    onSkip();
  }

  const valid = title.trim().length > 0 && premise.trim().length >= 20 && code.match(/^E[0-9]{1,3}$/);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">Your first episode</h2>
        <p className="text-sm text-text-secondary mt-1">
          Optional — you can skip and create episodes from the dashboard later.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Episode code">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm font-mono focus:outline-none focus:border-[var(--accent-primary)]"
          />
        </Field>
        <Field label="Working title" className="sm:col-span-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. The Red Carpet"
            className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm focus:outline-none focus:border-[var(--accent-primary)]"
          />
        </Field>
      </div>

      <Field label="Target runtime (seconds)">
        <select
          value={runtime}
          onChange={(e) => setRuntime(e.target.value)}
          className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm focus:outline-none focus:border-[var(--accent-primary)]"
        >
          <option value="30">30s</option>
          <option value="60">60s</option>
          <option value="90">90s</option>
          <option value="120">120s</option>
        </select>
      </Field>

      <Field label="Premise (2–3 sentences)">
        <textarea
          value={premise}
          onChange={(e) => setPremise(e.target.value)}
          rows={3}
          maxLength={500}
          className="w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm focus:outline-none focus:border-[var(--accent-primary)]"
          placeholder="Story seed — what happens, where, with whom"
        />
        <div className="text-[11px] text-text-muted mt-1">{premise.length}/500</div>
      </Field>

      <Field label="Initial governance mode">
        <div className="flex gap-2">
          {([1, 2, 3] as const).map((m) => (
            <button
              key={m}
              onClick={() => setGovernance(m)}
              className="px-3 h-9 rounded-lg border text-xs font-medium uppercase tracking-wider transition-colors"
              style={{
                borderColor: governance === m ? 'var(--accent-primary)' : 'var(--panel-glass-border)',
                background: governance === m ? 'color-mix(in oklab, var(--accent-primary) 14%, transparent)' : 'transparent',
                color: governance === m ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            >
              Mode {m}
            </button>
          ))}
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

      <div className="flex justify-between gap-2 pt-3">
        <Button variant="ghost" onClick={skip} disabled={pending}>
          Skip — open Dashboard
        </Button>
        <Button onClick={submit} disabled={!valid || pending}>
          {pending ? 'Creating…' : 'Save & Open Dashboard →'}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-xs uppercase tracking-wider text-text-muted mb-1.5">{label}</label>
      {children}
    </div>
  );
}
