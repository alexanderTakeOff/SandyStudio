// ──────────────────────────────────────────────────────────────────────────────
// components/onboarding/StorageStep.tsx
// Step 1 — storage configuration (multi-channel Phase 4e rework).
// Two REAL knobs: local media-cache dir + Drive root folder name.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Cloud, Folder, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface StorageState {
  media_cache_dir: string;
  media_cache_writable: boolean;
  drive_root_name: string;
}

interface ProbeResult {
  writable: boolean;
  error?: string;
}

interface StorageStepProps {
  onAdvance: () => void;
}

export function StorageStep({ onAdvance }: StorageStepProps) {
  const [cacheDir, setCacheDir] = useState('');
  const [driveRoot, setDriveRoot] = useState('');
  const [cacheWritable, setCacheWritable] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/storage/config')
      .then((r) => r.json())
      .then((j: { data?: StorageState }) => {
        if (j.data) {
          setCacheDir(j.data.media_cache_dir);
          setDriveRoot(j.data.drive_root_name);
          setCacheWritable(j.data.media_cache_writable);
        }
        setLoaded(true);
      });
  }, []);

  if (!loaded) return <p className="text-sm text-text-muted">Loading…</p>;

  async function runProbe() {
    setLoading(true);
    const j = await fetch('/api/storage/test-write', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: cacheDir }),
    }).then((r) => r.json());
    setProbe((j as { data?: ProbeResult }).data ?? null);
    setLoading(false);
  }

  async function persist() {
    setPending(true);
    setError(null);
    const res = await fetch('/api/storage/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        media_cache_dir: cacheDir.trim(),
        drive_root_name: driveRoot.trim(),
      }),
    });
    setPending(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? 'Save failed');
      return;
    }
    await fetch('/api/onboarding/advance', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ step: 1 }),
    });
    onAdvance();
  }

  const writable = probe?.writable ?? cacheWritable;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">Storage</h2>
        <p className="text-sm text-text-secondary mt-1">
          Where should SandyStudio keep its local media cache — and under which
          Google Drive folder should originals be filed?
        </p>
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <div className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
            <Folder size={14} />
            Media cache dir
          </div>
          <span className="text-[11px] text-text-muted">local previews · created if missing</span>
        </div>
        <input
          value={cacheDir}
          onChange={(e) => setCacheDir(e.target.value)}
          className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm font-mono text-text-primary focus:outline-none focus:border-[var(--accent-primary)]"
          spellCheck={false}
        />
        {probe && (
          <div className="flex items-center gap-1.5 mt-2 text-xs">
            {probe.writable ? (
              <>
                <CheckCircle2 size={12} className="text-[var(--accent-success)]" />
                <span className="text-[var(--accent-success)]">writable</span>
              </>
            ) : (
              <>
                <XCircle size={12} className="text-[var(--accent-danger)]" />
                <span className="text-[var(--accent-danger)]">{probe.error}</span>
              </>
            )}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <div className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
            <Cloud size={14} />
            Drive root folder
          </div>
          <span className="text-[11px] text-text-muted">canonical store on Google Drive</span>
        </div>
        <input
          value={driveRoot}
          onChange={(e) => setDriveRoot(e.target.value)}
          className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm font-mono text-text-primary focus:outline-none focus:border-[var(--accent-primary)]"
          spellCheck={false}
        />
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

      <div className="flex items-center justify-between gap-3 pt-3">
        <Button variant="ghost" onClick={runProbe} disabled={loading}>
          {loading ? <><Loader2 size={14} className="animate-spin" /> Testing</> : 'Run write-test'}
        </Button>
        <Button onClick={persist} disabled={!writable || pending}>
          {pending ? 'Saving…' : 'Continue →'}
        </Button>
      </div>

      <p className="text-[11px] text-text-muted">
        The cache dir is remembered per workstation (env, applies live). The Drive
        folder is found-or-created on save when Drive is authorized.
      </p>
    </div>
  );
}
