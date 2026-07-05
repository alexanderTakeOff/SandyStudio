// ──────────────────────────────────────────────────────────────────────────────
// components/episode/EpisodeSettingsCard.tsx
// TD-49 Phase 2 P2.3 (2026-05-25) — Director-facing toggle card on the
// episode detail page. v1 surface: one boolean — `anchor_chain_enabled`.
//
// Backed by /api/episodes/[id]/settings (GET hydrate + PATCH save). State is
// local-optimistic with rollback on PATCH failure. Mimics the pattern of
// StorageSettings (useState + fetch).
//
// Design intent (per plan): a quiet, single-toggle card that doesn't compete
// with the pipeline DAG below it. Helper text explains the toggle's
// architectural meaning so Director doesn't need to remember the q-numbers.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useState } from 'react';
import { Layers, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { PeekHint } from '@/components/ui/PeekHint';
import { EpisodeGenerationConfig } from './EpisodeGenerationConfig';
import { readPipelineMode, type PipelineMode } from '@/lib/api/pipeline-mode';

interface EpisodeSettingsCardProps {
  episodeId: string;
  /** Initial metadata from the page-level episode payload — used to hydrate
   *  without an extra fetch on first render. The component then refetches via
   *  the settings GET to stay consistent with the canonical write surface. */
  initialMetadata?: Record<string, unknown> | null;
  /** Initial per-episode budget cap (USD) from the page payload. null = no cap. */
  initialBudgetCeiling?: number | null;
}

interface SettingsState {
  anchor_chain_enabled: boolean;
  pipeline_mode: PipelineMode;
  budget_ceiling: number | null;
  budget_approved: boolean;
}

function readAnchorChainEnabled(meta: Record<string, unknown> | null | undefined): boolean {
  if (!meta || typeof meta !== 'object') return false;
  return meta.anchor_chain_enabled === true;
}

// F13: Director's budget approval flag (metadata). Gate.ts blocks all post-brief
// AGENT_RUN work until this is true.
function readBudgetApproved(meta: Record<string, unknown> | null | undefined): boolean {
  if (!meta || typeof meta !== 'object') return false;
  return meta.budget_approved === true;
}

// Director defaults 2026-07-05: 150 total, of which 30 for Polina. Shown as the
// prefilled default when an episode has no explicit values yet.
const DEFAULT_TOTAL_BUDGET_USD = 150;
const DEFAULT_CONCIERGE_CAP_USD = 30;

// Per-episode Polina (concierge) cost slice — a carve-out WITHIN the total budget.
function readConciergeCap(meta: Record<string, unknown> | null | undefined): number | null {
  if (!meta || typeof meta !== 'object') return null;
  const v = Number((meta as { concierge_cap_usd?: unknown }).concierge_cap_usd);
  return Number.isFinite(v) && v > 0 ? v : null;
}

export function EpisodeSettingsCard({
  episodeId,
  initialMetadata,
  initialBudgetCeiling = null,
}: EpisodeSettingsCardProps) {
  const [state, setState] = useState<SettingsState>({
    anchor_chain_enabled: readAnchorChainEnabled(initialMetadata ?? null),
    pipeline_mode: readPipelineMode(initialMetadata ?? null),
    budget_ceiling: initialBudgetCeiling,
    budget_approved: readBudgetApproved(initialMetadata ?? null),
  });
  const [budgetInput, setBudgetInput] = useState(
    initialBudgetCeiling != null ? String(initialBudgetCeiling) : String(DEFAULT_TOTAL_BUDGET_USD),
  );
  // Polina's slice within the total budget. Prefilled to the default when unset.
  const [conciergeInput, setConciergeInput] = useState(() => {
    const cap = readConciergeCap(initialMetadata ?? null);
    return cap != null ? String(cap) : String(DEFAULT_CONCIERGE_CAP_USD);
  });
  const [pending, setPending] = useState(false);
  const [budgetPending, setBudgetPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Collapsed by default (Director 2026-06-17): the settings carry destructive
  // toggles (Anchor Chain / budget cap / generation config). Hiding them behind
  // a click-to-expand header makes accidental changes near-impossible, esp. in
  // ===1=== where the page is otherwise read-only.
  const [collapsed, setCollapsed] = useState(true); // default collapsed

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/episodes/${episodeId}/settings`)
      .then((r) => r.json())
      .then(
        (j: {
          data?: { metadata?: Record<string, unknown>; budget_ceiling?: number | null };
        }) => {
          if (cancelled || !j.data) return;
          const cap = j.data.budget_ceiling ?? null;
          setState({
            anchor_chain_enabled: readAnchorChainEnabled(j.data.metadata ?? null),
            pipeline_mode: readPipelineMode(j.data.metadata ?? null),
            budget_ceiling: cap,
            budget_approved: readBudgetApproved(j.data.metadata ?? null),
          });
          setBudgetInput(cap != null ? String(cap) : String(DEFAULT_TOTAL_BUDGET_USD));
          const polina = readConciergeCap(j.data.metadata ?? null);
          setConciergeInput(polina != null ? String(polina) : String(DEFAULT_CONCIERGE_CAP_USD));
        },
      )
      .catch(() => {
        // Non-fatal — keep initial-prop-derived state.
      });
    return () => {
      cancelled = true;
    };
  }, [episodeId]);

  // Parse an input: '' → null (clear); otherwise must be a positive number.
  function parseCap(raw: string, label: string): { ok: true; value: number | null } | { ok: false } {
    const trimmed = raw.trim();
    if (trimmed === '') return { ok: true, value: null };
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError(`${label} must be a positive number (or empty to clear).`);
      return { ok: false };
    }
    return { ok: true, value: parsed };
  }

  // One save writes BOTH the total ceiling and Polina's slice (Director 2026-07-05).
  async function saveBudget() {
    setError(null);
    const total = parseCap(budgetInput, 'Total budget');
    if (!total.ok) return;
    const polina = parseCap(conciergeInput, 'Polina cap');
    if (!polina.ok) return;
    // Polina's slice is a carve-out WITHIN the total — never larger than it.
    if (polina.value != null && total.value != null && polina.value > total.value) {
      setError('Polina cap cannot exceed the total budget.');
      return;
    }
    setBudgetPending(true);
    try {
      const res = await fetch(`/api/episodes/${episodeId}/settings`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ budget_ceiling: total.value, concierge_cap_usd: polina.value }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? `HTTP ${res.status}`);
      }
      setState((s) => ({ ...s, budget_ceiling: total.value }));
      setBudgetInput(total.value != null ? String(total.value) : '');
      setConciergeInput(polina.value != null ? String(polina.value) : '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBudgetPending(false);
    }
  }

  async function setBudgetApproved(next: boolean) {
    const previous = state.budget_approved;
    setState((s) => ({ ...s, budget_approved: next }));
    setError(null);
    try {
      const res = await fetch(`/api/episodes/${episodeId}/settings`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ budget_approved: next }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      setState((s) => ({ ...s, budget_approved: previous }));
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async function setPipelineMode(next: PipelineMode) {
    const previous = state.pipeline_mode;
    if (next === previous) return;
    setState((s) => ({ ...s, pipeline_mode: next }));
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/episodes/${episodeId}/settings`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pipeline_mode: next }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      setState((s) => ({ ...s, pipeline_mode: previous }));
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setPending(false);
    }
  }

  async function toggleAnchorChain(next: boolean) {
    const previous = state.anchor_chain_enabled;
    setState((s) => ({ ...s, anchor_chain_enabled: next }));
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/episodes/${episodeId}/settings`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ anchor_chain_enabled: next }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      // Rollback on failure (functional updater — don't clobber a concurrent
      // budget_ceiling save).
      setState((s) => ({ ...s, anchor_chain_enabled: previous }));
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader
        role="button"
        tabIndex={0}
        onClick={() => setCollapsed((c) => !c)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setCollapsed((c) => !c);
          }
        }}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Expand episode settings' : 'Collapse episode settings'}
        className="flex items-center gap-2 cursor-pointer select-none focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-info)] rounded-lg"
      >
        <Layers size={14} className="text-text-muted" />
        <CardTitle>Episode Settings</CardTitle>
        <PeekHint autoPeekMs={3500}>
          Per-episode toggles that change pipeline behaviour. Director-only.
        </PeekHint>
        <span className="ml-auto text-text-muted">
          {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </span>
      </CardHeader>
      {!collapsed && (
      <CardBody>
        <div className="space-y-3">
          {/* S-reorder (2026-07-01): pipeline mode. Sequential = today's
              refs→animatic→video. Parallel = 2 refs→2 video pilots→fanout, per-ref
              canon-gate, video not gated on an animatic. Switchable mid-run. */}
          <div>
            <div className="text-sm font-medium text-text-primary">Pipeline mode</div>
            <div className="text-xs text-text-muted mt-0.5 leading-relaxed">
              <strong>Sequential</strong> — all references → animatic review → video (default).{' '}
              <strong>Parallel</strong> — 2 refs → 2 video pilots → approve → fan out the rest;
              per-reference canon-check replaces the batch animatic review; video is not gated on an
              animatic. Switchable mid-run (Sequential → Parallel is the clean direction).
            </div>
            <div className="mt-2 inline-flex rounded-md border border-glass overflow-hidden">
              {(['sequential', 'parallel'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => void setPipelineMode(mode)}
                  disabled={pending}
                  aria-pressed={state.pipeline_mode === mode}
                  className={
                    'px-3 py-1 text-xs font-medium capitalize disabled:opacity-50 ' +
                    (state.pipeline_mode === mode
                      ? 'bg-[var(--accent-primary)] text-white'
                      : 'bg-[var(--bg-elevated)] text-text-muted hover:text-text-primary')
                  }
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-glass pt-3" />

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-[var(--accent-primary)] cursor-pointer"
              checked={state.anchor_chain_enabled}
              onChange={(e) => toggleAnchorChain(e.target.checked)}
              disabled={pending}
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-text-primary">
                Anchor Chain (TD-49 Phase 2)
              </div>
              <div className="text-xs text-text-muted mt-0.5 leading-relaxed">
                When enabled, EREF Designer authors paired start+end anchors per shot using
                walking-forward narrative order. EREF Artist generates IMG-anchor_* assets with
                scene_master as layout reference. VANIM fan-out gates on 2 × shotCount Director
                approvals. Requires Series Bible scene_master OR LOCKED location asset for every
                shot location.
              </div>
              {error && (
                <div className="text-xs text-[var(--accent-danger)] mt-1.5">
                  Error: {error}
                </div>
              )}
              {pending && (
                <div className="text-xs text-text-muted mt-1.5">Saving…</div>
              )}
            </div>
          </label>

          {/* Per-episode budget cap (Director 2026-06-03; Polina slice 2026-07-05).
              Total → budget_ceiling COLUMN; Polina → metadata.concierge_cap_usd, a
              carve-out WITHIN the total. Both saved by one button. Empty total = no cap. */}
          <div className="border-t border-glass pt-3">
            <div className="text-sm font-medium text-text-primary">Episode budget</div>
            <div className="text-xs text-text-muted mt-0.5 leading-relaxed">
              Hard USD ceiling — generation jobs fail once spend would cross it. «Полина» is her
              share of that total (her auto-react pauses once her episode spend hits it). Empty total
              = no cap.{' '}
              {state.budget_ceiling == null && (
                <span style={{ color: 'var(--accent-danger)' }}>
                  No cap set — over-spend is NOT blocked.
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-end gap-3 mt-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-text-muted">Всего ($)</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  placeholder={String(DEFAULT_TOTAL_BUDGET_USD)}
                  disabled={budgetPending}
                  className="w-24 px-2 py-1 rounded-md bg-[var(--bg-elevated)] border border-glass text-sm text-text-primary focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-text-muted">из них Полина ($)</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={conciergeInput}
                  onChange={(e) => setConciergeInput(e.target.value)}
                  placeholder={String(DEFAULT_CONCIERGE_CAP_USD)}
                  disabled={budgetPending}
                  className="w-24 px-2 py-1 rounded-md bg-[var(--bg-elevated)] border border-glass text-sm text-text-primary focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </label>
              <button
                type="button"
                onClick={() => void saveBudget()}
                disabled={budgetPending}
                className="px-3 py-1 rounded-md text-xs font-medium bg-[var(--accent-primary)] text-white disabled:opacity-50"
              >
                {budgetPending ? 'Saving…' : 'Save budget'}
              </button>
            </div>
          </div>

          {/* F13 (2026-07-01): Director budget approval — gates all post-brief
              AGENT_RUN work (gate.ts Step 0c). Human-Director-only (Category-A). */}
          <div className="border-t border-glass pt-3">
            <div className="text-sm font-medium text-text-primary">Budget approval</div>
            <div className="text-xs text-text-muted mt-0.5 leading-relaxed">
              After the brief, no generation work runs until you approve the episode budget.
            </div>
            <div className="mt-2">
              {state.budget_approved ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-text-primary">
                    ✅ Budget approved — work may proceed.
                  </span>
                  <button
                    type="button"
                    onClick={() => void setBudgetApproved(false)}
                    className="px-2 py-1 rounded-md text-xs border border-glass text-text-muted hover:bg-[var(--panel-hover-bg)]"
                  >
                    Revoke
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void setBudgetApproved(true)}
                  className="px-3 py-1 rounded-md text-xs font-medium bg-[var(--accent-primary)] text-white"
                >
                  Approve episode budget
                </button>
              )}
            </div>
          </div>

          {/* Episode-authoritative generation config (provider/format) — q28. */}
          <EpisodeGenerationConfig
            episodeId={episodeId}
            initialMetadata={initialMetadata ?? null}
          />
        </div>
      </CardBody>
      )}
    </Card>
  );
}
