// ──────────────────────────────────────────────────────────────────────────────
// components/series-bible/GeneralIdeaEditor.tsx
// Markdown editor for the Bible's General idea section. There is at most one
// LOCKED + N revisable versions; we always edit the latest (highest version).
//
// MVP behaviour:
//   - If no general_idea asset exists → "Start writing" CTA → POST creates v01
//   - If an asset exists → edit content via /api/assets/[id]/content (when
//     editable) and Lock via /api/series/[id]/bible/[assetId]/lock
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useState, useEffect } from 'react';
import { Lock, Save, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { MarkdownEditor } from '@/components/editor/MarkdownEditor';
import type { BibleAsset } from '@/lib/api/series-bible';

const EDITABLE_STATUSES = new Set(['DRAFT', 'REVIEW', 'REVISION']);

export interface GeneralIdeaEditorProps {
  seriesId: string;
  seriesCode: string;
  assets: BibleAsset[];
  onChange: () => void;
}

export function GeneralIdeaEditor({
  seriesId,
  seriesCode: _seriesCode,
  assets,
  onChange,
}: GeneralIdeaEditorProps) {
  // Always edit the latest version. assets are ordered version DESC by API.
  const latest = assets[0] ?? null;
  const [content, setContent] = useState(latest?.content ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setContent(latest?.content ?? '');
  }, [latest?.id, latest?.content]);

  const editable = !latest || EDITABLE_STATUSES.has(latest.status);

  async function createInitial() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/series/${seriesId}/bible`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        section: 'general_idea',
        slug: 'main',
        content: '# General idea\n\n_(write your series premise, philosophy, world rules, and tone here)_\n',
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError((j as { error?: string }).error ?? 'Create failed');
      return;
    }
    onChange();
  }

  async function save() {
    if (!latest) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/assets/${latest.id}/content`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError((j as { error?: string }).error ?? 'Save failed');
      return;
    }
    onChange();
  }

  async function lock() {
    if (!latest) return;
    if (!confirm(`LOCK ${latest.filename}? Locked Bible assets are immutable.`)) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/series/${seriesId}/bible/${latest.id}/lock`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError((j as { error?: string }).error ?? 'Lock failed');
      return;
    }
    onChange();
  }

  if (!latest) {
    return (
      <Card>
        <CardBody>
          <div className="text-center py-10 space-y-3">
            <p className="text-base text-text-primary">No General idea yet.</p>
            <p className="text-xs text-text-secondary max-w-md mx-auto">
              The General idea is the textual side of your Series Bible — premise,
              philosophy, world rules, tone. Episode pipelines reference it as canon.
            </p>
            <Button onClick={createInitial} disabled={saving}>
              <Sparkles size={14} /> Start writing
            </Button>
            {error && <p className="text-xs" style={{ color: 'var(--accent-danger)' }}>{error}</p>}
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-[11px] text-text-muted font-mono">
          {latest.filename} · {latest.status}
        </div>
        <div className="flex items-center gap-2">
          {editable && (
            <Button variant="ghost" onClick={save} disabled={saving}>
              <Save size={13} /> {saving ? 'Saving…' : 'Save'}
            </Button>
          )}
          {latest.status !== 'LOCKED' && (
            <Button onClick={lock} disabled={saving}>
              <Lock size={13} /> Lock
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardBody>
          <MarkdownEditor
            value={content}
            onChange={setContent}
            readOnly={!editable}
            height={500}
          />
        </CardBody>
      </Card>

      {error && (
        <p className="text-xs px-3" style={{ color: 'var(--accent-danger)' }}>{error}</p>
      )}
    </div>
  );
}
