// ──────────────────────────────────────────────────────────────────────────────
// components/series/SeriesDistributionCard.tsx
// Series-level distribution & branding editor (multi-channel Phase 4c).
// Writes the series.metadata keys the agents actually read:
//   youtube_playlist_id  → short-linkage.ts (playlist queueing; env fallback is gone)
//   delivery_targets[]   → delivery-targets.ts (per-episode fallback)
//   gag_taxonomy[]       → audience advisor holes map
//   branding.*           → branding.ts cascade (series overrides the channel)
// Empty field = key removed → falls back to the channel / neutral default.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useState } from 'react';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PeekHint } from '@/components/ui/PeekHint';

const BRANDING_FIELDS = [
  { key: 'short_overlay_text', label: 'Shorts overlay text' },
  { key: 'short_description', label: 'Shorts description' },
  { key: 'short_tags', label: 'Shorts tags (comma-separated)', isList: true },
  { key: 'subscribe_cta', label: 'Subscribe CTA (long-form)' },
  { key: 'long_description_boilerplate', label: 'Description boilerplate (long-form)' },
] as const;

function metaObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function listToText(v: unknown): string {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').join(', ') : '';
}

function textToList(raw: string): string[] | null {
  const items = raw.split(',').map((t) => t.trim()).filter(Boolean);
  return items.length > 0 ? items : null;
}

export function SeriesDistributionCard({
  seriesId,
  metadata,
  onChanged,
}: {
  seriesId: string;
  metadata: unknown;
  onChanged: () => void;
}) {
  const meta = metaObject(metadata);
  const branding = metaObject(meta.branding);
  const [playlist, setPlaylist] = useState(typeof meta.youtube_playlist_id === 'string' ? meta.youtube_playlist_id : '');
  const [targets, setTargets] = useState(listToText(meta.delivery_targets));
  const [taxonomy, setTaxonomy] = useState(listToText(meta.gag_taxonomy));
  const [brand, setBrand] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of BRANDING_FIELDS) {
      const v = branding[f.key];
      init[f.key] = 'isList' in f && f.isList ? listToText(v) : typeof v === 'string' ? v : '';
    }
    return init;
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setPending(true);
    setError(null);
    setSaved(false);
    const brandingPatch: Record<string, unknown> = {};
    for (const f of BRANDING_FIELDS) {
      const raw = brand[f.key]?.trim() ?? '';
      brandingPatch[f.key] =
        raw === '' ? null : 'isList' in f && f.isList ? textToList(raw) : raw;
    }
    const res = await fetch(`/api/series/${seriesId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        youtube_playlist_id: playlist.trim() || null,
        delivery_targets: textToList(targets),
        gag_taxonomy: textToList(taxonomy),
        branding: brandingPatch,
      }),
    });
    setPending(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? `Save failed (${res.status})`);
      return;
    }
    setSaved(true);
    onChanged();
  }

  return (
    <Card>
      <CardBody>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
            Distribution &amp; branding
          </h3>
          <PeekHint autoPeekMs={0}>
            Series-level values override the channel defaults; empty = inherit.
            Playlist id feeds the Shorts backlink and publish queueing (the global
            env fallback is gone — no playlist here or on the episode means skip).
          </PeekHint>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="YouTube playlist id">
            <input
              value={playlist}
              onChange={(e) => setPlaylist(e.target.value)}
              placeholder="PL… (empty = skip playlist)"
              className="w-full h-9 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm font-mono text-text-primary focus:outline-none focus:border-[var(--accent-primary)]"
            />
          </Field>
          <Field label="Delivery targets (comma)">
            <input
              value={targets}
              onChange={(e) => setTargets(e.target.value)}
              placeholder="youtube_landscape, youtube_shorts"
              className="w-full h-9 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm font-mono text-text-primary focus:outline-none focus:border-[var(--accent-primary)]"
            />
          </Field>
          <Field label="Gag taxonomy (comma)">
            <input
              value={taxonomy}
              onChange={(e) => setTaxonomy(e.target.value)}
              placeholder="Body, Object, Timing, …"
              className="w-full h-9 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm text-text-primary focus:outline-none focus:border-[var(--accent-primary)]"
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          {BRANDING_FIELDS.map((f) => (
            <Field key={f.key} label={f.label}>
              <input
                value={brand[f.key] ?? ''}
                onChange={(e) => setBrand((prev) => ({ ...prev, [f.key]: e.target.value }))}
                placeholder="empty = inherit from channel"
                className="w-full h-9 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm text-text-primary focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </Field>
          ))}
        </div>
        {error && (
          <p className="mt-3 text-xs" style={{ color: 'var(--accent-danger)' }}>{error}</p>
        )}
        <div className="mt-3 flex items-center justify-end gap-3">
          {saved && <span className="text-xs" style={{ color: 'var(--accent-success)' }}>Saved</span>}
          <Button size="sm" onClick={save} disabled={pending}>
            {pending ? 'Saving…' : 'Save distribution'}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wider text-text-muted mb-1">{label}</label>
      {children}
    </div>
  );
}
