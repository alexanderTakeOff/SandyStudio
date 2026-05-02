// ──────────────────────────────────────────────────────────────────────────────
// components/onboarding/StorageStep.tsx
// Step 1 — storage path configuration with write-test probe.
// Per onboarding.md §4 + storage_configuration.md §3.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Cloud, Folder, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface StorageState {
  project_root: string;
  media_storage_root: string;
  project_root_writable: boolean;
  media_root_writable: boolean;
}

interface ProbeResult {
  writable: boolean;
  error?: string;
  drive_detected?: boolean;
}

interface StorageStepProps {
  onAdvance: () => void;
}

export function StorageStep({ onAdvance }: StorageStepProps) {
  const [state, setState] = useState<StorageState | null>(null);
  const [pr, setPr] = useState<ProbeResult | null>(null);
  const [mr, setMr] = useState<ProbeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    fetch('/api/storage/config')
      .then((r) => r.json())
      .then((j: { data?: StorageState }) => {
        if (j.data) setState(j.data);
      });
  }, []);

  if (!state) return <p className="text-sm text-text-muted">Loading…</p>;

  async function runProbe() {
    if (!state) return;
    setLoading(true);
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
    setLoading(false);
  }

  async function persist() {
    if (!state) return;
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
    await fetch('/api/onboarding/advance', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ step: 1 }),
    });
    onAdvance();
  }

  const bothWritable = (pr?.writable ?? state.project_root_writable) && (mr?.writable ?? state.media_root_writable);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">Storage locations</h2>
        <p className="text-sm text-text-secondary mt-1">
          Where should SandyStudio write your films?
        </p>
      </div>

      <PathField
        label="Project root"
        sublabel="scripts, briefs, bibles, reviews"
        icon={<Folder size={14} />}
        value={state.project_root}
        onChange={(v) => setState({ ...state, project_root: v })}
        result={pr ?? (state.project_root_writable ? { writable: true } : null)}
      />
      <PathField
        label="Media storage"
        sublabel="images, video, audio (heavy binaries)"
        icon={<Cloud size={14} />}
        value={state.media_storage_root}
        onChange={(v) => setState({ ...state, media_storage_root: v })}
        result={mr ?? (state.media_root_writable ? { writable: true } : null)}
      />

      <div className="flex items-center justify-between gap-3 pt-3">
        <Button variant="ghost" onClick={runProbe} disabled={loading}>
          {loading ? <><Loader2 size={14} className="animate-spin" /> Testing</> : 'Run write-test'}
        </Button>
        <div className="flex gap-2">
          <Button onClick={persist} disabled={!bothWritable || pending}>
            {pending ? 'Saving…' : 'Continue →'}
          </Button>
        </div>
      </div>

      <p className="text-[11px] text-text-muted">
        These paths are remembered per workstation. New writes go to the new
        path; existing project folders stay where they are (their PROJECT.md
        is the authoritative anchor).
      </p>
    </div>
  );
}

function PathField({
  label,
  sublabel,
  icon,
  value,
  onChange,
  result,
}: {
  label: string;
  sublabel: string;
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  result: ProbeResult | null;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
          {icon}
          {label}
        </div>
        <span className="text-[11px] text-text-muted">{sublabel}</span>
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm font-mono text-text-primary focus:outline-none focus:border-[var(--accent-primary)]"
        spellCheck={false}
      />
      {result && (
        <div className="flex items-center gap-1.5 mt-2 text-xs">
          {result.writable ? (
            <>
              <CheckCircle2 size={12} className="text-[var(--accent-success)]" />
              <span className="text-[var(--accent-success)]">writable</span>
              {result.drive_detected && (
                <span className="text-text-muted">· Google Drive folder detected</span>
              )}
            </>
          ) : (
            <>
              <XCircle size={12} className="text-[var(--accent-danger)]" />
              <span className="text-[var(--accent-danger)]">{result.error}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
