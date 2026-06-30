// ──────────────────────────────────────────────────────────────────────────────
// components/series-themes/SeriesThemesView.tsx
// Episode-Themes surface (q9a, 2026-06-30): a LIGHT, status-segmented index of
// per-theme assets (`SPC-theme_{slug}`), each a reusable visual gag engine.
//
// Replaces the single 500px monolithic markdown editor. Three groups —
// Approved · Draft · Invalidated — each a list of theme cards showing the
// one-liner (`description`) with a status control that moves the card to any
// other group (PATCH metadata.theme_status — no file rename). Click a card to
// expand the full `content` (read-only, with an in-place edit/save). "+ Add
// theme" creates a draft. Themes sit OUT of the EREF canon-gate by construction.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { ChevronDown, ChevronRight, Plus, Save, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { MarkdownEditor } from '@/components/editor/MarkdownEditor';
import { fetcher } from '@/lib/swr';
import { THEME_STATUSES, themeStatusLabel, type SeriesTheme, type ThemeStatus } from '@/lib/api/series-themes';

interface ThemesResponse {
  data: {
    series: { id: string; code: string; title: string };
    themes: SeriesTheme[];
  };
}

export interface SeriesThemesViewProps {
  seriesId: string;
}

const STATUS_ACCENT: Record<ThemeStatus, string> = {
  approved: 'var(--accent-success, #4ade80)',
  draft: 'var(--accent-warning, #fbbf24)',
  invalidated: 'var(--text-muted)',
};

export function SeriesThemesView({ seriesId }: SeriesThemesViewProps) {
  const { data, isLoading, mutate } = useSWR<ThemesResponse>(
    `/api/series/${seriesId}/themes`,
    fetcher,
    { refreshInterval: 10_000, revalidateOnFocus: true },
  );
  const themes = data?.data?.themes ?? [];
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const g: Record<ThemeStatus, SeriesTheme[]> = { approved: [], draft: [], invalidated: [] };
    for (const t of themes) g[t.theme_status].push(t);
    return g;
  }, [themes]);

  async function setStatus(themeId: string, theme_status: ThemeStatus) {
    setError(null);
    const res = await fetch(`/api/series/${seriesId}/themes`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ themeId, theme_status }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError((j as { error?: string }).error ?? 'Status change failed');
      return;
    }
    mutate();
  }

  if (isLoading) {
    return <p className="text-xs text-text-muted">Loading themes…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-text-secondary max-w-xl">
          Темы — переиспользуемые визуальные «движки гэгов». Лёгкий индекс: одна строка на тему,
          детали — по клику. Статус двигается свободно между группами и не трогает файл.
        </p>
        <Button onClick={() => setAdding((v) => !v)} disabled={adding}>
          <Plus size={14} /> Add theme
        </Button>
      </div>

      {error && (
        <p className="text-xs px-1" style={{ color: 'var(--accent-danger)' }}>
          {error}
        </p>
      )}

      {adding && (
        <AddThemeForm
          seriesId={seriesId}
          onDone={() => {
            setAdding(false);
            mutate();
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {themes.length === 0 && !adding && (
        <Card>
          <CardBody>
            <div className="text-center py-8 space-y-2">
              <Sparkles size={18} className="mx-auto text-text-muted" />
              <p className="text-sm text-text-primary">No themes yet.</p>
              <p className="text-xs text-text-secondary max-w-md mx-auto">
                Add a theme, or let Polina propose one (она кладёт его в Draft, ты двигаешь
                в Approved / Invalidated).
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      {THEME_STATUSES.map((status) => {
        const list = grouped[status];
        if (list.length === 0) return null;
        return (
          <section key={status} className="space-y-2">
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: STATUS_ACCENT[status] }}
              />
              {themeStatusLabel(status)}
              <span className="text-text-muted font-normal">· {list.length}</span>
            </h3>
            <div className="space-y-2">
              {list.map((t) => (
                <ThemeCard key={t.id} theme={t} onSetStatus={setStatus} onSaved={() => mutate()} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ── single theme card ──────────────────────────────────────────────────────────

interface ThemeCardProps {
  theme: SeriesTheme;
  onSetStatus: (themeId: string, status: ThemeStatus) => void;
  onSaved: () => void;
}

function ThemeCard({ theme, onSetStatus, onSaved }: ThemeCardProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(theme.content ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setContent(theme.content ?? '');
  }, [theme.id, theme.content]);

  async function save() {
    setSaving(true);
    setErr(null);
    const res = await fetch(`/api/assets/${theme.id}/content`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr((j as { error?: string }).error ?? 'Save failed');
      return;
    }
    setEditing(false);
    onSaved();
  }

  return (
    <Card>
      <CardBody>
        <div className="flex items-start gap-2">
          <button
            onClick={() => setOpen((v) => !v)}
            className="mt-0.5 text-text-muted hover:text-text-primary"
            aria-label={open ? 'Collapse' : 'Expand'}
          >
            {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
          <div className="min-w-0 flex-1">
            <button onClick={() => setOpen((v) => !v)} className="text-left w-full">
              <p className="text-sm text-text-primary">
                {theme.description || <span className="text-text-muted italic">(no one-liner)</span>}
              </p>
              <p className="text-[11px] font-mono text-text-muted mt-0.5">{theme.slug}</p>
            </button>
          </div>
          <select
            value={theme.theme_status}
            onChange={(e) => onSetStatus(theme.id, e.target.value as ThemeStatus)}
            className="text-[11px] rounded-md border border-[var(--border-subtle)] bg-[var(--panel-bg)] px-1.5 py-1 text-text-secondary"
            aria-label="Theme status"
          >
            {THEME_STATUSES.map((s) => (
              <option key={s} value={s}>
                {themeStatusLabel(s)}
              </option>
            ))}
          </select>
        </div>

        {open && (
          <div className="mt-3 pl-6 space-y-2">
            <MarkdownEditor
              value={content}
              onChange={setContent}
              readOnly={!editing}
              height={editing ? 360 : 240}
            />
            <div className="flex items-center gap-2">
              {editing ? (
                <Button variant="ghost" onClick={save} disabled={saving}>
                  <Save size={13} /> {saving ? 'Saving…' : 'Save'}
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => setEditing(true)}>
                  Edit
                </Button>
              )}
              {err && (
                <span className="text-xs" style={{ color: 'var(--accent-danger)' }}>
                  {err}
                </span>
              )}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ── add-theme form ──────────────────────────────────────────────────────────────

interface AddThemeFormProps {
  seriesId: string;
  onDone: () => void;
  onCancel: () => void;
}

function AddThemeForm({ seriesId, onDone, onCancel }: AddThemeFormProps) {
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    if (description.trim().length < 3) {
      setErr('Add a one-liner first.');
      return;
    }
    setSaving(true);
    setErr(null);
    const res = await fetch(`/api/series/${seriesId}/themes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: description.trim(), content }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr((j as { error?: string }).error ?? 'Create failed');
      return;
    }
    onDone();
  }

  return (
    <Card>
      <CardBody>
        <div className="space-y-2">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="One-liner — what the gag engine is (becomes the index text + slug)"
            className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--panel-bg)] px-2 py-1.5 text-sm text-text-primary"
          />
          <MarkdownEditor value={content} onChange={setContent} height={220} />
          <div className="flex items-center gap-2">
            <Button onClick={create} disabled={saving}>
              <Plus size={13} /> {saving ? 'Creating…' : 'Create draft'}
            </Button>
            <Button variant="ghost" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
            {err && (
              <span className="text-xs" style={{ color: 'var(--accent-danger)' }}>
                {err}
              </span>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
