// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/runners/visual-shot-critic.ts
// In-pipeline advisory runner for the post-render Visual Critic.
//
// For each rendered IMG-episode_ref (a still) and/or VID-shot (frames sampled via
// sample-frames) of an episode, it loads the pixels + the storyboard shot contract
// + the style Bible, runs the vision verdict (core in lib/agents/visual-verdict.ts)
// on the Director-selected model, and logs an activity_event with the verdict.
// ADVISORY: it never changes asset status and never blocks — a failure degrades to a
// logged note. Enforce (revision-loop) is a later phase behind VISUAL_CRITIC_ENFORCE.
//
// Runs OUTSIDE the hot render loop (post-batch / on-demand) so it adds no per-shot
// render latency. Gated by VISUAL_CRITIC_ENABLED for the (deferred) auto-fire hook.
// ──────────────────────────────────────────────────────────────────────────────

import { readFile, writeFile, rm } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../supabase/types.gen';
import { logEvent } from '../../api/events';
import { resolveVisualCriticModel } from '../../api/visual-critic-provider-config';
import {
  runVisualVerdictMetered,
  VisualVerdictParseError,
  loadShotContract,
  loadStyleCanon,
  loadLocationCanon,
  type VisualVerdict,
} from '../visual-verdict';
import { recordCost } from '../../budget';
import { sampleVideoFrames } from '../sample-frames';
import { cachedFileIfPresent } from '../../media-cache';
import { downloadFile } from '../providers/drive';

type Client = SupabaseClient<Database>;
export type VisualCriticKind = 'ref' | 'video' | 'both';

export function visualCriticEnabled(): boolean {
  return (process.env.VISUAL_CRITIC_ENABLED ?? 'false').toLowerCase() === 'true';
}

interface AssetRow {
  id: string;
  file_type: string;
  status: string;
  filename: string;
  staging_path: string | null;
  drive_path: string | null;
  drive_web_view_url: string | null;
  drive_file_id: string | null;
  metadata: unknown;
}

const ASSET_SELECT = 'id,file_type,status,filename,staging_path,drive_path,drive_web_view_url,drive_file_id,metadata';

/** Absolute media-cache path for an asset's rendered binary (/api/media/<file>). */
async function cachedPath(row: AssetRow): Promise<string | null> {
  const url = row.staging_path ?? row.drive_path ?? row.drive_web_view_url;
  if (!url) return null;
  const m = url.match(/\/api\/media\/([^/?]+)/);
  if (!m) return null;
  return cachedFileIfPresent(decodeURIComponent(m[1]!));
}

/**
 * Resolve a LOCAL mp4 path for a VID-shot so ffmpeg can sample frames: prefer the
 * media cache; else download the bytes (Drive file id, or an http(s) URL) to a temp
 * file. Returns the path + a cleanup fn (no-op for a cache hit). Mirrors the stitch's
 * loadBytes resolution order without duplicating its Buffer-only shape.
 */
async function localVideoPath(row: AssetRow): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const cached = await cachedPath(row);
  if (cached) return { path: cached, cleanup: async () => {} };

  let bytes: Buffer | null = null;
  if (row.drive_file_id) {
    bytes = Buffer.from(await downloadFile(row.drive_file_id));
  } else {
    const url = row.staging_path ?? row.drive_path ?? row.drive_web_view_url;
    if (url && /^https?:\/\//.test(url)) {
      const res = await fetch(url);
      if (res.ok) bytes = Buffer.from(await res.arrayBuffer());
    }
  }
  if (!bytes) throw new Error('video bytes not resolvable (not in cache, no drive id / http url)');
  const tmp = path.join(os.tmpdir(), `vcrit-vid-${row.id}.mp4`);
  await writeFile(tmp, bytes);
  return { path: tmp, cleanup: async () => { await rm(tmp, { force: true }).catch(() => {}); } };
}

/** Extract the location SLUG from a shot contract, dropping any sub_area suffix
 *  ("gala_hall — entrance" → "gala_hall") so the location Bible can be matched. */
function locationSlugOf(contract: unknown): string | null {
  const loc = (contract as { location?: unknown } | null)?.location;
  if (typeof loc === 'string') return loc.split(/\s*[—|]\s*| - /)[0]?.trim() || null;
  if (loc && typeof loc === 'object') {
    const o = loc as { slug?: string; name?: string };
    return o.slug ?? o.name ?? null;
  }
  return null;
}

/** shot_id: IMG uses shot_reference.shot_id; VID uses shot_id / storyboard_shot.shot_id. */
function shotIdOf(row: AssetRow): string | null {
  const meta = row.metadata as {
    shot_reference?: { shot_id?: string };
    shot_id?: string;
    storyboard_shot?: { shot_id?: string };
  } | null;
  return meta?.shot_reference?.shot_id ?? meta?.shot_id ?? meta?.storyboard_shot?.shot_id ?? null;
}

export interface VisualCriticResult {
  assetId: string;
  shotId: string | null;
  kind: 'ref' | 'video';
  verdict: VisualVerdict | null;
  error?: string;
  /**
   * Priced cost of this asset's vision call (2026-07-25). Non-zero even when
   * `verdict` is null and `error` is set, if the model was reached and billed —
   * a wasted paid call must still show up on the Budget tab.
   */
  costUsd: number;
}

/**
 * Write one budget_log row for a vision call (2026-07-25).
 *
 * Per-call rather than one row per sweep, so the ledger shows how many judgements
 * a whole-episode check actually paid for. `jobId: null` — the critic is advisory
 * and Director-triggered, with no Inngest job row (same convention as the manual
 * rerolls in /api/assets/[id]/regenerate-image). `enforceCeiling: false` because
 * the tokens are already billed by the time we get here; refusing the row would
 * lose the audit trail rather than save the money.
 *
 * Best-effort: an accounting hiccup must never break an advisory critic run.
 */
async function billVisionCall(
  supabase: Client,
  episodeId: string,
  costUsd: number,
  model: string,
): Promise<void> {
  if (costUsd <= 0) return;
  try {
    await recordCost(supabase, {
      jobId: null,
      episodeId,
      agentId: 'EXEC-VCRIT',
      costUsd,
      apiProvider: providerOfModel(model),
      modelOrTier: model,
      operation: 'visual_critic',
      enforceCeiling: false,
    });
  } catch {
    /* advisory path — never fail a critic run over a ledger write */
  }
}

/** Vendor bucket from the model id — mirrors visionClient()'s prefix routing. */
function providerOfModel(model: string): string {
  if (model.startsWith('gemini')) return 'gemini';
  if (model.startsWith('claude')) return 'anthropic';
  return 'openai';
}

/**
 * Advisory sweep over an episode's rendered IMG-episode_ref and/or VID-shot assets.
 * Writes one activity_event per asset with the verdict; returns the verdicts.
 * Best-effort: per-asset failures are captured, never thrown.
 */
export async function runVisualCriticForEpisode(
  supabase: Client,
  episodeId: string,
  opts: { shotIds?: string[]; statuses?: string[]; kind?: VisualCriticKind } = {},
): Promise<VisualCriticResult[]> {
  const kind = opts.kind ?? 'both';
  const statuses = (opts.statuses ?? ['REVIEW', 'APPROVED']) as Database['public']['Enums']['asset_status'][];
  const { data: ep } = await supabase
    .from('episodes')
    .select('id, series_id, episode_code')
    .eq('id', episodeId)
    .maybeSingle();
  const seriesId = (ep as { series_id?: string | null } | null)?.series_id ?? null;

  const model = await resolveVisualCriticModel(supabase);
  const styleCanon = seriesId ? await loadStyleCanon(supabase, seriesId) : '(no series style)';

  // Collect the target assets: IMG refs and/or VID shots.
  const wantRef = kind === 'ref' || kind === 'both';
  const wantVid = kind === 'video' || kind === 'both';
  const targets: Array<{ row: AssetRow; assetKind: 'ref' | 'video' }> = [];
  if (wantRef) {
    const { data } = await supabase
      .from('assets')
      .select(ASSET_SELECT)
      .eq('episode_id', episodeId)
      .like('file_type', 'IMG-episode_ref%')
      .in('status', statuses);
    for (const row of (data ?? []) as AssetRow[]) targets.push({ row, assetKind: 'ref' });
  }
  if (wantVid) {
    const { data } = await supabase
      .from('assets')
      .select(ASSET_SELECT)
      .eq('episode_id', episodeId)
      .like('file_type', 'VID-shot%')
      .in('status', statuses);
    for (const row of (data ?? []) as AssetRow[]) targets.push({ row, assetKind: 'video' });
  }

  const results: VisualCriticResult[] = [];

  for (const { row, assetKind } of targets) {
    const shotId = shotIdOf(row);
    if (opts.shotIds && (!shotId || !opts.shotIds.includes(shotId))) continue;
    try {
      let frames: string[];
      if (assetKind === 'video') {
        const v = await localVideoPath(row);
        try {
          frames = await sampleVideoFrames(v.path, { frames: 10, width: 512 });
        } finally {
          await v.cleanup();
        }
      } else {
        const abs = await cachedPath(row);
        if (!abs) throw new Error('rendered bytes not in media cache');
        frames = [(await readFile(abs)).toString('base64')];
      }
      if (frames.length === 0) throw new Error('no frames extracted');

      const shotNum = shotId ? shotId.replace(/.*(SH\d+).*/i, '$1') : '';
      const contract = shotNum ? await loadShotContract(supabase, episodeId, shotNum) : null;
      if (!contract) throw new Error(`no storyboard contract for shot ${shotId ?? '?'}`);

      // Load the location Bible so the critic has spatial ground-truth (set-dressing
      // left/right) and can catch a horizontally-mirrored render. Phantom locations
      // (no Bible) yield a "(no location canon…)" note that tells the critic NOT to
      // invent a layout to judge against.
      const locationCanon = seriesId
        ? await loadLocationCanon(supabase, seriesId, locationSlugOf(contract))
        : '(no series)';

      const metered = await runVisualVerdictMetered({ frames, contract, styleCanon, locationCanon, model });
      const verdict = metered.verdict;
      await billVisionCall(supabase, episodeId, metered.usage.costUsd, model);
      results.push({ assetId: row.id, shotId, kind: assetKind, verdict, costUsd: metered.usage.costUsd });

      const critical = verdict.findings.filter((f) => f.severity === 'critical').length;
      const major = verdict.findings.filter((f) => f.severity === 'major').length;
      await logEvent(supabase, {
        event_type: 'manual_trigger',
        severity: verdict.verdict === 'PASS' ? 'info' : 'warning',
        title: `👁 Visual Critic (${assetKind}): ${row.filename} → ${verdict.verdict}`,
        description: verdict.summary,
        actor: 'EXEC-VCRIT',
        episode_id: episodeId,
        asset_id: row.id,
        metadata: {
          kind: 'visual_verdict',
          advisory: true,
          asset_kind: assetKind,
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
      // A parse failure means the vision call DID happen and was billed. Record it
      // — a paid call that produced nothing usable is precisely the waste the
      // Director needs visible. Other failures (no frames, no contract) never
      // reached the model and cost nothing.
      const wastedUsd =
        err instanceof VisualVerdictParseError ? err.usage.costUsd : 0;
      if (wastedUsd > 0) {
        await billVisionCall(supabase, episodeId, wastedUsd, model);
      }
      results.push({ assetId: row.id, shotId, kind: assetKind, verdict: null, error, costUsd: wastedUsd });
      await logEvent(supabase, {
        event_type: 'manual_trigger',
        severity: 'info',
        title: `👁 Visual Critic (${assetKind}): ${row.filename} → skipped`,
        description: `advisory critic could not judge this asset: ${error}`,
        actor: 'EXEC-VCRIT',
        episode_id: episodeId,
        asset_id: row.id,
        metadata: { kind: 'visual_verdict_skipped', advisory: true, asset_kind: assetKind, shot_id: shotId, error },
      }).catch(() => {});
    }
  }

  return results;
}
