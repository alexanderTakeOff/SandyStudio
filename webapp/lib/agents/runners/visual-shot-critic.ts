// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/runners/visual-shot-critic.ts
// In-pipeline advisory runner for the post-render Visual Critic.
//
// For each rendered IMG-episode_ref of an episode, it loads the pixels + the
// storyboard shot contract + the style Bible, runs the vision verdict (core in
// lib/agents/visual-verdict.ts) on the Director-selected model, and logs an
// activity_event with the verdict. ADVISORY: it never changes asset status and
// never blocks — a failure degrades to a logged note. Enforce (revision-loop) is a
// later phase behind VISUAL_CRITIC_ENFORCE.
//
// Runs OUTSIDE the hot render loop (post-batch / on-demand) so it adds no per-shot
// render latency. Gated by VISUAL_CRITIC_ENABLED.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../supabase/types.gen';
import { logEvent } from '../../api/events';
import { resolveVisualCriticModel } from '../../api/visual-critic-provider-config';
import { runVisualVerdict, loadShotContract, loadStyleCanon, type VisualVerdict } from '../visual-verdict';
import { cachedFileIfPresent } from '../../media-cache';

type Client = SupabaseClient<Database>;

export function visualCriticEnabled(): boolean {
  return (process.env.VISUAL_CRITIC_ENABLED ?? 'false').toLowerCase() === 'true';
}

interface RefAssetRow {
  id: string;
  file_type: string;
  status: string;
  filename: string;
  staging_path: string | null;
  drive_path: string | null;
  drive_web_view_url: string | null;
  metadata: unknown;
}

/** Read a rendered asset's bytes as base64 from the local media cache (/api/media/<file>). */
async function assetBase64(row: RefAssetRow): Promise<string | null> {
  const url = row.staging_path ?? row.drive_path ?? row.drive_web_view_url;
  if (!url) return null;
  const m = url.match(/\/api\/media\/([^/?]+)/);
  if (!m) return null;
  const filename = decodeURIComponent(m[1]!);
  const abs = await cachedFileIfPresent(filename);
  if (!abs) return null;
  const { readFile } = await import('node:fs/promises');
  return (await readFile(abs)).toString('base64');
}

/** shot_id lives in the IMG-ref's shot_reference contract metadata. */
function shotIdOf(row: RefAssetRow): string | null {
  const meta = row.metadata as { shot_reference?: { shot_id?: string } } | null;
  return meta?.shot_reference?.shot_id ?? null;
}

export interface VisualCriticResult {
  assetId: string;
  shotId: string | null;
  verdict: VisualVerdict | null;
  error?: string;
}

/**
 * Advisory sweep over an episode's rendered IMG-episode_ref assets. Writes one
 * activity_event per asset with the verdict; returns the verdicts. Best-effort:
 * per-asset failures are captured, never thrown.
 */
export async function runVisualCriticForEpisode(
  supabase: Client,
  episodeId: string,
  opts: { shotIds?: string[]; statuses?: string[] } = {},
): Promise<VisualCriticResult[]> {
  const statuses = opts.statuses ?? ['REVIEW', 'APPROVED'];
  const { data: ep } = await supabase
    .from('episodes')
    .select('id, series_id, episode_code')
    .eq('id', episodeId)
    .maybeSingle();
  const seriesId = (ep as { series_id?: string | null } | null)?.series_id ?? null;

  const model = await resolveVisualCriticModel(supabase);
  const styleCanon = seriesId ? await loadStyleCanon(supabase, seriesId) : '(no series style)';

  const { data: rows } = await supabase
    .from('assets')
    .select('id,file_type,status,filename,staging_path,drive_path,drive_web_view_url,metadata')
    .eq('episode_id', episodeId)
    .like('file_type', 'IMG-episode_ref%')
    .in('status', statuses as Database['public']['Enums']['asset_status'][]);

  const refs = (rows ?? []) as RefAssetRow[];
  const results: VisualCriticResult[] = [];

  for (const row of refs) {
    const shotId = shotIdOf(row);
    if (opts.shotIds && (!shotId || !opts.shotIds.includes(shotId))) continue;
    try {
      const b64 = await assetBase64(row);
      if (!b64) throw new Error('image bytes not in media cache');
      const contract = shotId ? await loadShotContract(supabase, episodeId, shotId.replace(/.*(SH\d+).*/i, '$1')) : null;
      if (!contract) throw new Error(`no storyboard contract for shot ${shotId ?? '?'}`);
      const verdict = await runVisualVerdict({ frames: [b64], contract, styleCanon, model });
      results.push({ assetId: row.id, shotId, verdict });

      const critical = verdict.findings.filter((f) => f.severity === 'critical').length;
      const major = verdict.findings.filter((f) => f.severity === 'major').length;
      await logEvent(supabase, {
        event_type: 'agent_output',
        severity: verdict.verdict === 'PASS' ? 'info' : 'warning',
        title: `👁 Visual Critic: ${row.filename} → ${verdict.verdict}`,
        description: verdict.summary,
        actor: 'EXEC-VCRIT',
        episode_id: episodeId,
        asset_id: row.id,
        metadata: {
          kind: 'visual_verdict',
          advisory: true,
          model,
          shot_id: shotId,
          verdict: verdict.verdict,
          critical,
          major,
          findings: verdict.findings,
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : 'unknown';
      results.push({ assetId: row.id, shotId, verdict: null, error });
      // Log the failure too so a broken critic is visible, not silent.
      await logEvent(supabase, {
        event_type: 'agent_output',
        severity: 'info',
        title: `👁 Visual Critic: ${row.filename} → skipped`,
        description: `advisory critic could not judge this asset: ${error}`,
        actor: 'EXEC-VCRIT',
        episode_id: episodeId,
        asset_id: row.id,
        metadata: { kind: 'visual_verdict_skipped', advisory: true, shot_id: shotId, error },
      }).catch(() => {});
    }
  }

  return results;
}
