// ──────────────────────────────────────────────────────────────────────────────
// components/series-bible/AddAssetModal.tsx
// Modal for adding a new Bible asset (hero / location / object / style).
//
// Per Director's spec:
//   1. Name — combobox: dropdown of existing canonical Bible assets across
//      ALL series the Director has access to + free text input for a brand-new
//      name. Picking an existing one pre-fills description and pre-loads
//      media (Director can keep, replace, fork).
//   2. Description — markdown textarea + "Concierge fill" companion button
//      (muted/disabled in Step 4 — wired in a later Concierge slice).
//   3. Generate ref image — calls gpt-image-1 with description + Style guide.
//   4. Preview inline — Regenerate or Save as DRAFT.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Sparkles, Wand2, RefreshCcw, Save, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { fetcher } from '@/lib/swr';
import type { SbSection } from '@/lib/api/series-bible';

const SECTION_TITLES: Record<Exclude<SbSection, 'general_idea'>, string> = {
  character: 'Add hero',
  location: 'Add location',
  object: 'Add object',
  style: 'Add style entry',
  audio: 'Add audio',
};

type Section = Exclude<SbSection, 'general_idea'>;

interface CrossSeriesSuggestion {
  filename: string;
  description: string | null;
  series_code: string | null;
  preview_url: string | null;
  drive_file_id: string | null;
}

interface SuggestionsResponse {
  data: CrossSeriesSuggestion[];
}

export interface AddAssetModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  seriesId: string;
  seriesCode: string;
  seriesTitle: string;
  section: Section;
  /** Filenames already in this section (for duplicate-slug warning). */
  existingNames: string[];
}

export function AddAssetModal({
  open,
  onClose,
  onCreated,
  seriesId,
  seriesCode: _seriesCode,
  seriesTitle: _seriesTitle,
  section,
  existingNames: _existingNames,
}: AddAssetModalProps) {
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stagingUrl, setStagingUrl] = useState<string | null>(null);
  const [stagingMeta, setStagingMeta] = useState<{
    drive_file_id?: string;
    drive_web_view_url?: string;
    width: number;
    height: number;
    cost_usd: number;
  } | null>(null);

  // Cross-series Bible suggestions (autocomplete dropdown source)
  const { data: suggestData } = useSWR<SuggestionsResponse>(
    open ? `/api/series/bible-suggestions?section=${section}` : null,
    fetcher,
  );
  const suggestions = suggestData?.data ?? [];

  // Reset on open/close
  useEffect(() => {
    if (open) {
      setSlug('');
      setDescription('');
      setStagingUrl(null);
      setStagingMeta(null);
      setError(null);
    }
  }, [open]);

  const slugSafe = slug.toLowerCase().replace(/[^a-z0-9_-]/g, '_').replace(/_+/g, '_');
  const slugValid = slugSafe.length >= 1;
  const canGenerate = slugValid && description.trim().length >= 10 && !generating && !saving;
  const canSave =
    slugValid && description.trim().length >= 5 && stagingUrl && !saving && !generating;

  async function generate() {
    setGenerating(true);
    setError(null);
    const res = await fetch(`/api/series/${seriesId}/bible/generate-image`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        section,
        slug: slugSafe,
        description,
      }),
    });
    setGenerating(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError((j as { error?: string }).error ?? 'Generation failed');
      return;
    }
    const j = (await res.json()) as {
      data: {
        staging_url: string;
        drive_file_id?: string;
        drive_web_view_url?: string;
        width: number;
        height: number;
        cost_usd: number;
      };
    };
    setStagingUrl(j.data.staging_url);
    setStagingMeta({
      drive_file_id: j.data.drive_file_id,
      drive_web_view_url: j.data.drive_web_view_url,
      width: j.data.width,
      height: j.data.height,
      cost_usd: j.data.cost_usd,
    });
  }

  async function save() {
    if (!stagingUrl) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/series/${seriesId}/bible`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        section,
        slug: slugSafe,
        description,
        staging_path: stagingUrl,
        drive_file_id: stagingMeta?.drive_file_id,
        drive_web_view_url: stagingMeta?.drive_web_view_url,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError((j as { error?: string }).error ?? 'Save failed');
      return;
    }
    onCreated();
  }

  function pickSuggestion(s: CrossSeriesSuggestion) {
    setDescription(s.description ?? '');
    // Extract slug hint from filename like SS-S01-BIB-character_sandy-v01-LOCKED.png
    if (s.file_type) {
      const slug = bibleSlug(s.file_type);
      if (slug) setSlug(slug);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={SECTION_TITLES[section]} size="lg">
      <div className="space-y-4">
        {/* Name combobox */}
        <div>
          <label className="block text-xs uppercase tracking-wider text-text-muted mb-1.5">
            Name {section === 'character' ? '(hero)' : ''}
          </label>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder={section === 'character' ? 'e.g. sandy' : section === 'location' ? 'e.g. cafe' : `e.g. ${section}-name`}
            className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm font-mono focus:outline-none focus:border-[var(--accent-primary)]"
            list={`suggestions-${section}`}
          />
          <datalist id={`suggestions-${section}`}>
            {suggestions.map((s) => {
              const m = s.filename.match(/-SBL-(?:character|location|object|style|audio|general_idea)_(.+?)-v\d+-/i);
              return m ? <option key={s.filename} value={m[1]} /> : null;
            })}
          </datalist>
          {suggestions.length > 0 && (
            <div className="mt-1.5 text-[11px] text-text-muted">
              Existing canonical entries:{' '}
              {suggestions.slice(0, 5).map((s, i) => {
                const m = s.filename.match(/-SBL-(?:character|location|object|style|audio|general_idea)_(.+?)-v\d+-/i);
                return m ? (
                  <button
                    key={s.filename}
                    onClick={() => pickSuggestion(s)}
                    className="underline hover:text-text-primary mr-2"
                    type="button"
                  >
                    {m[1]}
                    {s.series_code && <span className="text-text-muted/60"> ({s.series_code})</span>}
                  </button>
                ) : null;
              })}
            </div>
          )}
        </div>

        {/* Description + Concierge muted button */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs uppercase tracking-wider text-text-muted">
              Description
            </label>
            <button
              type="button"
              disabled
              title="Concierge auto-fill — wired in a later slice"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] opacity-40 cursor-not-allowed"
              style={{ background: 'var(--panel-hover-bg)', color: 'var(--text-muted)' }}
            >
              <Sparkles size={11} /> Concierge fill
            </button>
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            placeholder="Describe this canonical asset (appearance, behaviour, role)…"
            className="w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm leading-relaxed focus:outline-none focus:border-[var(--accent-primary)]"
          />
        </div>

        {/* Generate / Preview */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button onClick={generate} disabled={!canGenerate}>
              {generating ? (
                <>
                  <Loader2 size={13} className="animate-spin" /> Generating…
                </>
              ) : stagingUrl ? (
                <>
                  <RefreshCcw size={13} /> Regenerate
                </>
              ) : (
                <>
                  <Wand2 size={13} /> Generate ref image
                </>
              )}
            </Button>
            <span className="text-[11px] text-text-muted">
              gpt-image-1 · ~$0.04 / call
            </span>
          </div>

          {stagingUrl && (
            <div className="rounded-lg overflow-hidden border border-glass">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={stagingUrl} alt="ref preview" className="w-full h-auto block" />
              {stagingMeta && (
                <div className="px-2 py-1 text-[10px] text-text-muted font-mono">
                  {stagingMeta.width}×{stagingMeta.height} · ${stagingMeta.cost_usd.toFixed(4)}
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div
            className="rounded-lg p-3 text-xs"
            style={{
              background: 'color-mix(in oklab, var(--accent-danger) 14%, transparent)',
              color: 'var(--accent-danger)',
            }}
          >
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={saving || generating}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!canSave}>
            {saving ? (
              <>
                <Loader2 size={13} className="animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Save size={13} /> Save as DRAFT
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
