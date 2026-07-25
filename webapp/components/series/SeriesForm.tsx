// ──────────────────────────────────────────────────────────────────────────────
// components/series/SeriesForm.tsx
// The ONE series-creation form (multi-channel Phase 2, anti-additivity: this
// collapses the previous copy-paste pair SeriesStep ⇄ NewSeriesModal).
// Owns the POST /api/series call and the optional channel selector; hosts
// (wizard step / modal) provide heading, chrome and the onCreated follow-up.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';

interface ChannelOption {
  id: string;
  name: string;
  credential_key: string;
  status: string;
}

interface SeriesFormProps {
  onCreated: (seriesId: string) => void | Promise<void>;
  submitLabel?: string;
  /** Extra buttons rendered left of the submit (e.g. modal Cancel). */
  secondaryAction?: React.ReactNode;
}

export function SeriesForm({ onCreated, submitLabel = 'Create series', secondaryAction }: SeriesFormProps) {
  const [code, setCode] = useState('SS-S01');
  const [title, setTitle] = useState('');
  const [audience, setAudience] = useState<'adult' | 'kids' | 'mixed' | 'other'>('adult');
  const [genre, setGenre] = useState<'comedy' | 'drama' | 'doc' | 'sci_fi' | 'other'>('comedy');
  const [logline, setLogline] = useState('');
  const [budget, setBudget] = useState('25.00');
  const [channelId, setChannelId] = useState('');
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/channels')
      .then((r) => r.json())
      .then((j: { data?: ChannelOption[] }) => {
        if (!cancelled && Array.isArray(j.data)) setChannels(j.data);
      })
      .catch(() => {
        /* channel list is optional — the form works without it */
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
        channel_id: channelId || undefined,
      }),
    });
    setPending(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError((j as { error?: string }).error ?? 'Series creation failed');
      return;
    }
    const j = (await res.json()) as { data: { id: string } };
    await onCreated(j.data.id);
  }

  // Series code must match assets.filename CHECK pattern: '^SS-(S\d{2}|PILOT)...'
  const valid = title.trim().length > 0 && /^SS-(S\d{2}|PILOT)$/.test(code);

  return (
    <div className="space-y-4">
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

      <Field label="Channel (optional)">
        <select
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
          className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm text-text-primary focus:outline-none focus:border-[var(--accent-primary)]"
        >
          <option value="">— no channel yet (attach before publish)</option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {c.credential_key}
              {c.status !== 'ACTIVE' ? ` (${c.status})` : ''}
            </option>
          ))}
        </select>
      </Field>

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
        <div
          className="rounded-lg p-3 text-xs"
          style={{
            background: 'color-mix(in oklab, var(--accent-danger) 14%, transparent)',
            color: 'var(--accent-danger)',
          }}
        >
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        {secondaryAction}
        <Button onClick={submit} disabled={!valid || pending}>
          {pending ? 'Creating…' : submitLabel}
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
