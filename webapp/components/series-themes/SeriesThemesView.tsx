// ──────────────────────────────────────────────────────────────────────────────
// components/series-themes/SeriesThemesView.tsx
// Episode-themes bank: a single markdown doc per series (file_type
// SPC-theme_bank), deliberately separate from the Series Bible so it stays OUT of
// the EREF canon-gate. Mirrors the Bible's General-idea editor pattern.
//
// A theme is a reusable visual gag engine; this bank holds the series' THEME-*
// candidates (developed/curated by the theme-development skills).
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { Save, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { MarkdownEditor } from '@/components/editor/MarkdownEditor';
import { fetcher } from '@/lib/swr';
import type { BibleAsset } from '@/lib/api/series-bible';

const EDITABLE_STATUSES = new Set(['DRAFT', 'REVIEW', 'REVISION']);

const SEED = `# Episode Themes — bank

> A theme is a reusable visual conflict engine (gag engine), not a story.
> Entries are \`THEME-*\` candidates developed by the theme-development skills
> (\`series-episode-theme-generation\` → \`series-episode-theme-selection\`), each
> with a tier (A/B/C/D) and a short report.

_(empty — generate and curate themes, then paste the A/B shortlist here)_
`;

interface ThemesResponse {
  data: {
    series: { id: string; code: string; title: string };
    assets: BibleAsset[];
  };
}

export interface SeriesThemesViewProps {
  seriesId: string;
}

export function SeriesThemesView({ seriesId }: SeriesThemesViewProps) {
  const { data, isLoading, mutate } = useSWR<ThemesResponse>(
    `/api/series/${seriesId}/themes`,
    fetcher,
    { refreshInterval: 10_000, revalidateOnFocus: true },
  );
  // assets are ordered version DESC by the API — always edit the latest.
  const latest = data?.data?.assets?.[0] ?? null;

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
    const res = await fetch(`/api/series/${seriesId}/themes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: SEED }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError((j as { error?: string }).error ?? 'Create failed');
      return;
    }
    mutate();
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
    mutate();
  }

  if (isLoading) {
    return <p className="text-xs text-text-muted">Loading themes…</p>;
  }

  if (!latest) {
    return (
      <Card>
        <CardBody>
          <div className="text-center py-10 space-y-3">
            <p className="text-base text-text-primary">No theme bank yet.</p>
            <p className="text-xs text-text-secondary max-w-md mx-auto">
              The theme bank holds this series&apos; episode themes — reusable visual
              gag engines. It is separate from the Bible, so it never gates reference
              generation.
            </p>
            <Button onClick={createInitial} disabled={saving}>
              <Sparkles size={14} /> Start the theme bank
            </Button>
            {error && (
              <p className="text-xs" style={{ color: 'var(--accent-danger)' }}>
                {error}
              </p>
            )}
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
        {editable && (
          <Button variant="ghost" onClick={save} disabled={saving}>
            <Save size={13} /> {saving ? 'Saving…' : 'Save'}
          </Button>
        )}
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
        <p className="text-xs px-3" style={{ color: 'var(--accent-danger)' }}>
          {error}
        </p>
      )}
    </div>
  );
}
