// ──────────────────────────────────────────────────────────────────────────────
// components/settings/StorageSettings.tsx
// Settings → Storage tab (multi-channel Phase 4e rework).
// Two REAL knobs: local media-cache dir (env MEDIA_CACHE_DIR, applies live)
// and the Drive layout root folder name (app_config → persist-binary).
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, RefreshCw, Cloud, Folder } from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PeekHint } from '@/components/ui/PeekHint';

interface StorageState {
  media_cache_dir: string;
  media_cache_writable: boolean;
  drive_root_name: string;
  drive_validated: boolean;
  last_validated_at: string | null;
}

interface ProbeResult {
  writable: boolean;
  error?: string;
}

export function StorageSettings() {
  const [state, setState] = useState<StorageState | null>(null);
  const [cacheDraft, setCacheDraft] = useState('');
  const [driveDraft, setDriveDraft] = useState('');
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    fetch('/api/storage/config')
      .then((r) => r.json())
      .then((j: { data?: StorageState }) => {
        if (j.data) {
          setState(j.data);
          setCacheDraft(j.data.media_cache_dir);
          setDriveDraft(j.data.drive_root_name);
        }
      });
  }
  useEffect(reload, []);

  if (!state) return <p className="text-sm text-text-muted">Loading…</p>;

  const dirty = cacheDraft !== state.media_cache_dir || driveDraft !== state.drive_root_name;

  async function retest() {
    setPending(true);
    const j = await fetch('/api/storage/test-write', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: cacheDraft }),
    }).then((r) => r.json());
    setProbe((j as { data?: ProbeResult }).data ?? null);
    setPending(false);
  }

  async function save() {
    setPending(true);
    setError(null);
    const res = await fetch('/api/storage/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        media_cache_dir: cacheDraft.trim(),
        drive_root_name: driveDraft.trim(),
      }),
    });
    setPending(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? `Save failed (${res.status})`);
      return;
    }
    setProbe(null);
    reload();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>Storage</CardTitle>
          <PeekHint autoPeekMs={3500}>
            The media cache is the local mirror the UI serves previews from (applies live,
            no restart). The Drive root is the folder name all binaries are filed under on
            Google Drive — the canonical store.
          </PeekHint>
        </div>
      </CardHeader>
      <CardBody>
        <div className="space-y-4">
          <div className="rounded-lg border border-glass bg-panel-glass-strong px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium text-text-primary mb-1.5">
              <Folder size={14} />
              Media cache dir
            </div>
            <input
              value={cacheDraft}
              onChange={(e) => setCacheDraft(e.target.value)}
              className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm font-mono text-text-primary focus:outline-none focus:border-[var(--accent-primary)]"
              spellCheck={false}
            />
            <div className="flex items-center gap-1.5 mt-2 text-xs">
              {(probe?.writable ?? state.media_cache_writable) ? (
                <>
                  <CheckCircle2 size={12} className="text-[var(--accent-success)]" />
                  <span className="text-[var(--accent-success)]">writable</span>
                </>
              ) : (
                <>
                  <XCircle size={12} className="text-[var(--accent-danger)]" />
                  <span className="text-[var(--accent-danger)]">{probe?.error ?? 'not tested yet'}</span>
                </>
              )}
              <span className="text-text-muted ml-1">
                created automatically if missing · env MEDIA_CACHE_DIR
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-glass bg-panel-glass-strong px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium text-text-primary mb-1.5">
              <Cloud size={14} />
              Drive root folder
            </div>
            <input
              value={driveDraft}
              onChange={(e) => setDriveDraft(e.target.value)}
              className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm font-mono text-text-primary focus:outline-none focus:border-[var(--accent-primary)]"
              spellCheck={false}
            />
            <div className="flex items-center gap-1.5 mt-2 text-xs">
              {state.drive_validated ? (
                <>
                  <CheckCircle2 size={12} className="text-[var(--accent-success)]" />
                  <span className="text-[var(--accent-success)]">verified on Drive</span>
                </>
              ) : (
                <span className="text-text-muted">not verified yet (checked on save when Drive is authorized)</span>
              )}
            </div>
          </div>

          {error && (
            <div
              className="rounded-lg p-2.5 text-xs"
              style={{
                background: 'color-mix(in oklab, var(--accent-danger) 14%, transparent)',
                color: 'var(--accent-danger)',
              }}
            >
              {error}
            </div>
          )}

          <div className="pt-2 flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={retest} disabled={pending}>
              <RefreshCw size={14} /> Test cache dir
            </Button>
            <div className="flex items-center gap-3">
              {state.last_validated_at && (
                <span className="text-[11px] text-text-muted">
                  last saved {new Date(state.last_validated_at).toLocaleString()}
                </span>
              )}
              <Button size="sm" onClick={save} disabled={pending || !dirty}>
                {pending ? 'Saving…' : 'Save & validate'}
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-text-muted">
            <span aria-hidden>⚠</span>
            <span>Changing paths does not move existing content.</span>
            <PeekHint side="top" autoPeekMs={0}>
              New writes go to the new location. Existing cached media re-downloads from
              Drive on demand; existing Drive files stay under the old root.
            </PeekHint>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
