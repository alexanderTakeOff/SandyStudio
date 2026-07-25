// ──────────────────────────────────────────────────────────────────────────────
// app/(studio)/audience/page.tsx — Audience dashboard: the factory's QUALITY
// sensor (sibling of Budget, the price sensor). Renders the scout-mode advisor
// (/api/audience): honesty banner, ranked advice cards, shorts→episode funnel,
// per-video metrics. Doctrine: skills/audience-quality-sensor.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import useSWR from 'swr';
import { BarChart3, Sparkles, TrendingDown, CalendarClock, Compass, Link2 } from 'lucide-react';
import { StudioContentFrame } from '@/components/studio-shell/StudioContentFrame';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { fetcher } from '@/lib/swr';
import { useWorkspaceScope } from '@/components/providers/WorkspaceScopeProvider';

type AdviceAxis = 'amplify_gag' | 'fix_longform' | 'cadence' | 'holes';
type Confidence = 'none' | 'flag' | 'low' | 'medium' | 'high';

interface AdviceCard {
  axis: AdviceAxis;
  headline: string;
  evidence: string;
  confidence: Confidence;
  target: string;
  testNext: string;
  rank: number;
}
interface VideoMetric {
  videoId: string;
  kind: 'short' | 'longform';
  title: string;
  episodeCode?: string | null;
  publicationState?: 'public' | 'unlisted' | 'scheduled' | 'private-draft';
  liveAt?: string | null;
  /** Live public counter. */
  views: number;
  /** 0 = unreadable / still processing, never "watched nothing". */
  avgViewPercentage: number;
  likes: number;
  comments: number;
}
interface FunnelRow {
  episodeCode: string;
  parentVideoId: string | null;
  shortVideoId: string | null;
}
interface AudienceData {
  generatedAt: string;
  channel?: { id: string; name: string };
  videoCount: number;
  metrics: VideoMetric[];
  funnel: FunnelRow[];
  report: { mode: 'scout' | 'optimize'; sampleSize: number; cards: AdviceCard[]; confidenceNote: string };
}

const AXIS: Record<AdviceAxis, { icon: typeof Sparkles; label: string; color: string }> = {
  amplify_gag: { icon: Sparkles, label: 'Amplify', color: 'var(--accent-success)' },
  fix_longform: { icon: TrendingDown, label: 'Fix long-form', color: 'var(--accent-danger)' },
  cadence: { icon: CalendarClock, label: 'Cadence', color: 'var(--accent-info)' },
  holes: { icon: Compass, label: 'Untested', color: 'var(--accent-purple)' },
};

const CONF_COLOR: Record<Confidence, string> = {
  none: 'var(--text-muted)',
  flag: 'var(--accent-info)',
  low: 'var(--accent-orange)',
  medium: 'var(--accent-warning)',
  high: 'var(--accent-success)',
};

function ConfidenceChip({ c }: { c: Confidence }) {
  return (
    <span
      className="inline-flex items-center px-1.5 h-5 rounded-full text-[10px] font-semibold uppercase tracking-wide border"
      style={{ color: CONF_COLOR[c], borderColor: CONF_COLOR[c] }}
    >
      {c === 'none' ? 'no signal' : c}
    </span>
  );
}

function AdviceCardView({ card }: { card: AdviceCard }) {
  const meta = AXIS[card.axis];
  const Icon = meta.icon;
  return (
    <div className="rounded-lg border border-glass p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5" style={{ color: meta.color }}>
          <Icon size={14} />
          <span className="text-[11px] font-semibold uppercase tracking-wide">{meta.label}</span>
        </div>
        <ConfidenceChip c={card.confidence} />
      </div>
      <div className="text-sm font-medium text-text-primary">{card.headline}</div>
      <div className="text-xs text-text-secondary">{card.evidence}</div>
      <div className="text-[11px] text-text-muted">
        <span className="text-text-secondary">Target:</span> {card.target}
      </div>
      <div className="text-[11px] rounded-md px-2 py-1.5 border border-dashed border-glass text-text-secondary">
        🧪 <span className="text-text-primary">Test next:</span> {card.testNext}
      </div>
    </div>
  );
}

export default function AudiencePage() {
  // Workspace scope (Phase 3): the audience view is per-CHANNEL — derive the
  // channel from the scoped series. Unscoped = the first ACTIVE channel
  // (the API default, i.e. the pre-Phase-3 behaviour).
  const { seriesId } = useWorkspaceScope();
  const { data: seriesResp } = useSWR<{ data: Array<{ id: string; channel_id: string | null }> }>(
    seriesId ? '/api/series' : null,
    fetcher,
  );
  const scopedChannelId = seriesId
    ? seriesResp?.data?.find((s) => s.id === seriesId)?.channel_id ?? null
    : null;
  const { data, isLoading, error } = useSWR<{ data: AudienceData }>(
    scopedChannelId ? `/api/audience?channel_id=${scopedChannelId}` : '/api/audience',
    fetcher,
    { revalidateOnFocus: false },
  );
  const d = data?.data;

  return (
    <StudioContentFrame>
      <header className="mb-5">
        <div className="flex items-center gap-2">
          <BarChart3 size={18} className="text-text-secondary" />
          <h1 className="text-2xl font-semibold text-text-primary">Audience — Quality Sensor</h1>
        </div>
        <p className="text-sm text-text-secondary mt-1">
          What the audience actually rewards. Scout-first: on thin data the advisor maps untested
          territory and flags signals — it does not tell you to “make more of X” on noise.
        </p>
      </header>

      {isLoading && <p className="text-sm text-text-muted">Pulling channel metrics…</p>}
      {error && <p className="text-sm" style={{ color: 'var(--accent-danger)' }}>Failed to load audience data.</p>}

      {d && (
        <div className="space-y-5">
          {/* Honesty banner — the mode + confidence note lead, always. */}
          <Card>
            <CardBody>
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="inline-flex items-center px-2 h-6 rounded-full text-[11px] font-bold uppercase tracking-wide"
                  style={{
                    color: d.report.mode === 'scout' ? 'var(--accent-info)' : 'var(--accent-success)',
                    border: `1px solid ${d.report.mode === 'scout' ? 'var(--accent-info)' : 'var(--accent-success)'}`,
                  }}
                >
                  {d.report.mode === 'scout' ? 'Scout mode' : 'Optimize mode'}
                </span>
                <span className="text-xs text-text-muted">
                  {d.channel ? `📺 ${d.channel.name} · ` : ''}
                  {d.videoCount} videos · {d.report.sampleSize} past the exposure gate
                </span>
              </div>
              <p className="text-sm text-text-secondary">{d.report.confidenceNote}</p>
            </CardBody>
          </Card>

          {/* Advice cards — the AI's ranked hypotheses. */}
          <Card>
            <CardHeader><CardTitle>AI advice · ranked hypotheses</CardTitle></CardHeader>
            <CardBody>
              {d.report.cards.length === 0 ? (
                <p className="text-sm text-text-muted">No cards.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {d.report.cards.map((c, i) => <AdviceCardView key={i} card={c} />)}
                </div>
              )}
            </CardBody>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* Shorts→episode funnel (the bridge P1 built). */}
            <Card>
              <CardHeader>
                <CardTitle><span className="inline-flex items-center gap-1.5"><Link2 size={14} /> Funnel · shorts → episode</span></CardTitle>
              </CardHeader>
              <CardBody>
                {d.funnel.length === 0 ? (
                  <p className="text-sm text-text-muted">No linked episodes yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {d.funnel.map((f) => (
                      <li key={f.episodeCode} className="flex items-center justify-between text-xs">
                        <span className="font-mono text-text-primary">{f.episodeCode}</span>
                        <span className="flex items-center gap-2 text-text-muted">
                          <span>{f.parentVideoId ? '🎬 episode' : '— episode'}</span>
                          <span style={{ color: f.parentVideoId && f.shortVideoId ? 'var(--accent-success)' : 'var(--text-muted)' }}>
                            {f.parentVideoId && f.shortVideoId ? '⇄ linked' : '⋯'}
                          </span>
                          <span>{f.shortVideoId ? '🩳 short' : '— short'}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>

            {/* Per-video metrics. */}
            <Card>
              <CardHeader><CardTitle>Videos · completion &amp; reach</CardTitle></CardHeader>
              <CardBody>
                <ul className="space-y-1.5">
                  {/* Ranked by REACH, not completion. Completion is the quality signal but it is
                      unreadable at our sample sizes, so ranking on it put an unpublished video
                      showing 2153% (one browser tab left running) at the top of the board. */}
                  {d.metrics
                    .slice()
                    .sort((a, b) => b.views - a.views)
                    .map((m) => (
                      <li key={m.videoId} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate text-text-primary">
                          <span className="text-[10px] mr-1 text-text-muted">{m.kind === 'short' ? '🩳' : '🎬'}</span>
                          {m.title}
                        </span>
                        <span className="flex items-center gap-3 text-text-secondary shrink-0">
                          {m.publicationState && m.publicationState !== 'public' && (
                            <span
                              className="text-[10px] px-1 rounded"
                              style={{ color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}
                              title={m.liveAt ? `goes live ${new Date(m.liveAt).toLocaleDateString()}` : 'never released'}
                            >
                              {m.publicationState === 'scheduled' && m.liveAt
                                ? `scheduled ${m.liveAt.slice(0, 10)}`
                                : m.publicationState}
                            </span>
                          )}
                          <span title={m.avgViewPercentage > 0 ? 'completion' : 'not readable yet — analytics lags ~3 days'}>
                            {m.avgViewPercentage > 0 ? `${m.avgViewPercentage.toFixed(0)}%` : '—'}
                          </span>
                          <span title="views (live public counter)" className="text-text-muted">{m.views} v</span>
                        </span>
                      </li>
                    ))}
                </ul>
              </CardBody>
            </Card>
          </div>

          <p className="text-[11px] text-text-muted">
            Generated {new Date(d.generatedAt).toLocaleString()} · completion = % viewed (quality) ·
            views = exposure gate · virality = loops+shares (not likes).
          </p>
        </div>
      )}
    </StudioContentFrame>
  );
}
