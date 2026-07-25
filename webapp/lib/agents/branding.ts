// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/branding.ts
// Shorts/publish branding resolution (multi-channel.md §2, Phase 2).
//
// Replaces the hardcoded «SANDY the HOURGLASS» literals (shorts route, EXEC-PUB,
// ShortsPanel) with data. Cascade per key:
//
//   series.metadata.branding.<key> → channels.metadata.branding.<key> → neutral
//
// Overlay additionally falls back to the channel NAME (that is exactly what the
// literal was); description falls back to the series logline. Sandy's current
// texts are seeded into channels.metadata by migration 0050, so behaviour for
// the existing channel is byte-identical.
//
// Pure resolver + thin DB loader in one file, mirroring delivery-targets.ts.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types.gen';
import { getChannelForSeries } from './providers/channel-resolver';

type Client = SupabaseClient<Database>;

export interface ShortBranding {
  /** Burned-in overlay text; null = no default (overlay renders nothing). */
  overlayText: string | null;
  /** YouTube description fallback when no APPROVED SPC-metadata exists. */
  description: string;
  /** Default YouTube tags for shorts uploads. */
  tags: string[];
}

interface BrandingSource {
  seriesMetadata?: Record<string, unknown> | null;
  seriesLogline?: string | null;
  channelMetadata?: Record<string, unknown> | null;
  channelName?: string | null;
}

const NEUTRAL_DESCRIPTION = '#Shorts';
const NEUTRAL_TAGS = ['Shorts'];

function brandingBlock(meta: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const b = (meta ?? {})['branding'];
  return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
}

function readString(block: Record<string, unknown>, key: string): string | null {
  const v = block[key];
  return typeof v === 'string' && v.trim() ? v : null;
}

function readStringArray(block: Record<string, unknown>, key: string): string[] | null {
  const v = block[key];
  if (!Array.isArray(v)) return null;
  const items = v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
  return items.length > 0 ? items : null;
}

/** Pure cascade — no DB. Exported for unit tests and non-episode callers. */
export function resolveShortBranding(src: BrandingSource): ShortBranding {
  const s = brandingBlock(src.seriesMetadata);
  const c = brandingBlock(src.channelMetadata);
  return {
    overlayText:
      readString(s, 'short_overlay_text') ??
      readString(c, 'short_overlay_text') ??
      (src.channelName?.trim() || null),
    description:
      readString(s, 'short_description') ??
      readString(c, 'short_description') ??
      (src.seriesLogline?.trim() ? `${src.seriesLogline.trim()} ${NEUTRAL_DESCRIPTION}` : NEUTRAL_DESCRIPTION),
    tags: readStringArray(s, 'short_tags') ?? readStringArray(c, 'short_tags') ?? [...NEUTRAL_TAGS],
  };
}

/**
 * DB loader via the episode cascade (episode → series → channel). Soft on every
 * step — branding is presentation, not a publish gate, so a channel-less series
 * gets neutral fallbacks instead of a HALT (the HALT belongs to
 * decideYouTubePathway at the actual upload).
 */
export async function loadShortBrandingForEpisode(
  supabase: Client,
  episodeId: string | null | undefined,
): Promise<ShortBranding> {
  if (!episodeId) return resolveShortBranding({});
  const { data: ep } = await supabase
    .from('episodes')
    .select('series_id')
    .eq('id', episodeId)
    .maybeSingle();
  const seriesId = (ep as { series_id?: string | null } | null)?.series_id ?? null;
  if (!seriesId) return resolveShortBranding({});

  const { data: series } = await supabase
    .from('series')
    .select('logline, metadata')
    .eq('id', seriesId)
    .maybeSingle();
  const seriesRow = series as { logline?: string | null; metadata?: Record<string, unknown> | null } | null;

  let channelMetadata: Record<string, unknown> | null = null;
  let channelName: string | null = null;
  try {
    const passport = await getChannelForSeries(supabase, seriesId);
    if (passport) {
      channelMetadata = passport.metadata;
      channelName = passport.name;
    }
  } catch {
    // Soft: a broken channel read degrades to neutral branding here; the
    // strict gate still fires at upload time.
  }

  return resolveShortBranding({
    seriesMetadata: seriesRow?.metadata ?? null,
    seriesLogline: seriesRow?.logline ?? null,
    channelMetadata,
    channelName,
  });
}
