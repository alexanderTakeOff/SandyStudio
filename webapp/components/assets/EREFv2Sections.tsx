// ──────────────────────────────────────────────────────────────────────────────
// components/assets/EREFv2Sections.tsx
// EREF v2 visual sections rendered inside EpisodeAssetDrawer when the asset
// metadata follows the `episode_references@v2` contract (see
// lib/api/shot-reference.ts).
//
// Rendered sections (top-to-bottom):
//   1. Test Plan card   — characters table + location/style chips + gag
//   2. AI Verdict pill  — APPROVE / REGENERATE / HUMAN_REVIEW (color coded)
//   3. Score bars       — 5 horizontal bars 0-100
//   4. Issues list      — severity + character + area + description + fix_hint
//   5. Candidates strip — sibling assets sharing shot_id (click to switch)
//
// Pure presentational — parent drawer owns data fetching + state transitions.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { withThumbParam } from '@/lib/media-thumb';
import { driveBackedMediaUrl, previewFreshness } from '@/lib/asset-preview-resolver';
import type {
  EREFReview,
  EREFReviewIssue,
  EREFReviewSeverity,
  EREFReviewVerdict,
  GenerationAttempt,
  ShotReferenceContract,
} from '@/lib/api/shot-reference';

// ── Test Plan card ──────────────────────────────────────────────────────────

interface TestPlanCardProps {
  shotRef: ShotReferenceContract;
}

export function TestPlanCard({ shotRef }: TestPlanCardProps) {
  const { test_plan: tp, shot_id, shot_role } = shotRef;
  return (
    <div
      className="rounded-lg border border-glass p-3 space-y-3"
      style={{ background: 'color-mix(in oklab, var(--bg-elevated) 80%, transparent)' }}
    >
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-text-muted">Test plan</div>
        <div className="text-[10px] font-mono text-text-muted">
          {shot_id} · {shot_role}
        </div>
      </div>

      {tp.characters.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="text-left text-text-muted">
                <th className="font-medium pb-1.5 pr-3">Character</th>
                <th className="font-medium pb-1.5 pr-3">Emotion</th>
                <th className="font-medium pb-1.5 pr-3">Action</th>
                <th className="font-medium pb-1.5">Role</th>
              </tr>
            </thead>
            <tbody className="text-text-secondary">
              {tp.characters.map((c, i) => (
                <tr key={`${c.bible_slug}-${i}`} className="border-t border-glass">
                  <td className="py-1.5 pr-3 font-mono text-text-primary">{c.bible_slug}</td>
                  <td className="py-1.5 pr-3">{c.expected_emotion || '—'}</td>
                  <td className="py-1.5 pr-3">{c.expected_action || '—'}</td>
                  <td className="py-1.5">
                    <span
                      className="inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider"
                      style={{
                        background: 'color-mix(in oklab, var(--accent-primary) 14%, transparent)',
                        color: 'var(--accent-primary)',
                      }}
                    >
                      {c.role_in_shot}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-[11px] text-text-muted italic">No characters in this shot.</div>
      )}

      <div className="flex flex-wrap gap-1.5">
        <Chip label="Location" value={tp.location_anchor_asset_id} />
        <Chip label="Style" value={tp.style_anchor_asset_id} />
      </div>

      <div
        className="rounded-md p-2 text-[11px] leading-relaxed"
        style={{
          background: tp.expected_gag
            ? 'color-mix(in oklab, var(--accent-warning) 10%, transparent)'
            : 'var(--bg-elevated)',
          color: tp.expected_gag ? 'var(--text-primary)' : 'var(--text-muted)',
        }}
      >
        <span className="text-[10px] uppercase tracking-wider opacity-70 mr-1.5">Gag:</span>
        {tp.expected_gag ?? 'Transition / no gag'}
      </div>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string | null }) {
  const present = Boolean(value);
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono"
      style={{
        background: present
          ? 'color-mix(in oklab, var(--accent-info) 10%, transparent)'
          : 'var(--bg-elevated)',
        color: present ? 'var(--accent-info)' : 'var(--text-muted)',
        border: '1px solid var(--panel-glass-border)',
      }}
      title={value ?? `${label} anchor not set`}
    >
      <span className="uppercase tracking-wider opacity-70">{label}</span>
      <span>{value ? value.slice(0, 8) + '…' : 'none'}</span>
    </span>
  );
}

// ── AI Verdict pill ─────────────────────────────────────────────────────────

const VERDICT_COLOR: Record<EREFReviewVerdict, { bg: string; fg: string; label: string }> = {
  APPROVE: {
    bg: 'color-mix(in oklab, var(--accent-success) 18%, transparent)',
    fg: 'var(--accent-success)',
    label: 'Approve',
  },
  REGENERATE: {
    bg: 'color-mix(in oklab, var(--accent-warning) 18%, transparent)',
    fg: 'var(--accent-warning)',
    label: 'Regenerate',
  },
  HUMAN_REVIEW: {
    bg: 'color-mix(in oklab, var(--accent-danger) 18%, transparent)',
    fg: 'var(--accent-danger)',
    label: 'Human review',
  },
};

export function VerdictPill({ review }: { review: EREFReview | null }) {
  if (!review) {
    return (
      <div
        className="rounded-lg p-3 flex items-center gap-3 border border-glass"
        style={{ background: 'var(--bg-elevated)' }}
      >
        <span
          className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider"
          style={{ background: 'var(--panel-glass-strong-bg)', color: 'var(--text-muted)' }}
        >
          Pending review
        </span>
        <span className="text-[11px] text-text-muted">AI reviewer hasn’t scored this generation yet.</span>
      </div>
    );
  }
  const v = VERDICT_COLOR[review.verdict];
  return (
    <div
      className="rounded-lg p-3 flex items-center gap-3 border border-glass"
      style={{ background: 'var(--bg-elevated)' }}
    >
      <span
        className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider"
        style={{ background: v.bg, color: v.fg }}
      >
        {v.label}
      </span>
      <span className="text-[11px] text-text-muted">
        {review.reviewer_model} · ${review.reviewer_cost_usd.toFixed(3)}
      </span>
    </div>
  );
}

// ── Score bars ──────────────────────────────────────────────────────────────

interface ScoreBarsProps {
  review: EREFReview | null;
}

const SCORE_FIELDS: Array<{ key: keyof EREFReview; label: string }> = [
  { key: 'consistency_score', label: 'Consistency' },
  { key: 'emotion_alignment_score', label: 'Emotion alignment' },
  { key: 'action_clarity_score', label: 'Action clarity' },
  { key: 'gag_readability_score', label: 'Gag readability' },
  { key: 'style_match_score', label: 'Style match' },
];

export function ScoreBars({ review }: ScoreBarsProps) {
  return (
    <div className="rounded-lg border border-glass p-3 space-y-2.5" style={{ background: 'var(--bg-elevated)' }}>
      <div className="text-xs uppercase tracking-wider text-text-muted">Reviewer scores</div>
      <div className="space-y-2">
        {SCORE_FIELDS.map(({ key, label }) => {
          const raw = review ? (review[key] as number | null) : null;
          const present = typeof raw === 'number' && Number.isFinite(raw);
          const value = present ? Math.max(0, Math.min(100, raw)) : 0;
          const color =
            !present
              ? 'var(--text-muted)'
              : value >= 80
                ? 'var(--accent-success)'
                : value >= 60
                  ? 'var(--accent-warning)'
                  : 'var(--accent-danger)';
          return (
            <div key={key} className="text-[11px]">
              <div className="flex items-center justify-between mb-0.5">
                <span className={present ? 'text-text-secondary' : 'text-text-muted'}>{label}</span>
                <span className="font-mono" style={{ color }}>
                  {present ? value.toFixed(0) : '—'}
                </span>
              </div>
              <div
                className="w-full h-1.5 rounded-full overflow-hidden"
                style={{ background: 'color-mix(in oklab, var(--panel-glass-border) 60%, transparent)' }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${value}%`,
                    background: color,
                    opacity: present ? 1 : 0.3,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Issues list ─────────────────────────────────────────────────────────────

const SEVERITY_STYLE: Record<EREFReviewSeverity, { bg: string; fg: string }> = {
  CRITICAL: {
    bg: 'color-mix(in oklab, var(--accent-danger) 16%, transparent)',
    fg: 'var(--accent-danger)',
  },
  MAJOR: {
    bg: 'color-mix(in oklab, var(--accent-warning) 16%, transparent)',
    fg: 'var(--accent-warning)',
  },
  MINOR: {
    bg: 'var(--panel-glass-strong-bg)',
    fg: 'var(--text-muted)',
  },
};

export function IssuesList({ issues }: { issues: EREFReviewIssue[] }) {
  if (issues.length === 0) {
    return (
      <div
        className="rounded-lg border border-glass p-3 text-[11px] text-text-muted italic"
        style={{ background: 'var(--bg-elevated)' }}
      >
        No issues flagged.
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-glass p-3 space-y-2" style={{ background: 'var(--bg-elevated)' }}>
      <div className="text-xs uppercase tracking-wider text-text-muted">
        Issues ({issues.length})
      </div>
      <ul className="space-y-2">
        {issues.map((issue, idx) => {
          const sev = SEVERITY_STYLE[issue.severity];
          return (
            <li
              key={`${issue.area}-${idx}`}
              className="rounded-md p-2 space-y-1"
              style={{ background: 'color-mix(in oklab, var(--bg-base) 50%, transparent)' }}
            >
              <div className="flex items-center gap-1.5 flex-wrap">
                <span
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider"
                  style={{ background: sev.bg, color: sev.fg }}
                >
                  {issue.severity}
                </span>
                {issue.character_slug && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono text-text-secondary border border-glass">
                    {issue.character_slug}
                  </span>
                )}
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider text-text-muted border border-glass">
                  {issue.area.replace('_', ' ')}
                </span>
              </div>
              <div className="text-[11px] text-text-primary leading-snug">{issue.description}</div>
              {issue.fix_hint && (
                <div className="text-[10px] text-text-muted italic leading-snug">
                  Fix: {issue.fix_hint}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Candidates strip ────────────────────────────────────────────────────────

interface CandidateAsset {
  id: string;
  filename: string;
  status: string;
  staging_path: string | null;
  drive_path: string | null;
  drive_web_view_url: string | null;
  metadata?: { image_prompt?: { current_version: number; history: Array<{ version: number; staging_path?: string | null; drive_web_view_url?: string | null }> } } | null;
}

function pickPreview(a: CandidateAsset): string | null {
  // Drive-backed media → stable /api/media/<id> route (post-2026-06-01 cache migration).
  // Cache-bust via current_version so regenerated images aren't served stale.
  const route = driveBackedMediaUrl(a, previewFreshness(a));
  if (route) return route;
  const ip = a.metadata?.image_prompt;
  const cur = ip?.history.find((h) => h.version === ip.current_version);
  const cands: Array<string | null | undefined> = [
    a.drive_path,
    a.staging_path,
    a.drive_web_view_url,
    cur?.staging_path,
    cur?.drive_web_view_url,
  ];
  return cands.find((c): c is string => typeof c === 'string' && (c.startsWith('/') || c.startsWith('http'))) ?? null;
}

const CANDIDATE_BORDER: Record<string, string> = {
  APPROVED: 'var(--accent-success)',
  LOCKED: 'var(--accent-success)',
  REVIEW: 'var(--panel-glass-border)',
  DRAFT: 'var(--panel-glass-border)',
  REVISION: 'var(--accent-warning)',
  REJECTED: 'var(--accent-danger)',
};

export interface CandidatesStripProps {
  currentAssetId: string;
  candidates: CandidateAsset[];
  onPick: (assetId: string) => void;
}

export function CandidatesStrip({ currentAssetId, candidates, onPick }: CandidatesStripProps) {
  if (candidates.length <= 1) return null;
  return (
    <div className="rounded-lg border border-glass p-3 space-y-2" style={{ background: 'var(--bg-elevated)' }}>
      <div className="text-xs uppercase tracking-wider text-text-muted">
        Candidates for this shot ({candidates.length})
      </div>
      <div className="flex flex-wrap gap-2">
        {candidates.map((c) => {
          const src = pickPreview(c);
          const border = CANDIDATE_BORDER[c.status] ?? 'var(--panel-glass-border)';
          const isCurrent = c.id === currentAssetId;
          const rejected = c.status === 'REJECTED';
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => !isCurrent && onPick(c.id)}
              className="relative w-16 h-16 rounded-md overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] transition-all"
              style={{
                border: `2px solid ${border}`,
                opacity: rejected ? 0.55 : 1,
                cursor: isCurrent ? 'default' : 'pointer',
                outline: isCurrent ? '2px solid var(--accent-primary)' : 'none',
              }}
              title={`${c.filename} · ${c.status}`}
              aria-label={`${c.filename} (${c.status})${isCurrent ? ' — current' : ''}`}
              disabled={isCurrent}
            >
              {src ? (
                // TD-43 (2026-05-24): VID-shot rows have .mp4 staging_path.
                // <img> can't render mp4 → use <video> with muted+autoplay
                // (first-frame preview, no audio). Otherwise <img>.
                // 2026-06-05: /api/media/<id> URLs carry no extension, so also
                // detect video via the -VID- type code in the filename.
                /\.(mp4|mov|webm)(\?|$)/i.test(src) ||
                /-VID-|\.(mp4|mov|webm)$/i.test(c.filename) ? (
                  <video
                    src={src}
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={withThumbParam(src, 64)} alt={c.filename} className="w-full h-full object-cover" />
                )
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[9px] text-text-muted bg-[var(--bg-base)]">
                  no img
                </div>
              )}
              <span
                className="absolute bottom-0 left-0 right-0 text-[8px] uppercase tracking-wider text-center font-semibold py-0.5"
                style={{
                  background: 'color-mix(in oklab, black 55%, transparent)',
                  color: c.status === 'APPROVED' || c.status === 'LOCKED' ? '#84e1bc' : '#ffffff',
                }}
              >
                {c.status}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Generation attempts strip — TD-56 (2026-05-26) ──────────────────────────
// The EREF Artist auto-regen loop runs up to 3 attempts when the AI reviewer
// rejects with REGENERATE. Each attempt persists its own binary to /staging
// AND records full provenance (URL, prompt, cost, triggered_by) in
// shot_reference.generation_history[]. Before this strip, only the final
// attempt was visible in UI — earlier attempts existed on disk but were
// invisible. Director's request 2026-05-26: surface all attempts so he can
// pick the best one visually instead of trusting the AI reviewer's final
// pick blindly.
//
// Read-only view for now. «Promote attempt N to primary» (swap staging_path
// in the asset row) is a separate follow-up if Director wants that motion.

export interface AttemptsStripProps {
  attempts: readonly GenerationAttempt[];
  /** Final attempt version that landed as the asset's primary staging_path. */
  finalVersion?: number | null;
  /**
   * Timeline-as-home (2026-07-02): when provided, each attempt becomes a
   * PROMOTE button — clicking it makes that attempt the asset's primary image
   * (the "pick a different one of the 3 variants" motion) instead of opening the
   * image in a new tab. Without it the strip stays read-only (open-in-tab).
   */
  onPromote?: (att: GenerationAttempt) => void;
  /** Attempt version currently being promoted (spinner / disabled state). */
  busyVersion?: number | null;
}

export function AttemptsStrip({ attempts, finalVersion, onPromote, busyVersion }: AttemptsStripProps) {
  if (!attempts || attempts.length <= 1) return null;
  return (
    <div
      className="rounded-lg border border-glass p-3 space-y-2"
      style={{ background: 'var(--bg-elevated)' }}
    >
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-text-muted">
          Generation attempts ({attempts.length})
        </div>
        <div className="text-[10px] text-text-muted">
          {onPromote ? 'Click a variant to make it the approved reference' : 'Hover for details · click opens full size'}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {attempts.map((att) => {
          const isFinal = finalVersion != null && att.version === finalVersion;
          const promoting = busyVersion != null && att.version === busyVersion;
          const triggerLabel =
            att.triggered_by === 'pipeline'
              ? 'first'
              : att.triggered_by === 'auto_regen'
                ? 'auto-regen'
                : att.triggered_by === 'auto_upscale'
                  ? 'upscale'
                  : att.triggered_by === 'director_edit'
                    ? 'director edit'
                    : String(att.triggered_by);
          const cost =
            typeof att.cost_usd === 'number' ? `$${att.cost_usd.toFixed(3)}` : '';
          const dims =
            att.width && att.height ? `${att.width}×${att.height}` : '';
          const title = [
            `attempt #${att.version}`,
            triggerLabel,
            att.provider_id,
            dims,
            cost,
          ]
            .filter(Boolean)
            .join(' · ');
          const isVideo = /\.(mp4|mov|webm)(\?|$)/i.test(att.image_url);
          return (
            <a
              key={`${att.version}-${att.at}`}
              href={onPromote ? undefined : att.image_url}
              target={onPromote ? undefined : '_blank'}
              rel={onPromote ? undefined : 'noopener noreferrer'}
              onClick={
                onPromote
                  ? (e) => {
                      e.preventDefault();
                      if (!promoting) onPromote(att);
                    }
                  : undefined
              }
              title={
                onPromote
                  ? `${title} · click to make this the approved reference`
                  : title
              }
              aria-label={title}
              className="relative w-20 h-14 rounded-md overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] transition-all hover:scale-[1.04]"
              style={{
                border: `2px solid ${isFinal ? 'var(--accent-success)' : 'var(--panel-glass-border)'}`,
                cursor: onPromote ? 'pointer' : undefined,
                opacity: promoting ? 0.5 : 1,
              }}
            >
              {att.image_url ? (
                isVideo ? (
                  <video
                    src={att.image_url}
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={withThumbParam(att.image_url, 80)}
                    alt={title}
                    className="w-full h-full object-cover"
                  />
                )
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[9px] text-text-muted bg-[var(--bg-base)]">
                  no preview
                </div>
              )}
              <span
                className="absolute top-0 left-0 px-1 py-0.5 text-[9px] font-mono"
                style={{
                  background: 'color-mix(in oklab, black 65%, transparent)',
                  color: '#ffffff',
                }}
              >
                #{att.version}
              </span>
              {isFinal && (
                <span
                  className="absolute top-0 right-0 px-1 py-0.5 text-[8px] uppercase tracking-wider font-semibold"
                  style={{
                    background: 'var(--accent-success)',
                    color: '#0d1f17',
                  }}
                >
                  final
                </span>
              )}
              <span
                className="absolute bottom-0 left-0 right-0 text-[8px] text-center py-0.5"
                style={{
                  background: 'color-mix(in oklab, black 55%, transparent)',
                  color: '#ffffff',
                }}
              >
                {triggerLabel}
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
