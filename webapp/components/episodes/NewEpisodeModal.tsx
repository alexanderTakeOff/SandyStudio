// ──────────────────────────────────────────────────────────────────────────────
// components/episodes/NewEpisodeModal.tsx
// "New Episode" form. Loads series list, lets Director pick.
// Mirrors onboarding step 4 form fields.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

interface NewEpisodeModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

interface SeriesRow {
  id: string;
  code: string;
  title: string;
}

export function NewEpisodeModal({ open, onClose, onCreated }: NewEpisodeModalProps) {
  const [series, setSeries] = useState<SeriesRow[]>([]);
  const [seriesId, setSeriesId] = useState<string>('');
  const [code, setCode] = useState('E01');
  const [title, setTitle] = useState('');
  const [runtime, setRuntime] = useState('60');
  const [premise, setPremise] = useState('');
  const [governance, setGovernance] = useState<1 | 2 | 3>(1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch('/api/series')
      .then((r) => r.json())
      .then((j: { data?: SeriesRow[] }) => {
        const list = j.data ?? [];
        setSeries(list);
        if (list.length > 0 && !seriesId) setSeriesId(list[0]!.id);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
    onCreated();
    setTitle('');
    setPremise('');
  }

  const valid =
    seriesId.length > 0 &&
    title.trim().length > 0 &&
    premise.trim().length >= 20 &&
    code.match(/^E[0-9]{1,3}$/);

  return (
    <Modal open={open} onClose={onClose} title="New episode" size="md">
      {series.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-sm text-text-secondary">No series exist yet.</p>
          <p className="text-xs text-text-muted mt-2">
            Open Series and create one, or run the setup wizard.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Series">
            <select
              value={seriesId}
              onChange={(e) => setSeriesId(e.target.value)}
              className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm focus:outline-none focus:border-[var(--accent-primary)]"
            >
              {series.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.title}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Code">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm font-mono focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </Field>
            <Field label="Title" className="col-span-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Working title"
                className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </Field>
          </div>

          <Field label="Runtime">
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
              placeholder="Story seed — what happens, where, with whom"
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm focus:outline-none focus:border-[var(--accent-primary)]"
            />
            <div className="text-[11px] text-text-muted mt-1">{premise.length}/500</div>
          </Field>

          <Field label="Governance mode">
            <div className="flex gap-2">
              {([1, 2, 3] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setGovernance(m)}
                  className="px-3 h-9 rounded-lg border text-xs font-medium uppercase tracking-wider transition-colors"
                  style={{
                    borderColor:
                      governance === m ? 'var(--accent-primary)' : 'var(--panel-glass-border)',
                    background:
                      governance === m
                        ? 'color-mix(in oklab, var(--accent-primary) 14%, transparent)'
                        : 'transparent',
                    color: governance === m ? 'var(--text-primary)' : 'var(--text-secondary)',
                  }}
                >
                  Mode {m}
                </button>
              ))}
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
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!valid || pending}>
              {pending ? 'Creating…' : 'Create episode'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-xs uppercase tracking-wider text-text-muted mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
