// ──────────────────────────────────────────────────────────────────────────────
// app/api/onboarding/state/route.ts
// Read onboarding wizard state. Per onboarding.md §2.
// ──────────────────────────────────────────────────────────────────────────────

import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface OnboardingState {
  current_step: 1 | 2 | 3 | 4;
  completed_steps: number[];
  draft_series_id: string | null;
  draft_episode_id: string | null;
  started_at: string | null;
}

const DEFAULT_STATE: OnboardingState = {
  current_step: 1,
  completed_steps: [],
  draft_series_id: null,
  draft_episode_id: null,
  started_at: null,
};

export const GET = withApiHandler(async () => {
  const { supabase } = await requireDirector();

  const [stateRes, seriesCount, storageRes] = await Promise.all([
    supabase
      .from('app_config')
      .select('value')
      .eq('scope', 'onboarding')
      .eq('key', 'state')
      .maybeSingle(),
    supabase.from('episodes').select('id', { count: 'exact', head: true }),
    supabase
      .from('app_config')
      .select('key,value')
      .eq('scope', 'storage'),
  ]);

  const state = (stateRes.data?.value as OnboardingState | undefined) ?? DEFAULT_STATE;

  // Trigger condition per onboarding.md §1.1
  let needs_run = false;
  // We use jobs table absence + storage probe age as proxies. series.count is
  // not yet implemented (Phase 5b series table is new); fall back to checking
  // episodes count.
  const epCount = seriesCount.count ?? 0;
  const storageMap = new Map<string, unknown>();
  for (const r of storageRes.data ?? []) storageMap.set(r.key, r.value);
  const projectWritable = (storageMap.get('project_root_writable') as boolean | undefined) ?? false;
  const mediaWritable = (storageMap.get('media_root_writable') as boolean | undefined) ?? false;

  if (epCount === 0 && (!projectWritable || !mediaWritable)) needs_run = true;
  if (state.completed_steps.length < 4 && epCount === 0) needs_run = true;

  return apiOk({ ...state, needs_run });
});
