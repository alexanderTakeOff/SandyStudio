// ──────────────────────────────────────────────────────────────────────────────
// components/series-themes/SeriesThemesView.tsx
// Episode-Themes surface (q9a, 2026-06-30): a LIGHT, status-filtered index of
// per-theme assets (`SPC-theme_{slug}`), each a reusable visual gag engine.
//
// 2026-07-29 — picking a theme should not mean re-reading every theme:
//   · fourth status `used` + the `IN E16` stamp answers "which ones are spent";
//   · one filter row (All · Approved · Draft · In use · Invalidated) replaces the
//     three stacked status sections — with a filter the grouping was dead weight;
//   · colour comes from the semantic status tokens (THEME_STATUS_TOKEN), so the
//     row is recognised by hue instead of read word by word.
//
// Click a card to expand the full `content` (read-only, with an in-place edit).
// "+ Add theme" creates a draft. Themes sit OUT of the EREF canon-gate by
// construction.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { ChevronDown, ChevronRight, Plus, Save, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { FilterPills, type FilterPillOption } from '@/components/ui/FilterPills';
import { MarkdownEditor } from '@/components/editor/MarkdownEditor';
import { fetcher } from '@/lib/swr';
import {
  themeStatusLabel,
  themeUsageLabel,
  THEME_STATUSES,
  THEME_STATUS_TOKEN,
  type SeriesTheme,
  type ThemeStatus,
} from '@/lib/api/series-themes';

interface ThemesResponse {
  data: {
    series: { id: string; code: string; title: string };
    themes: SeriesTheme[];
  };
}

/** Only what the episode picker needs off /api/episodes. */
interface EpisodeOption {
  id: string;
  episode_code: string;
  title_working: string | null;
}

export interface SeriesThemesViewProps {
  seriesId: string;
}

type ThemeFilter = 'all' | ThemeStatus;

export function SeriesThemesView({ seriesId }: SeriesThemesViewProps) {
  const { data, isLoading, mutate } = useSWR<ThemesResponse>(
    `/api/series/${seriesId}/themes`,
    fetcher,
    { refreshInterval: 10_000, revalidateOnFocus: true },
  );
  // Episodes of THIS series — the picker behind the `IN E16` stamp. Cheap enough
  // to load with the tab; no refresh interval (the list barely moves).
  const { data: epData } = useSWR<{ data: EpisodeOption[] }>(
    `/api/episodes?limit=100&series_id=${seriesId}`,
    fetcher,
  );
  const episodes = epData?.data ?? [];

  const themes = data?.data?.themes ?? [];
  const [filter, setFilter] = useState<ThemeFilter>('all');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filterOptions = useMemo<FilterPillOption<ThemeFilter>[]>(() => {
    const counts = themes.reduce<Record<string, number>>((acc, t) => {
      acc[t.theme_status] = (acc[t.theme_status] ?? 0) + 1;
      return acc;
    }, {});
    return [
      { id: 'all' as const, label: 'All', count: themes.length },
      ...THEME_STATUSES.map((s) => ({
        id: s,
        label: themeStatusLabel(s),
        count: counts[s] ?? 0,
        cssVar: THEME_STATUS_TOKEN[s],
      })),
    ];
  }, [themes]);

  const visible = useMemo(
    () => (filter === 'all' ? themes : themes.filter((t) => t.theme_status === filter)),
    [themes, filter],
  );

  async function setStatus(themeId: string, theme_status: ThemeStatus, episodeId?: string) {
    setError(null);
    const res = await fetch(`/api/series/${seriesId}/themes`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ themeId, theme_status, ...(episodeId ? { episode_id: episodeId } : {}) }),
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
          детали — по клику. Статус двигается свободно и не трогает файл; «In use» помечает тему
          эпизодом, в который она ушла.
        </p>
        <Button onClick={() => setAdding((v) => !v)} disabled={adding}>
          <Plus size={14} /> Add theme
        </Button>
      </div>

      {themes.length > 0 && (
        <FilterPills options={filterOptions} value={filter} onChange={setFilter} />
      )}

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
                в Approved / In use / Invalidated).
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      {themes.length > 0 && visible.length === 0 && (
        <p className="text-xs text-text-muted px-1">Нет тем в этом статусе.</p>
      )}

      <div className="space-y-2">
        {visible.map((t) => (
          <ThemeCard
            key={t.id}
            theme={t}
            episodes={episodes}
            onSetStatus={setStatus}
            onSaved={() => mutate()}
          />
        ))}
      </div>
    </div>
  );
}

// ── single theme card ──────────────────────────────────────────────────────────

interface ThemeCardProps {
  theme: SeriesTheme;
  episodes: EpisodeOption[];
  onSetStatus: (themeId: string, status: ThemeStatus, episodeId?: string) => void;
  onSaved: () => void;
}

function ThemeCard({ theme, episodes, onSetStatus, onSaved }: ThemeCardProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(theme.content ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Non-null while the Director is choosing which episode consumed the theme.
  const [pickingFor, setPickingFor] = useState<ThemeStatus | null>(null);

  useEffect(() => {
    setContent(theme.content ?? '');
  }, [theme.id, theme.content]);

  const tint = `var(${THEME_STATUS_TOKEN[theme.theme_status]})`;
  const usage = themeUsageLabel(theme.used_in_episodes);

  function onStatusPicked(next: ThemeStatus) {
    // `used` is the one status that carries data — ask for the episode first.
    if (next === 'used') {
      setPickingFor('used');
      return;
    }
    setPickingFor(null);
    onSetStatus(theme.id, next);
  }

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

          {usage && (
            <button
              type="button"
              onClick={() => setPickingFor(theme.theme_status)}
              title={`Used in ${theme.used_in_episodes.map((r) => r.code).join(', ')} — click to add another`}
              className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide"
              style={{
                borderColor: `var(${THEME_STATUS_TOKEN.used})`,
                color: `var(${THEME_STATUS_TOKEN.used})`,
                background: `color-mix(in oklab, var(${THEME_STATUS_TOKEN.used}) 12%, transparent)`,
              }}
            >
              {usage}
            </button>
          )}

          <select
            value={theme.theme_status}
            onChange={(e) => onStatusPicked(e.target.value as ThemeStatus)}
            className="shrink-0 text-[11px] rounded-md border px-1.5 py-1"
            style={{
              borderColor: tint,
              color: tint,
              background: `color-mix(in oklab, ${tint} 10%, transparent)`,
            }}
            aria-label="Theme status"
          >
            {THEME_STATUSES.map((s) => (
              <option key={s} value={s}>
                {themeStatusLabel(s)}
              </option>
            ))}
          </select>
        </div>

        {pickingFor && (
          <EpisodePicker
            episodes={episodes}
            onCancel={() => setPickingFor(null)}
            onPick={(episodeId) => {
              setPickingFor(null);
              onSetStatus(theme.id, 'used', episodeId);
            }}
          />
        )}

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

// ── episode picker (inline, only while marking a theme "In use") ───────────────

interface EpisodePickerProps {
  episodes: EpisodeOption[];
  onPick: (episodeId: string) => void;
  onCancel: () => void;
}

function EpisodePicker({ episodes, onPick, onCancel }: EpisodePickerProps) {
  if (episodes.length === 0) {
    return (
      <div className="mt-2 pl-6 flex items-center gap-2 text-xs text-text-secondary">
        <span>В этой серии ещё нет эпизодов — пометить тему нечем.</span>
        <button type="button" onClick={onCancel} className="underline underline-offset-2">
          Cancel
        </button>
      </div>
    );
  }
  return (
    <div className="mt-2 pl-6 flex items-center gap-2">
      <span className="text-xs text-text-secondary">Used in</span>
      <select
        defaultValue=""
        onChange={(e) => e.target.value && onPick(e.target.value)}
        className="text-xs rounded-md border border-[var(--border-subtle)] bg-[var(--panel-bg)] px-1.5 py-1 text-text-primary"
        aria-label="Episode that used this theme"
      >
        <option value="" disabled>
          Pick episode…
        </option>
        {episodes.map((e) => (
          <option key={e.id} value={e.id}>
            {e.episode_code}
            {e.title_working ? ` — ${e.title_working}` : ''}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onCancel}
        className="text-xs text-text-muted underline underline-offset-2"
      >
        Cancel
      </button>
    </div>
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
