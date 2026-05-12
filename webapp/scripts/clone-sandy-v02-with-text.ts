// ──────────────────────────────────────────────────────────────────────────────
// scripts/clone-sandy-v02-with-text.ts
// One-off Director-authorised: clone v01 LOCKED Sandy image into a new v02
// DRAFT row with full canonical text content. Director then locks v02 via UI.
//
// Built 2026-05-12 per Director's q1 (tactical fix; full Character Identity
// Model deferred per PA's recommended schema for Phase D).
//
// Usage:
//   npx tsx --env-file=.env.local scripts/clone-sandy-v02-with-text.ts          # dry-run
//   npx tsx --env-file=.env.local scripts/clone-sandy-v02-with-text.ts --commit # apply
//
// What it does:
//   1. Reads v01 LOCKED Sandy asset (25bc0863-ac9a-441d-bfb2-116c858eec80).
//   2. Constructs a new v02 DRAFT row:
//      - same series_id, file_type, slug, drive_path conventions
//      - status = DRAFT
//      - content = full canonical text (synthesised below)
//      - image fields cloned from v01 (staging_path, drive_file_id, drive_*)
//      - metadata.image_prompt cloned from v01 so canon visual prompt persists
//      - metadata.provenance fresh stamp
//   3. Inserts row; logs activity_event.
//
// Idempotent guard: if v02 row already exists, refuses to re-insert.
//
// Safety: dry-run by default. --commit needed.
// ──────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

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
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  } catch {/* ignore */}
}

loadDotenvOverride('.env.local');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SRK) {
  console.error('[clone-sandy] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const commit = process.argv.includes('--commit');
console.log(`[clone-sandy] Mode: ${commit ? 'COMMIT' : 'DRY-RUN'}`);

const V01_ID = '25bc0863-ac9a-441d-bfb2-116c858eec80';
const NEW_FILENAME = 'SS-S14-SBL-character_sandy_hourglass-v02-DRAFT.png';
const NEW_VERSION = 2;

const CANONICAL_TEXT = `# CHARACTER — SANDY (CH_01) — Series Lead

## Identity
Sandy is the silent hero of S14 *Sandy Chronicles*. Living hourglass character —
clear glass body shaped as a classic hourglass silhouette, filled with bright
golden sand that doubles as his life force and emotional indicator.

## Anatomy
- **Body:** clear-glass hourglass silhouette, vertical, mostly symmetrical.
- **Caps:** dark-grey rounded caps top and bottom.
- **Sand:** bright warm golden (\`#F5C842\`), visible inside, redistributes with motion.
- **Eyes:** large joined white cartoon eyes with simple black dot pupils.
- **Mouth:** subtle, expression mainly via eyes + posture.
- **Limbs:** thin flexible dark-grey rubber-hose arms and legs, mitten-style hands.
- **Feet:** rounded, simple footprints, no detailed shoes.

## Style canon
Sandy must always be rendered in **S14 STYLE CANON v1.1**:
- flat 2D, no 3D, no realistic glass reflections
- confident pencil-like outlines (softened near-black, mostly uniform 3–4 px)
- one-step shadow band only, no gradients
- silhouette readable at 25% scale

## Behavioral signature
- Action-first silent comedian — Pink Panther tradition.
- Emotion through silhouette + face + sand redistribution.
- Body deforms (squashes, stretches, sand spills) but identity stays clear.
- Never speaks. Reacts.

## Hard rules
- Never frosted / ghost / fully-translucent variants without explicit episode override.
- Sand colour stays \`#F5C842\` unless gag requires temporary substitution.
- Outline pencil-character, never solid sterile vector.
- Used as base for episode-specific variants (e.g. \`sandy_violet_mist_reaction_variant\`).

## Visual reference
The canonical image for CH_01 is the v01 LOCKED reference (\`SS-S14-SBL-character_sandy_hourglass-v01-LOCKED.png\`).
This v02 DRAFT carries the **full textual canon** that v01 was missing; it
inherits v01's image as its visual anchor. After Director lock, v02 becomes
the canonical Bible entry for Sandy (image + text in one row).

## Episode variants pattern
Episode-specific Sandy variants (e.g. \`sandy_violet_mist_reaction_variant\`,
\`sandy_fogged_glass_variant\`) are NEW assets that REFERENCE this canonical
Sandy — they do NOT replace him. When Phase D Character Identity Model lands,
all such variants will be linked to \`CH_01\` via \`character_canonical_id\`.
`;

const SHORT_DESCRIPTION =
  'CH_01 Sandy / Sandy Hourglass — canonical Bible entry. Living hourglass, clear glass body, bright golden sand, large white cartoon eyes, rubber-hose dark-grey limbs. Flat 2D, pencil outlines per S14 STYLE CANON v1.1. Pink Panther-tradition silent comedy actor.';

interface AssetRow {
  id: string;
  series_id: string | null;
  episode_id: string | null;
  filename: string;
  file_type: string;
  status: string;
  version: number | null;
  description: string | null;
  content: string | null;
  staging_path: string | null;
  drive_file_id: string | null;
  drive_web_view_url: string | null;
  drive_path: string | null;
  metadata: Record<string, unknown> | null;
}

async function main(): Promise<void> {
  const sb = createClient(SUPABASE_URL!, SUPABASE_SRK!, { auth: { persistSession: false } });

  // ── Read v01 source ───────────────────────────────────────────────────────
  console.log('\n[1/4] Reading v01 LOCKED Sandy…');
  const { data: v01raw, error: v01err } = await sb
    .from('assets')
    .select('id, series_id, episode_id, filename, file_type, status, version, description, content, staging_path, drive_file_id, drive_web_view_url, drive_path, metadata')
    .eq('id', V01_ID)
    .maybeSingle();
  if (v01err) throw new Error(`v01 read failed: ${v01err.message}`);
  if (!v01raw) throw new Error('v01 LOCKED Sandy not found');
  const v01 = v01raw as AssetRow;

  console.log(`  source: ${v01.filename} [${v01.status}] v${v01.version ?? '?'}`);
  console.log(`  staging_path: ${v01.staging_path ?? '(none)'}`);
  console.log(`  drive_file_id: ${v01.drive_file_id ?? '(none)'}`);
  console.log(`  series_id: ${v01.series_id}`);
  console.log(`  file_type: ${v01.file_type}`);
  console.log(`  content: ${v01.content ? `${(v01.content as string).length} chars` : '(null — this is what we are fixing)'}`);

  // ── Idempotency: is v02 already there? ────────────────────────────────────
  console.log('\n[2/4] Checking for existing v02 row…');
  const { data: existingRows } = await sb
    .from('assets')
    .select('id, filename, status, version')
    .eq('series_id', v01.series_id!)
    .eq('file_type', v01.file_type)
    .eq('version', NEW_VERSION);

  if (existingRows && existingRows.length > 0) {
    console.log(`  v02 already exists:`);
    for (const r of existingRows as Array<{ id: string; filename: string; status: string; version: number }>) {
      console.log(`    - ${r.filename} [${r.status}] id=${r.id}`);
    }
    console.log('[clone-sandy] Refusing to insert duplicate v02. Exiting.');
    return;
  }
  console.log('  no existing v02 — safe to insert.');

  // ── Construct v02 DRAFT row ───────────────────────────────────────────────
  console.log('\n[3/4] Building v02 DRAFT row…');
  const nowIso = new Date().toISOString();
  const v02 = {
    series_id: v01.series_id,
    episode_id: v01.episode_id,
    filename: NEW_FILENAME,
    file_type: v01.file_type,
    status: 'DRAFT',
    version: NEW_VERSION,
    description: SHORT_DESCRIPTION,
    content: CANONICAL_TEXT,
    staging_path: v01.staging_path,
    drive_file_id: v01.drive_file_id,
    drive_web_view_url: v01.drive_web_view_url,
    drive_path: v01.drive_path,
    metadata: {
      ...(v01.metadata ?? {}),
      provenance: {
        created_by: 'scripts/clone-sandy-v02-with-text.ts',
        created_by_kind: 'admin',
        created_at: nowIso,
        mode_at_time: 1,
        source: 'manual_add',
        notes: 'Cloned image fields from v01 LOCKED + injected canonical Sandy text per Director q1 tactical fix 2026-05-12. Pending Phase D Character Identity Model migration.',
      },
      cloned_from_asset_id: V01_ID,
    },
  };

  console.log(`  filename: ${v02.filename}`);
  console.log(`  status: ${v02.status}`);
  console.log(`  version: ${v02.version}`);
  console.log(`  content: ${CANONICAL_TEXT.length} chars`);
  console.log(`  description: ${SHORT_DESCRIPTION.length} chars`);
  console.log(`  image fields cloned: staging_path=${v02.staging_path ?? '(none)'}`);

  if (!commit) {
    console.log('\n[clone-sandy] DRY-RUN complete. Re-run with --commit to apply.');
    return;
  }

  // ── Insert ─────────────────────────────────────────────────────────────────
  console.log('\n[4/4] Inserting v02 DRAFT…');
  const { data: inserted, error: insErr } = await sb
    .from('assets')
    .insert(v02 as never)
    .select('id, filename, status, version')
    .single();
  if (insErr) throw new Error(`v02 insert failed: ${insErr.message}`);

  const newRow = inserted as { id: string; filename: string; status: string; version: number };
  console.log(`  ✓ v02 inserted: ${newRow.id}`);
  console.log(`    filename: ${newRow.filename}`);
  console.log(`    status:   ${newRow.status}`);
  console.log(`    version:  ${newRow.version}`);

  await sb.from('activity_events').insert({
    event_type: 'asset_updated',
    severity: 'info',
    title: `Sandy v02 DRAFT created with full canonical text`,
    description: `Director q1 tactical fix 2026-05-12. v01 LOCKED kept; v02 DRAFT inherits image + adds canonical text. Director to lock v02 via UI.`,
    asset_id: newRow.id,
    metadata: {
      kind: 'sandy_v02_clone',
      source_asset_id: V01_ID,
      script: 'scripts/clone-sandy-v02-with-text.ts',
    },
  } as never);

  console.log('\n[clone-sandy] COMMIT complete. v02 DRAFT now in Library — Director to review and lock.');
}

main().catch((err) => {
  console.error('[clone-sandy] FATAL:', err);
  process.exit(1);
});
