// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/providers/channel-resolver.ts
// Channel passport resolution — multi-channel.md §4/§5.
//
// Cascade: episodeId → episodes.series_id → series.channel_id → channels row.
// The STRICT tail is the point: a series without a channel at a publish/
// analytics gate is a fail-fast HALT (ChannelResolutionError) — never a silent
// fallback to a global env token (that is exactly how a test series would leak
// onto the Sandy channel). The mock pathway exists only when NO YouTube
// credential is configured at all (dev / replay-pilot / tests).
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types.gen';
import {
  hasAnyYouTubeCredential,
  resolveChannelRefreshToken,
} from './google-auth';
import { getMyChannel, YouTubeError } from './youtube';

export interface ChannelPassport {
  id: string;
  name: string;
  youtubeChannelId: string;
  credentialKey: string;
  ntfyTopic: string | null;
  status: string;
  /** jsonb extension — branding defaults etc. (multi-channel.md §2, Phase 2). */
  metadata: Record<string, unknown>;
}

/**
 * Per-channel YouTube publish defaults (multi-channel Phase 4e). Stored in
 * channels.metadata.publish_defaults; absent keys fall back to the provider's
 * own defaults (categoryId '23', madeForKids false, no language).
 */
export interface PublishDefaults {
  categoryId?: string;
  madeForKids?: boolean;
  defaultLanguage?: string;
}

export function publishDefaultsOf(passport: ChannelPassport): PublishDefaults {
  const raw = passport.metadata['publish_defaults'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const pd = raw as Record<string, unknown>;
  const out: PublishDefaults = {};
  if (typeof pd.category_id === 'string' && pd.category_id.trim()) out.categoryId = pd.category_id.trim();
  if (typeof pd.made_for_kids === 'boolean') out.madeForKids = pd.made_for_kids;
  if (typeof pd.default_language === 'string' && pd.default_language.trim()) out.defaultLanguage = pd.default_language.trim();
  return out;
}

export class ChannelResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChannelResolutionError';
  }
}

type Client = SupabaseClient<Database>;

interface ChannelRow {
  id: string;
  name: string;
  youtube_channel_id: string;
  credential_key: string;
  ntfy_topic: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
}

function toPassport(row: ChannelRow): ChannelPassport {
  return {
    id: row.id,
    name: row.name,
    youtubeChannelId: row.youtube_channel_id,
    credentialKey: row.credential_key,
    ntfyTopic: row.ntfy_topic,
    status: row.status,
    metadata: row.metadata ?? {},
  };
}

const CHANNEL_COLS = 'id, name, youtube_channel_id, credential_key, ntfy_topic, status, metadata';

/** Soft read: the channel passport of a series, or null when unattached. */
export async function getChannelForSeries(
  supabase: Client,
  seriesId: string,
): Promise<ChannelPassport | null> {
  const { data, error } = await supabase
    .from('series')
    .select('channel_id')
    .eq('id', seriesId);
  if (error) throw new ChannelResolutionError(`series read failed: ${error.message}`);
  const channelId = (data ?? [])[0]?.channel_id;
  if (!channelId) return null;
  const ch = await supabase.from('channels').select(CHANNEL_COLS).eq('id', channelId);
  if (ch.error) throw new ChannelResolutionError(`channels read failed: ${ch.error.message}`);
  const row = (ch.data ?? [])[0] as ChannelRow | undefined;
  return row ? toPassport(row) : null;
}

/** Strict resolve for a series: no channel → HALT. */
export async function resolveChannelForSeries(
  supabase: Client,
  seriesId: string,
): Promise<ChannelPassport> {
  const passport = await getChannelForSeries(supabase, seriesId);
  if (!passport) {
    throw new ChannelResolutionError(
      `Series ${seriesId} has no channel attached. Attach a channel to the series ` +
        `before publish/analytics (multi-channel.md §4) — no fallback to a global token.`,
    );
  }
  return passport;
}

/** Strict resolve via the full cascade episode → series → channel. */
export async function resolveChannelForEpisode(
  supabase: Client,
  episodeId: string,
): Promise<ChannelPassport> {
  const { data, error } = await supabase
    .from('episodes')
    .select('series_id')
    .eq('id', episodeId);
  if (error) throw new ChannelResolutionError(`episode read failed: ${error.message}`);
  const seriesId = (data ?? [])[0]?.series_id;
  if (!seriesId) {
    throw new ChannelResolutionError(`Episode ${episodeId} has no parent series — cannot resolve a channel.`);
  }
  return resolveChannelForSeries(supabase, seriesId);
}

/**
 * Identity guard (multi-channel.md §5): the token must actually belong to the
 * passport's channel. Catches the human error of consenting the wrong brand
 * account. Run before real upload and on every snapshot tick.
 */
export async function assertChannelIdentity(
  passport: ChannelPassport,
  refreshToken: string,
): Promise<void> {
  let liveId: string;
  try {
    liveId = (await getMyChannel({ refreshToken })).id;
  } catch (err) {
    if (err instanceof YouTubeError) {
      throw new ChannelResolutionError(
        `Channel identity check failed for ${passport.credentialKey}: ${err.message}`,
      );
    }
    throw err;
  }
  if (liveId !== passport.youtubeChannelId) {
    throw new ChannelResolutionError(
      `Token/channel mismatch for credential_key=${passport.credentialKey}: token belongs to ` +
        `channel ${liveId}, passport says ${passport.youtubeChannelId}. Re-run youtube-consent ` +
        `with --key ${passport.credentialKey} and pick the right brand account.`,
    );
  }
}

export type YouTubePathway =
  | { mode: 'mock' }
  | { mode: 'real'; passport: ChannelPassport; refreshToken: string };

/**
 * Gate decision for EXEC-PUB / EXEC-ANAL (multi-channel.md §4):
 *   - no supabase OR no YouTube credential in env at all → mock (dev/replay-pilot);
 *   - credentials exist → STRICT cascade: series without channel → HALT;
 *     channel not ACTIVE → HALT; env token for its credential_key missing → HALT.
 */
export async function decideYouTubePathway(
  supabase: Client | null | undefined,
  episodeId: string,
): Promise<YouTubePathway> {
  if (!supabase || !hasAnyYouTubeCredential()) return { mode: 'mock' };
  const passport = await resolveChannelForEpisode(supabase, episodeId);
  if (passport.status !== 'ACTIVE') {
    throw new ChannelResolutionError(
      `Channel ${passport.name} (${passport.credentialKey}) is ${passport.status} — ` +
        `publish/analytics blocked until it is ACTIVE.`,
    );
  }
  // Throws GoogleAuthError (HALT) when the env token for this key is absent.
  const refreshToken = resolveChannelRefreshToken(passport.credentialKey);
  return { mode: 'real', passport, refreshToken };
}
