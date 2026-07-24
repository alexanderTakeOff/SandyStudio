// ──────────────────────────────────────────────────────────────────────────────
// app/(studio)/episodes/page.tsx — Episodes list. Link to /episodes/[id]
// (Pipeline View). + New Episode CTA. Filterable by status / series.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { Plus, Film, Trash2, AlertTriangle } from 'lucide-react';
import { StudioContentFrame } from '@/components/studio-shell/StudioContentFrame';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { fetcher } from '@/lib/swr';
import { NewEpisodeModal } from '@/components/episodes/NewEpisodeModal';

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function trashedOverAYear(e: EpisodeRow): boolean {
  const at = e.metadata?.archival?.archived_at;
  if (e.status !== 'ARCHIVED' || !at) return false;
  return Date.now() - new Date(at).getTime() > ONE_YEAR_MS;
}

interface EpisodeArchival {
  state?: 'PARTIAL' | 'COMPLETE';
  completed_shots?: number;
  total_shots?: number | null;
  archived_at?: string;
  reason?: string;
}

interface EpisodeRow {
  id: string;
  episode_code: string;
  title_working: string | null;
  status: string;
  governance_mode: number;
  budget_ceiling: number | null;
  budget_spent: number | null;
  series_id: string;
  created_at: string;
  metadata?: { archival?: EpisodeArchival } | null;
}

// TRASH = the ARCHIVED bucket (retired / abandoned). ACTIVE is anything still in
// flight — neither finished (COMPLETE) nor trashed (ARCHIVED). This is why an
// archived episode used to leak into ACTIVE: the old predicate only excluded
// COMPLETE.
const ACTIVE_FILTER: Record<string, (e: EpisodeRow) => boolean> = {
  all: () => true,
  active: (e) => e.status !== 'COMPLETE' && e.status !== 'ARCHIVED',
  complete: (e) => e.status === 'COMPLETE',
  trash: (e) => e.status === 'ARCHIVED',
};

type Filter = keyof typeof ACTIVE_FILTER;

export default function EpisodesPage() {
  const [filter, setFilter] = useState<Filter>('active');
  const [newOpen, setNewOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EpisodeRow | null>(null);
  const { data, isLoading, mutate } = useSWR<{ data: EpisodeRow[] }>(
    '/api/episodes?limit=100',
    fetcher,
    { refreshInterval: 30_000 },
  );
  const all = data?.data ?? [];
  const episodes = all.filter(ACTIVE_FILTER[filter] ?? (() => true));
  const staleTrashCount = all.filter(trashedOverAYear).length;

  return (
    <StudioContentFrame>
      {/* q4: reminder only at the moment of starting a new episode — nag-free. */}
      {newOpen && staleTrashCount > 0 && (
        <div
          className="mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
          style={{
            background: 'color-mix(in oklab, var(--accent-warning) 12%, transparent)',
            color: 'var(--accent-warning)',
          }}
        >
          <AlertTriangle size={14} />
          <span>
            {staleTrashCount} episode{staleTrashCount > 1 ? 's have' : ' has'} been in Trash over a
            year. Open the <button
              type="button"
              onClick={() => { setNewOpen(false); setFilter('trash'); }}
              className="underline underline-offset-2 font-medium"
            >TRASH</button> tab to delete them for good.
          </span>
        </div>
      )}
      <header className="flex items-center justify-between mb-5">
        <div>
          <div className="flex items-center gap-2">
            <Film size={18} className="text-text-secondary" />
            <h1 className="text-2xl font-semibold text-text-primary">Episodes</h1>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            Every episode across all series. Click one to open its pipeline view.
          </p>
        </div>
        <Button onClick={() => setNewOpen(true)}>
          <Plus size={14} /> New Episode
        </Button>
      </header>

      <div className="flex gap-2 mb-4">
        {(['active', 'all', 'complete', 'trash'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-3 h-8 rounded-md text-xs font-medium uppercase tracking-wider border transition-colors"
            style={{
              borderColor: filter === f ? 'var(--accent-primary)' : 'var(--panel-glass-border)',
              background: filter === f
                ? 'color-mix(in oklab, var(--accent-primary) 14%, transparent)'
                : 'transparent',
              color: filter === f ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-xs text-text-muted">Loading…</p>}
      {!isLoading && episodes.length === 0 && (
        <Card>
          <CardBody>
            <div className="text-center py-12">
              <p className="text-base text-text-primary">No episodes yet.</p>
              <p className="text-sm text-text-secondary mt-2">
                Create the first one — agents will start picking up the brief once it&rsquo;s approved.
              </p>
              <div className="mt-4">
                <Button onClick={() => setNewOpen(true)}>
                  <Plus size={14} /> Create first episode
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      <div className="grid gap-3">
        {episodes.map((ep) => (
          <Link
            key={ep.id}
            href={`/episodes/${ep.id}`}
            className="block rounded-xl border border-glass bg-panel-glass-strong px-4 py-3 hover:border-glass-active transition-colors"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span
                    className="text-sm font-mono"
                    style={{
                      color:
                        ep.status === 'ARCHIVED'
                          ? 'var(--accent-warning)'
                          : 'var(--text-primary)',
                    }}
                  >
                    {ep.episode_code}
                  </span>
                  {ep.title_working && (
                    <span
                      className="text-xs truncate"
                      style={{
                        color:
                          ep.status === 'ARCHIVED'
                            ? 'color-mix(in oklab, var(--accent-warning) 70%, var(--text-muted))'
                            : 'var(--text-secondary)',
                      }}
                    >
                      &ldquo;{ep.title_working}&rdquo;
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-text-muted mt-0.5 flex gap-2">
                  <span>{ep.status.replace(/_/g, ' ').toLowerCase()}</span>
                  <span>·</span>
                  <span>Mode {ep.governance_mode}</span>
                  <span>·</span>
                  <span>
                    ${(ep.budget_spent ?? 0).toFixed(2)} / ${(ep.budget_ceiling ?? 0).toFixed(2)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-text-muted">
                  {new Date(ep.created_at).toLocaleDateString()}
                </span>
                {ep.status === 'ARCHIVED' && (
                  <button
                    type="button"
                    title="Delete forever"
                    onClick={(e) => {
                      // Row is a <Link> — stop navigation, open the purge modal.
                      e.preventDefault();
                      e.stopPropagation();
                      setDeleteTarget(ep);
                    }}
                    className="inline-flex items-center gap-1 rounded-md px-2 h-7 text-[11px] font-medium border transition-colors"
                    style={{
                      borderColor: 'color-mix(in oklab, var(--accent-danger) 40%, transparent)',
                      color: 'var(--accent-danger)',
                    }}
                  >
                    <Trash2 size={12} /> Delete forever
                  </button>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>

      <NewEpisodeModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={() => {
          setNewOpen(false);
          mutate();
        }}
      />

      <DeleteForeverModal
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => {
          setDeleteTarget(null);
          mutate();
        }}
      />
    </StudioContentFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// DeleteForeverModal — irreversible purge of a TRASH (ARCHIVED) episode.
// Optional "delete media?" toggle purges the Drive raw/approved files too.
// Never touches YouTube (q6y). Type-to-confirm guards the irreversible action.
// ──────────────────────────────────────────────────────────────────────────────
function DeleteForeverModal({
  target,
  onClose,
  onDeleted,
}: {
  target: EpisodeRow | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleteMedia, setDeleteMedia] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const code = target?.episode_code ?? '';
  const canFire = confirm.trim() === code && !pending;

  async function fire() {
    if (!target || !canFire) return;
    setPending(true);
    setErr(null);
    const res = await fetch(`/api/episodes/${target.id}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ delete_media: deleteMedia }),
    });
    setPending(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(j.error ?? `Delete failed (${res.status})`);
      return;
    }
    onDeleted();
    setDeleteMedia(false);
    setConfirm('');
  }

  return (
    <Modal open={target !== null} onClose={onClose} title={`Delete ${code} forever`}>
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">
          This permanently removes the episode and all its asset/job records. This
          cannot be undone.
        </p>
        <label className="flex items-start gap-2 text-sm text-text-primary cursor-pointer">
          <input
            type="checkbox"
            checked={deleteMedia}
            onChange={(e) => setDeleteMedia(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Also delete media files from Drive (raw + approved images/video/audio).
            <span className="block text-xs text-text-muted mt-0.5">
              Published YouTube videos are never touched.
            </span>
          </span>
        </label>
        <div>
          <label className="block text-xs uppercase tracking-wider text-text-muted mb-1.5">
            Type <code className="font-mono text-text-primary">{code}</code> to confirm
          </label>
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={code}
            className="w-full h-10 px-3 rounded-lg border border-glass bg-transparent text-sm text-text-primary outline-none focus:border-glass-active"
          />
        </div>
        {err && <p className="text-xs text-[var(--accent-danger)]">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={!canFire}
            onClick={fire}
          >
            <Trash2 size={14} /> {pending ? 'Deleting…' : 'Delete forever'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
