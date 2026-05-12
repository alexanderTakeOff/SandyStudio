// ──────────────────────────────────────────────────────────────────────────────
// scripts/cleanup-s14-style-canon.ts
// One-off Director-authorised cleanup: soft-reject the stale S14 style/location
// canon assets that were dragging generations into 3D-cafe look, and clear
// `metadata.image_prompt.style_anchor_asset_id` on dependent assets that
// pointed at the LOCKED style anchor.
//
// Built 2026-05-12 per Director's q3 (gybrid soft-archive, NO physical DELETE).
//
// Usage:
//   npx tsx --env-file=.env.local scripts/cleanup-s14-style-canon.ts          # dry-run (default)
//   npx tsx --env-file=.env.local scripts/cleanup-s14-style-canon.ts --commit # actually write
//
// What it does (BOTH phases run; dry-run shows what would change without writing):
//   Phase A — flip 3 stale style/location assets to status='REJECTED':
//     - 7a43b77b-… style_episode_perfume_02 LOCKED (the main 3D-cafe culprit)
//     - 94b23a3e-… style_episode_perfume_style DRAFT (.mp4 in staging)
//     - 4e698119-… location_neon_cafe LOCKED (bonus — same bad upload)
//     The 2 already-REJECTED drafts (75c0eeea, d9f67fd8) are left alone.
//
//   Phase B — clear style_anchor_asset_id on dependents pointing at the LOCKED
//     style asset (7a43b77b…). Sets metadata.image_prompt.style_anchor_asset_id
//     to NULL so the next `regenerateBibleImage` falls through to the asset's
//     own prompt without inheriting the bad anchor. Affected assets per
//     PA's 08:08 audit: Perfume Madame, Sandy Fogged Glass Variant, Violet
//     Distance Cafe, Perfume Counter Bar, Violet Neon Alley.
//
// Safety:
//   - Dry-run by default. `--commit` required to actually write.
//   - Bypasses the asset_status state machine (LOCKED → REJECTED is normally
//     blocked, but admin-level SQL via service-role client is allowed for
//     one-off Director-authorised resets like this).
//   - Logs every row read AND every row that would be / has been touched.
//   - Idempotent: re-running after commit is a no-op (target rows are already
//     REJECTED, dependent anchors are already NULL).
// ──────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// Force-load .env.local with override (Windows gotcha — see memory file
// node_env_file_does_not_override.md).
function loadDotenvOverride(filename: string): void {
  try {
    const text = readFileSync(resolve(process.cwd(), filename), 'utf-8');
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  } catch {
    /* file missing — environment may already be set */
  }
}

loadDotenvOverride('.env.local');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SRK) {
  console.error('[cleanup] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const commit = process.argv.includes('--commit');
console.log(`[cleanup] Mode: ${commit ? 'COMMIT (writes will happen)' : 'DRY-RUN (no writes)'}`);

const STALE_LOCKED_STYLE = '7a43b77b-8bf0-49ef-9b14-15413377d9df';

// Phase A targets — assets to flip to REJECTED.
const PHASE_A_TARGETS: ReadonlyArray<string> = [
  STALE_LOCKED_STYLE,
  '94b23a3e-6f17-47a6-b931-71b904b90209', // style_episode_perfume_style DRAFT (.mp4)
  '4e698119-a3b2-47d4-9dc1-33993b129faa', // location_neon_cafe LOCKED (bonus)
];

interface AssetRow {
  id: string;
  filename: string;
  status: string;
  file_type: string;
  metadata: { image_prompt?: { style_anchor_asset_id?: string | null } } | null;
}

async function main(): Promise<void> {
  const sb = createClient(SUPABASE_URL!, SUPABASE_SRK!, {
    auth: { persistSession: false },
  });

  // ── Pre-flight: read current state of Phase A targets ─────────────────────
  console.log('\n[Phase A] Reading current state of style/location targets…');
  const { data: aRows, error: aErr } = await sb
    .from('assets')
    .select('id, filename, status, file_type, metadata')
    .in('id', PHASE_A_TARGETS as string[]);
  if (aErr) throw new Error(`Phase A read failed: ${aErr.message}`);

  const aAssets = (aRows ?? []) as AssetRow[];
  for (const a of aAssets) {
    console.log(`  - ${a.filename}  [${a.status}]  ${a.id}`);
  }
  const aToFlip = aAssets.filter((a) => a.status !== 'REJECTED');
  console.log(`  → ${aToFlip.length} of ${aAssets.length} will flip to REJECTED.`);

  // ── Pre-flight: find Phase B dependents ───────────────────────────────────
  console.log('\n[Phase B] Reading dependents pointing at LOCKED style anchor…');
  const { data: bRows, error: bErr } = await sb
    .from('assets')
    .select('id, filename, status, file_type, metadata')
    .filter('metadata->image_prompt->>style_anchor_asset_id', 'eq', STALE_LOCKED_STYLE);
  if (bErr) throw new Error(`Phase B read failed: ${bErr.message}`);

  const bAssets = (bRows ?? []) as AssetRow[];
  for (const a of bAssets) {
    console.log(`  - ${a.filename}  [${a.status}]  ${a.id}`);
  }
  console.log(`  → ${bAssets.length} dependents will have style_anchor_asset_id cleared.`);

  if (!commit) {
    console.log('\n[cleanup] DRY-RUN complete. Re-run with --commit to apply.');
    return;
  }

  // ── Phase A — apply ────────────────────────────────────────────────────────
  console.log('\n[Phase A] Writing status=REJECTED…');
  for (const a of aToFlip) {
    const { error } = await sb
      .from('assets')
      .update({ status: 'REJECTED' })
      .eq('id', a.id);
    if (error) {
      console.error(`  ✗ ${a.id} ${a.filename} — ${error.message}`);
      throw error;
    }
    console.log(`  ✓ ${a.id} ${a.filename}  [${a.status} → REJECTED]`);

    await sb.from('activity_events').insert({
      event_type: 'asset_updated',
      severity: 'warn',
      title: `Style canon cleanup: ${a.filename} → REJECTED`,
      description: `Director-authorised cleanup (cleanup-s14-style-canon.ts 2026-05-12). Was [${a.status}], soft-archived to REJECTED to remove from active S14 canon.`,
      asset_id: a.id,
      metadata: {
        kind: 'style_canon_cleanup',
        previous_status: a.status,
        script: 'scripts/cleanup-s14-style-canon.ts',
      },
    } as never);
  }

  // ── Phase B — apply ────────────────────────────────────────────────────────
  console.log('\n[Phase B] Clearing style_anchor_asset_id on dependents…');
  for (const a of bAssets) {
    const meta = a.metadata ?? {};
    const newMeta = {
      ...meta,
      image_prompt: {
        ...(meta.image_prompt ?? {}),
        style_anchor_asset_id: null,
      },
    };
    const { error } = await sb
      .from('assets')
      .update({ metadata: newMeta as unknown as Record<string, unknown> } as never)
      .eq('id', a.id);
    if (error) {
      console.error(`  ✗ ${a.id} ${a.filename} — ${error.message}`);
      throw error;
    }
    console.log(`  ✓ ${a.id} ${a.filename}  [style_anchor cleared]`);

    await sb.from('activity_events').insert({
      event_type: 'asset_updated',
      severity: 'info',
      title: `Style anchor cleared: ${a.filename}`,
      description: `Director-authorised cleanup (cleanup-s14-style-canon.ts 2026-05-12). Was pointing at LOCKED 3D-cafe style anchor ${STALE_LOCKED_STYLE}; set to NULL pending new flat-2D canonical style asset.`,
      asset_id: a.id,
      metadata: {
        kind: 'style_anchor_cleared',
        previous_anchor: STALE_LOCKED_STYLE,
        script: 'scripts/cleanup-s14-style-canon.ts',
      },
    } as never);
  }

  console.log('\n[cleanup] COMMIT complete.');
  console.log(`  Phase A: ${aToFlip.length} assets → REJECTED`);
  console.log(`  Phase B: ${bAssets.length} dependents cleared`);
}

main().catch((err) => {
  console.error('[cleanup] FATAL:', err);
  process.exit(1);
});
