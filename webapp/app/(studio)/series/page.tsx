// ──────────────────────────────────────────────────────────────────────────────
// app/(studio)/series/page.tsx — Series list + "+ New Series" CTA.
// Authority Matrix per-row editing UI lands in Phase 7.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { Plus, Folders } from 'lucide-react';
import { StudioContentFrame } from '@/components/studio-shell/StudioContentFrame';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { fetcher } from '@/lib/swr';

interface SeriesRow {
  id: string;
  code: string;
  title: string;
  audience: string | null;
  genre: string | null;
  logline: string | null;
  episode_budget_ceiling: number | null;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  created_at: string;
}

export default function SeriesPage() {
  const [newOpen, setNewOpen] = useState(false);
  const { data, isLoading, mutate } = useSWR<{ data: SeriesRow[] }>(
    '/api/series',
    fetcher,
    { refreshInterval: 60_000 },
  );
  const series = data?.data ?? [];

  return (
    <StudioContentFrame>
      <header className="flex items-center justify-between mb-5">
        <div>
          <div className="flex items-center gap-2">
            <Folders size={18} className="text-text-secondary" />
            <h1 className="text-2xl font-semibold text-text-primary">Series</h1>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            Each series is a universe. Bibles populate during episode 1 production.
          </p>
        </div>
        <Button onClick={() => setNewOpen(true)}>
          <Plus size={14} /> New Series
        </Button>
      </header>

      {isLoading && <p className="text-xs text-text-muted">Loading…</p>}

      {!isLoading && series.length === 0 && (
        <Card>
          <CardBody>
            <div className="text-center py-12">
              <p className="text-base text-text-primary">No series yet.</p>
              <p className="text-sm text-text-secondary mt-2">
                Run the setup wizard or create one directly.
              </p>
              <div className="mt-4 flex gap-2 justify-center">
                <Link
                  href="/onboarding"
                  className="inline-flex items-center justify-center px-4 h-10 text-sm rounded-lg border border-glass text-text-secondary hover:bg-[var(--panel-hover-bg)] transition-colors"
                >
                  Run setup wizard →
                </Link>
                <Button onClick={() => setNewOpen(true)}>
                  <Plus size={14} /> New Series
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      <div className="grid gap-3">
        {series.map((s) => (
          <Card key={s.id}>
            <CardBody>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="text-base font-mono text-text-primary">{s.code}</span>
                    <span className="text-sm text-text-secondary truncate">{s.title}</span>
                    <StatusBadge status={s.status} />
                  </div>
                  <div className="mt-1 text-[11px] text-text-muted flex flex-wrap gap-2">
                    {s.audience && <span>{s.audience}</span>}
                    {s.genre && <><span>·</span><span>{s.genre}</span></>}
                    {s.episode_budget_ceiling != null && (
                      <>
                        <span>·</span>
                        <span>${s.episode_budget_ceiling.toFixed(2)}/episode</span>
                      </>
                    )}
                    <span>·</span>
                    <span>created {new Date(s.created_at).toLocaleDateString()}</span>
                  </div>
                  {s.logline && (
                    <p className="mt-2 text-sm text-text-secondary leading-relaxed">{s.logline}</p>
                  )}
                </div>
                <Link
                  href={`/episodes?series_id=${s.id}`}
                  className="text-xs text-[var(--accent-primary)] hover:brightness-125 shrink-0"
                >
                  View episodes →
                </Link>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      <NewSeriesModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={() => {
          setNewOpen(false);
          mutate();
        }}
      />
    </StudioContentFrame>
  );
}

function StatusBadge({ status }: { status: SeriesRow['status'] }) {
  const color =
    status === 'ACTIVE'
      ? 'var(--accent-success)'
      : status === 'DRAFT'
      ? 'var(--accent-info)'
      : 'var(--text-muted)';
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded uppercase tracking-wider text-[10px] font-semibold"
      style={{
        background: `color-mix(in oklab, ${color} 14%, transparent)`,
        color,
      }}
    >
      {status.toLowerCase()}
    </span>
  );
}

function NewSeriesModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [code, setCode] = useState('SS-S01');
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
    onCreated();
    setTitle('');
    setLogline('');
  }

  const valid = title.trim().length > 0 && code.match(/^[A-Z]{2,6}[0-9]{0,2}$/);

  return (
    <Modal open={open} onClose={onClose} title="New series" size="md">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs uppercase tracking-wider text-text-muted mb-1.5">
              Code
            </label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm font-mono focus:outline-none focus:border-[var(--accent-primary)]"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-text-muted mb-1.5">
              Title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Sandy"
              className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm focus:outline-none focus:border-[var(--accent-primary)]"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-text-muted mb-1.5">
              Audience
            </label>
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value as typeof audience)}
              className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm focus:outline-none focus:border-[var(--accent-primary)]"
            >
              <option value="adult">Adult</option>
              <option value="kids">Kids</option>
              <option value="mixed">Mixed</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-text-muted mb-1.5">
              Genre
            </label>
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value as typeof genre)}
              className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm focus:outline-none focus:border-[var(--accent-primary)]"
            >
              <option value="comedy">Comedy</option>
              <option value="drama">Drama</option>
              <option value="doc">Documentary</option>
              <option value="sci_fi">Sci-fi</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-text-muted mb-1.5">
            Logline (optional)
          </label>
          <input
            value={logline}
            onChange={(e) => setLogline(e.target.value)}
            placeholder="One-sentence pitch"
            maxLength={200}
            className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm focus:outline-none focus:border-[var(--accent-primary)]"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-text-muted mb-1.5">
            Episode budget ceiling
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-muted">$</span>
            <input
              type="number"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              step="0.01"
              min="0"
              className="w-32 h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm font-mono focus:outline-none focus:border-[var(--accent-primary)]"
            />
            <span className="text-xs text-text-muted">per episode default</span>
          </div>
        </div>

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
            {pending ? 'Creating…' : 'Create series'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
