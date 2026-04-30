// ──────────────────────────────────────────────────────────────────────────────
// components/editor/EditorModal.tsx
// Open from kebab "Edit" — fetches asset content, lets Director edit via
// CodeMirror, saves back. APPROVED/LOCKED assets are read-only.
//
// Reads/writes the disk file at staging_path. After successful save, asset
// row is touched (description timestamp) so SWR feeds revalidate.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useState } from 'react';
import { Save, Lock } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { MarkdownEditor } from './MarkdownEditor';

interface EditorModalProps {
  open: boolean;
  onClose: () => void;
  assetId: string | null;
  assetFilename?: string;
  /** Direct hint about whether this asset is in a locked state. */
  isLocked?: boolean;
  onSaved?: () => void;
}

interface ContentResponse {
  data: {
    content: string;
    asset: {
      id: string;
      filename: string;
      file_type: string;
      status: string;
      version: number | null;
    };
    editable: boolean;
  };
}

export function EditorModal({
  open,
  onClose,
  assetId,
  assetFilename,
  isLocked,
  onSaved,
}: EditorModalProps) {
  const [content, setContent] = useState<string>('');
  const [original, setOriginal] = useState<string>('');
  const [editable, setEditable] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !assetId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/assets/${assetId}/content`)
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(
            (j as { error?: string }).error ?? `Load failed (${res.status})`,
          );
        }
        return res.json() as Promise<ContentResponse>;
      })
      .then((j) => {
        if (cancelled) return;
        setContent(j.data.content);
        setOriginal(j.data.content);
        setEditable(j.data.editable && !isLocked);
        setStatus(j.data.asset.status);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, assetId, isLocked]);

  async function save() {
    if (!assetId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/assets/${assetId}/content`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `Save failed (${res.status})`);
      }
      setOriginal(content);
      onSaved?.();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const dirty = content !== original;

  return (
    <Modal
      open={open}
      onClose={() => {
        if (saving) return;
        if (dirty && !confirm('Discard unsaved changes?')) return;
        onClose();
      }}
      title={assetFilename ? `Edit · ${assetFilename}` : 'Edit asset'}
      size="lg"
    >
      <div className="space-y-3">
        {loading && (
          <p className="text-sm text-text-secondary">Loading content…</p>
        )}

        {!loading && !editable && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg border text-xs"
            style={{
              background: 'color-mix(in oklab, var(--accent-info) 10%, transparent)',
              borderColor: 'color-mix(in oklab, var(--accent-info) 35%, transparent)',
              color: 'var(--accent-info)',
            }}
          >
            <Lock size={14} />
            <span>
              Read-only — asset is {status}. Request revision first to edit.
            </span>
          </div>
        )}

        {!loading && (
          <MarkdownEditor
            value={content}
            onChange={setContent}
            readOnly={!editable}
            height={460}
          />
        )}

        {error && (
          <p className="text-xs" style={{ color: 'var(--accent-danger)' }}>
            {error}
          </p>
        )}

        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-text-muted">
            {dirty ? 'Unsaved changes' : 'No changes'}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={save}
              disabled={!editable || !dirty || saving}
            >
              <Save size={14} /> {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
