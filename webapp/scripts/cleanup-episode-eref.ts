// ──────────────────────────────────────────────────────────────────────────────
// scripts/cleanup-episode-eref.ts
// One-off cleanup: delete all IMG-episode_ref_* assets for an episode AND
// trash their backing Drive files (canonical + every generation_history entry).
//
// Built for the EREF v2 architecture rollout (2026-05-05): before applying
// migration 0024 + running the new pilot/fanout flow, wipe the residual
// candidates from yesterday's racing run + this morning's slow run so the
// drawer's candidates strip stays readable.
//
// Usage:
//   npx tsx --env-file=.env.local scripts/cleanup-episode-eref.ts <episode_id> [--yes] [--permanent]
//
// Flags:
//   --yes        Skip the interactive confirmation. Required for unattended runs.
//   --permanent  Permanently delete Drive files (irreversible). Default = trash
//                (soft delete, recoverable for 30 days from Drive Trash).
//
// What it does:
//   1. Lists every asset row with file_type LIKE 'IMG-episode_ref%' for the
//      given episode (any status — REVIEW / APPROVED / REJECTED / etc).
//   2. Walks asset.drive_file_id PLUS every generation_history[].drive_file_id
//      so retried/upscaled images don't leak.
//   3. Trashes (or permanently deletes) each Drive file. Drive 404s are ignored
//      — file already gone.
//   4. DELETEs the asset rows.
//
// Safety:
//   - Confirms before destructive action unless --yes is passed.
//   - Soft-trash is the default — 30-day recovery window in Drive Trash.
//   - Idempotent: running twice on the same episode is harmless (second run
//     finds nothing to clean up).
// ──────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { getGoogleAccessToken } from '../lib/agents/providers/google-auth';

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
    // ignore
  }
}
loadDotenvOverride('.env.local');

const DRIVE_API = 'https://www.googleapis.com/drive/v3';

interface GenerationHistoryEntry {
  drive_file_id?: string | null;
  version?: number;
  triggered_by?: string;
}

interface ShotReference {
  generation_history?: GenerationHistoryEntry[];
}

interface AssetMetadata {
  shot_reference?: ShotReference;
}

interface AssetRow {
  id: string;
  filename: string;
  file_type: string;
  status: string;
  drive_file_id: string | null;
  metadata: AssetMetadata | null;
}

async function trashDriveFile(fileId: string, permanent: boolean): Promise<'ok' | 'gone'> {
  const token = await getGoogleAccessToken();
  if (permanent) {
    const res = await fetch(`${DRIVE_API}/files/${fileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 404) return 'gone';
    if (!res.ok) {
      throw new Error(`Drive permanent delete failed (${res.status}): ${await res.text()}`);
    }
    return 'ok';
  }
  const res = await fetch(`${DRIVE_API}/files/${fileId}?supportsAllDrives=true`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ trashed: true }),
  });
  if (res.status === 404) return 'gone';
  if (!res.ok) {
    throw new Error(`Drive trash PATCH failed (${res.status}): ${await res.text()}`);
  }
  return 'ok';
}

async function confirm(message: string): Promise<boolean> {
  const rl = createInterface({ input, output });
  try {
    const ans = (await rl.question(`${message} [y/N]: `)).trim().toLowerCase();
    return ans === 'y' || ans === 'yes';
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const positional = argv.filter((a) => !a.startsWith('--'));
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const episodeId = positional[0];
  const skipConfirm = flags.has('--yes');
  const permanent = flags.has('--permanent');

  if (!episodeId) {
    console.error('Usage: cleanup-episode-eref.ts <episode_id> [--yes] [--permanent]');
    process.exit(1);
  }

  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sbUrl || !sbKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
    process.exit(1);
  }
  const sb = createClient(sbUrl, sbKey, { auth: { persistSession: false } });

  // Fetch episode metadata for context (best-effort).
  const { data: ep } = await sb
    .from('episodes')
    .select('id, code, title')
    .eq('id', episodeId)
    .maybeSingle();
  const epLabel = ep ? `${ep.code ?? ''} — ${ep.title ?? '(untitled)'}` : '(unknown episode)';

  // List all EREF assets for the episode.
  const { data: assets, error: listErr } = await sb
    .from('assets')
    .select('id, filename, file_type, status, drive_file_id, metadata')
    .eq('episode_id', episodeId)
    .like('file_type', 'IMG-episode_ref%');
  if (listErr) {
    console.error('Failed to list assets:', listErr.message);
    process.exit(1);
  }
  const rows = (assets ?? []) as AssetRow[];

  if (rows.length === 0) {
    console.log(`Episode ${episodeId} (${epLabel}) — no IMG-episode_ref assets found. Nothing to do.`);
    return;
  }

  // Collect every Drive file id (canonical + every history attempt).
  const driveIds = new Set<string>();
  for (const a of rows) {
    if (a.drive_file_id) driveIds.add(a.drive_file_id);
    const history = a.metadata?.shot_reference?.generation_history;
    if (Array.isArray(history)) {
      for (const h of history) {
        if (h.drive_file_id) driveIds.add(h.drive_file_id);
      }
    }
  }

  // Plan summary.
  console.log(`Episode: ${episodeId} (${epLabel})`);
  console.log(`Asset rows to delete:    ${rows.length}`);
  console.log(`Drive files to ${permanent ? 'PERMANENTLY DELETE' : 'trash (recoverable 30d)'}: ${driveIds.size}`);
  if (rows.length > 0) {
    console.log('Sample assets:');
    for (const a of rows.slice(0, 5)) {
      console.log(`  - ${a.filename} (${a.status})`);
    }
    if (rows.length > 5) console.log(`  …and ${rows.length - 5} more`);
  }

  if (!skipConfirm) {
    const ok = await confirm(
      permanent
        ? 'Confirm PERMANENT deletion (irreversible)?'
        : 'Confirm cleanup (Drive trash + DB delete)?',
    );
    if (!ok) {
      console.log('Aborted.');
      return;
    }
  }

  // Trash Drive files first — if Drive fails on some, we still know what was
  // attempted; running again is idempotent.
  let trashed = 0;
  let alreadyGone = 0;
  let driveErrors = 0;
  for (const fileId of driveIds) {
    try {
      const res = await trashDriveFile(fileId, permanent);
      if (res === 'ok') trashed++;
      else alreadyGone++;
    } catch (err) {
      driveErrors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ! Drive ${permanent ? 'delete' : 'trash'} failed for ${fileId}: ${msg}`);
    }
  }

  // Delete asset rows.
  const ids = rows.map((r) => r.id);
  const { error: delErr, count } = await sb
    .from('assets')
    .delete({ count: 'exact' })
    .in('id', ids);
  if (delErr) {
    console.error('DB delete failed:', delErr.message);
    process.exit(1);
  }

  console.log('---');
  console.log(`Drive ${permanent ? 'permanently deleted' : 'trashed'}: ${trashed}`);
  console.log(`Drive already gone (404):  ${alreadyGone}`);
  console.log(`Drive errors:              ${driveErrors}`);
  console.log(`DB rows deleted:           ${count ?? ids.length}`);
  console.log('Done.');
}

main().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
