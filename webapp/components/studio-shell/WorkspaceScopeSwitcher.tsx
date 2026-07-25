// ──────────────────────────────────────────────────────────────────────────────
// components/studio-shell/WorkspaceScopeSwitcher.tsx
// Глобальный переключатель канал/сериал (multi-channel Phase 3, spec §8).
// Rendered directly in StudioTopbar LEFT of #studio-topbar-slot — deliberately
// NOT a portal into the slot, which stays the pages' contextual-header host
// (the episode page portals a flex-1 block there; two flex-1 portals would fight).
//
// Self-hides while the studio has ≤1 series and no active scope — no wallpaper
// chrome before the second project exists.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import useSWR from 'swr';
import { Clapperboard } from 'lucide-react';
import { fetcher } from '@/lib/swr';
import { useWorkspaceScope } from '@/components/providers/WorkspaceScopeProvider';

interface SeriesRow {
  id: string;
  code: string;
  title: string;
  channel_id: string | null;
}

interface ChannelRow {
  id: string;
  name: string;
}

export function WorkspaceScopeSwitcher() {
  const { seriesId, setSeriesId } = useWorkspaceScope();
  const { data: seriesData } = useSWR<{ data: SeriesRow[] }>('/api/series', fetcher, {
    refreshInterval: 60_000,
  });
  const { data: channelsData } = useSWR<{ data: ChannelRow[] }>('/api/channels', fetcher);

  const series = seriesData?.data ?? [];
  const channels = channelsData?.data ?? [];
  const channelById = new Map(channels.map((c) => [c.id, c]));
  const multiChannel = channels.length > 1;

  if (series.length <= 1 && !seriesId) return null;

  const active = series.find((s) => s.id === seriesId) ?? null;
  const activeChannel = active?.channel_id ? channelById.get(active.channel_id) : null;

  return (
    <div className="flex items-center gap-2 shrink-0">
      <Clapperboard size={14} className="text-text-muted" />
      <select
        value={seriesId ?? ''}
        onChange={(e) => setSeriesId(e.target.value || null)}
        className="h-8 px-2 rounded-lg bg-[var(--bg-elevated)] border border-glass text-xs text-text-primary focus:outline-none focus:border-[var(--accent-primary)] max-w-[240px]"
        title="Workspace scope — какой сериал показывают Episodes/Budget/Audience/Inbox/Jobs/Activity"
      >
        <option value="">Вся студия</option>
        {series.map((s) => {
          const ch = s.channel_id ? channelById.get(s.channel_id) : null;
          return (
            <option key={s.id} value={s.id}>
              {s.code} · {s.title}
              {multiChannel && ch ? ` — 📺 ${ch.name}` : ''}
            </option>
          );
        })}
      </select>
      {activeChannel && (
        <span className="hidden md:inline text-[11px] text-text-muted whitespace-nowrap">
          📺 {activeChannel.name}
        </span>
      )}
      <span className="h-6 w-px bg-[var(--panel-glass-border)]" aria-hidden />
    </div>
  );
}
