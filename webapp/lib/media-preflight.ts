// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/media-preflight.ts
// Gate-side media resolution check (I3 — "one LOUD Drive-aware media reader").
//
// Before a paid render fans out (e.g. EXEC-VGEN img2vid), every reference asset
// it depends on must have readable bytes. Drive-backed assets used to fail
// silently in /staging-only loaders → null bytes → img2vid silently degrades to
// t2v (identity drift) or the provider 422s. This module is the PURE, no-paid,
// no-throw pre-flight gate: it resolves each asset through the canonical reader
// (`readAssetMediaAsBase64`: disk-cache → Drive → legacy/staging) and reports
// which references are dead so the caller can HALT LOUDLY before spending money.
//
// Runner-side loaders (vgen-shot-helpers `loadApprovedMediaOrThrow`) throw on a
// miss; this gate-side check collects dead refs instead — it is a report, not a
// fail-fast. Callers decide whether `dead.length > 0` is fatal.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './supabase/types.gen';
import { readAssetMediaAsBase64 } from './media-cache';

/** One reference whose media could not be resolved to readable bytes. */
export interface DeadRef {
  assetId: string;
  reason: string;
}

/** A minimal asset descriptor the canonical reader can resolve. */
export interface PreflightAsset {
  id: string;
  filename?: string | null;
  driveFileId?: string | null;
  stagingPath?: string | null;
}

/**
 * Resolve every asset's media through the canonical Drive-aware reader and
 * report which ones yield no readable bytes. Pure read — no throws, no paid
 * API calls. `ok` is true only when every asset resolved.
 *
 * The `supabase` client is accepted for signature parity with runner-side
 * loaders (Unit 4 depends on this exact shape) and to allow future enrichment
 * of partial descriptors; the canonical reader itself needs no DB round-trip.
 */
export async function assertMediaResolves(
  supabase: SupabaseClient<Database>,
  assets: Array<PreflightAsset>,
): Promise<{ ok: boolean; dead: DeadRef[] }> {
  void supabase; // reserved for descriptor enrichment; reader is DB-free
  const dead: DeadRef[] = [];

  for (const asset of assets) {
    let b64: string | null = null;
    try {
      b64 = await readAssetMediaAsBase64({
        filename: asset.filename ?? null,
        driveFileId: asset.driveFileId ?? null,
        stagingPath: asset.stagingPath ?? null,
      });
    } catch (err: unknown) {
      // Pure read contract — never throw. Treat any reader fault as a dead ref.
      const message = err instanceof Error ? err.message : 'unknown read error';
      dead.push({ assetId: asset.id, reason: `media read threw: ${message}` });
      continue;
    }
    if (!b64 || b64.length === 0) {
      dead.push({
        assetId: asset.id,
        reason:
          'media did not resolve (no disk-cache hit, no Drive bytes, no legacy staging file)',
      });
    }
  }

  return { ok: dead.length === 0, dead };
}
