// ──────────────────────────────────────────────────────────────────────────────
// components/settings/StorageSettings.tsx
// Settings → Storage tab per storage_configuration.md §5.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, RefreshCw, Cloud, Folder } from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PeekHint } from '@/components/ui/PeekHint';

interface StorageState {
  project_root: string;
  media_storage_root: string;
  project_root_writable: boolean;
  media_root_writable: boolean;
  last_validated_at: string | null;
}

interface ProbeResult {
  writable: boolean;
  error?: string;
}

export function StorageSettings() {
  const [state, setState] = useState<StorageState | null>(null);
  const [pr, setPr] = useState<ProbeResult | null>(null);
  const [mr, setMr] = useState<ProbeResult | null>(null);
  const [editing, setEditing] = useState<'project' | 'media' | null>(null);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);

  function reload() {
    fetch('/api/storage/config')
      .then((r) => r.json())
      .then((j: { data?: StorageState }) => {
        if (j.data) setState(j.data);
      });
  }
  useEffect(reload, []);

  if (!state) return <p className="text-sm text-text-muted">Loading…</p>;

  async function retest() {
    if (!state) return;
    setPending(true);
    const [a, b] = await Promise.all([
      fetch('/api/storage/test-write', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: state.project_root, kind: 'project_root' }),
      }).then((r) => r.json()),
      fetch('/api/storage/test-write', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: state.media_storage_root, kind: 'media_storage_root' }),
      }).then((r) => r.json()),
    ]);
    setPr(a.data ?? null);
    setMr(b.data ?? null);
    setPending(false);
  }

  async function save() {
    if (!state) return;
    if (editing === 'project') state.project_root = draft;
    if (editing === 'media') state.media_storage_root = draft;
    setPending(true);
    const res = await fetch('/api/storage/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        project_root: state.project_root,
        media_storage_root: state.media_storage_root,
      }),
    });
    setPending(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert((j as { error?: string }).error ?? 'Save failed');
      return;
    }
    setEditing(null);
    setDraft('');
    setPr(null);
    setMr(null);
    reload();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>Storage</CardTitle>
          <PeekHint autoPeekMs={3500}>
            Project root holds bibles and scripts; media storage holds heavy binaries. Both are
            tested for write access on save.
          </PeekHint>
        </div>
      </CardHeader>
      <CardBody>
        <div className="space-y-4">
          <PathRow
            icon={<Folder size={14} />}
            label="Project root"
            value={state.project_root}
            writable={pr?.writable ?? state.project_root_writable}
            error={pr?.error}
            onEdit={() => {
              setEditing('project');
              setDraft(state.project_root);
            }}
            editing={editing === 'project'}
            draft={draft}
            onDraft={setDraft}
            onSave={save}
            onCancel={() => {
              setEditing(null);
              setDraft('');
            }}
            pending={pending}
          />
          <PathRow
            icon={<Cloud size={14} />}
            label="Media storage"
            value={state.media_storage_root}
            writable={mr?.writable ?? state.media_root_writable}
            error={mr?.error}
            onEdit={() => {
              setEditing('media');
              setDraft(state.media_storage_root);
            }}
            editing={editing === 'media'}
            draft={draft}
            onDraft={setDraft}
            onSave={save}
            onCancel={() => {
              setEditing(null);
              setDraft('');
            }}
            pending={pending}
          />

          <div className="pt-2 flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={retest} disabled={pending}>
              <RefreshCw size={14} /> Re-test all paths
            </Button>
            {state.last_validated_at && (
              <span className="text-[11px] text-text-muted">
                last tested {new Date(state.last_validated_at).toLocaleString()}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-text-muted">
            <span aria-hidden>⚠</span>
            <span>Changing paths does not move existing content.</span>
            <PeekHint side="top" autoPeekMs={0}>
              New writes go to the new path. Existing series stay where they are — their
              PROJECT.md remains the authoritative anchor.
            </PeekHint>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

interface PathRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  writable: boolean;
  error?: string;
  onEdit: () => void;
  editing: boolean;
  draft: string;
  onDraft: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  pending: boolean;
}

function PathRow({
  icon,
  label,
  value,
  writable,
  error,
  onEdit,
  editing,
  draft,
  onDraft,
  onSave,
  onCancel,
  pending,
}: PathRowProps) {
  return (
    <div className="rounded-lg border border-glass bg-panel-glass-strong px-4 py-3">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
          {icon}
          {label}
        </div>
        {!editing && (
          <Button variant="ghost" size="sm" onClick={onEdit}>
            Edit
          </Button>
        )}
      </div>
      {editing ? (
        <>
          <input
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
            className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm font-mono"
            spellCheck={false}
          />
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button size="sm" onClick={onSave} disabled={pending}>
              {pending ? 'Saving…' : 'Save & test'}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="text-sm font-mono text-text-secondary">{value}</div>
          <div className="flex items-center gap-1.5 mt-2 text-xs">
            {writable ? (
              <>
                <CheckCircle2 size={12} className="text-[var(--accent-success)]" />
                <span className="text-[var(--accent-success)]">writable</span>
              </>
            ) : (
              <>
                <XCircle size={12} className="text-[var(--accent-danger)]" />
                <span className="text-[var(--accent-danger)]">{error ?? 'not writable — re-test'}</span>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
