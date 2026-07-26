// ──────────────────────────────────────────────────────────────────────────────
// app/(studio)/page.tsx — Dashboard cockpit per dashboard_cockpit.md.
// 3 zones: Inbox preview · Active Episodes timelines · Live activity feed.
// ──────────────────────────────────────────────────────────────────────────────

import { redirect } from 'next/navigation';
import { StudioContentFrame } from '@/components/studio-shell/StudioContentFrame';
import { InboxPreviewZone } from '@/components/dashboard/InboxPreviewZone';
import { ActiveEpisodesZone } from '@/components/dashboard/ActiveEpisodesZone';
import { ActivityFeedZone } from '@/components/dashboard/ActivityFeedZone';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  // Onboarding redirect — if needed_run, send to wizard.
  // Resilient to schema absence (migration 0010 not yet pushed).
  try {
    const supabase = await createSupabaseServerClient();
    const [seriesRes, storageRes] = await Promise.all([
      (supabase.from('series' as never) as unknown as { select: (cols: string, opts?: { count?: string; head?: boolean }) => Promise<{ count: number | null }> })
        .select('id', { count: 'exact', head: true }),
      supabase.from('app_config').select('key,value').eq('scope', 'storage'),
    ]);
    const seriesCount = (seriesRes as unknown as { count: number | null }).count ?? 0;
    let cacheWritable = false;
    for (const row of storageRes.data ?? []) {
      const r = row as { key: string; value: unknown };
      if (r.key === 'media_cache_writable' && r.value === true) cacheWritable = true;
    }
    if (seriesCount === 0 && !cacheWritable) {
      redirect('/onboarding');
    }
  } catch {
    // schema absent — render cockpit normally; the user may not yet have run migration 0010
  }

  return (
    <StudioContentFrame>
      <header className="mb-5">
        <h1 className="text-2xl font-semibold text-text-primary">Dashboard</h1>
        <p className="text-sm text-text-secondary mt-1">
          Production cockpit — what needs you, what is in flight, what just happened.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4">
        <InboxPreviewZone />
        <ActiveEpisodesZone />
        <ActivityFeedZone />
      </div>
    </StudioContentFrame>
  );
}
