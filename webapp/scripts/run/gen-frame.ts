// Direct-call frame generator for the clean run (path C: thin layer over the
// existing storage — provider + media cache + ledger reused, agent layer NOT
// called). One frame per invocation, prompt read from a file so long prompts
// survive the shell.
//
//   npx tsx scripts/run/gen-frame.ts \
//     --prompt-file docs/.../sh01.txt \
//     --refs "style_s15_style_canon_2d_v1:style,character_sandy_hourglass:identity" \
//     --out FILMS/_run/e35/sh01.png [--size 1024x1536] [--quality high]
//
// Prints the produced file and the cost, and writes the cost to `budget_log`
// so the run's money instrument stays honest.
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { sb, S15 } from './_env';
import { openAIEditsMultiProvider } from '../../lib/agents/providers/openai-edits-multi';
import { readAssetMediaAsBase64 } from '../../lib/media-cache';
import type { MultiImageRef, MultiImageRefKind } from '../../lib/agents/providers/image-gen-multi';

const EPISODE_ID = '9ec4366e-96fa-4324-8de1-89bec5914f80'; // SS-S15-E35

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`missing --${name}`);
}

/** gpt-image-2 medium/high pricing per image at 1024x1536 (OpenAI list). */
const COST_USD: Record<string, number> = { low: 0.016, medium: 0.063, high: 0.25 };

async function main() {
  const promptFile = arg('prompt-file');
  const refSpec = arg('refs');
  const out = arg('out');
  const size = arg('size', '1024x1536') as '1024x1536' | '1024x1024' | '1536x1024';
  const quality = arg('quality', 'high') as 'low' | 'medium' | 'high';

  const prompt = readFileSync(resolve(process.cwd(), promptFile), 'utf8').trim();

  const references: MultiImageRef[] = [];
  for (const item of refSpec.split(',').map((s) => s.trim()).filter(Boolean)) {
    const [slug, kindRaw] = item.split(':');
    const kind = (kindRaw ?? 'identity') as MultiImageRefKind;
    const { data: asset, error } = await sb
      .from('assets')
      .select('id,filename,drive_file_id,staging_path,file_type')
      .eq('series_id', S15)
      .eq('file_type', `SBL-${slug}`)
      .maybeSingle();
    if (error) throw new Error(`ref ${slug}: ${error.message}`);
    if (!asset) throw new Error(`ref ${slug}: no canon asset SBL-${slug} in S15`);
    const image_b64 = await readAssetMediaAsBase64({
      filename: asset.filename,
      driveFileId: asset.drive_file_id,
      stagingPath: asset.staging_path,
    });
    if (!image_b64) throw new Error(`ref ${slug}: canon asset has no image on disk/Drive`);
    references.push({ kind, bible_asset_id: asset.id, image_b64 });
    console.log(`ref ok: ${slug} (${kind}) ${Math.round(image_b64.length / 1365)}KB`);
  }

  // Self-imposed budget was 5; the queue-nod shot needs the whole cast in one
  // frame (Director, 2026-08-01), so the cap follows the story, not the habit.
  // Provider hard ceiling is 16.
  if (references.length > 8) {
    throw new Error(`self-imposed budget is 8 refs per frame; got ${references.length}`);
  }

  // REF-ORDER CONTRACT (TD-53, episode-references.ts): the provider treats
  // earlier references as higher priority, so LOCATION must come first (it is
  // the canonical layout), then identities, then style, then continuity. The
  // clean run sent style first and the fifth identity came back off-canon —
  // enforce the order here instead of relying on the caller's spelling.
  const ORDER: Record<string, number> = {
    location: 0, identity: 1, style: 2, object: 3,
    scene_continuity: 4, temporal_continuity: 5,
  };
  references.sort((a, b) => (ORDER[a.kind] ?? 9) - (ORDER[b.kind] ?? 9));
  console.log('ref order:', references.map((r) => r.kind).join(' → '));

  console.log(`generating ${out} — ${references.length} refs, ${size}, ${quality}`);
  const t0 = Date.now();
  const res = await openAIEditsMultiProvider.generate({ prompt, references, size, quality });
  const ms = Date.now() - t0;

  // The provider returns `b64_data`/`cost_usd` and THROWS on failure — there is
  // no `status` field. Reading a non-existent field threw away two paid images
  // on 2026-08-01 (D40): the call succeeded, the artifact was discarded. Never
  // gate an artifact on a field you have not read from the type.
  if (!res.b64_data) {
    console.error('NO IMAGE in a successful response:', JSON.stringify(res).slice(0, 400));
    process.exit(1);
  }

  const abs = resolve(process.cwd(), out);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, Buffer.from(res.b64_data, 'base64'));

  const cost = res.cost_usd ?? COST_USD[quality] ?? 0;
  // `job_id` is FK-bound to `jobs` — a direct call has no job row, so it goes in
  // NULL (D41). And the insert error is CHECKED: the first version ignored it
  // and the ledger stayed silently empty while money was being spent.
  const { error: ledgerErr } = await sb.from('budget_log').insert({
    job_id: null,
    episode_id: EPISODE_ID,
    agent_id: 'DIRECT-RUN',
    api_provider: 'openai',
    model_or_tier: `gpt-image-2/${quality}/${size}`,
    operation: `frame:${out.split(/[\\/]/).pop()}`,
    cost_usd: cost,
    duration_ms: ms,
  });

  if (ledgerErr) {
    console.error(`LEDGER FAILED (money spent, not recorded): ${ledgerErr.message}`);
    process.exit(2);
  }

  console.log(`OK ${abs}`);
  console.log(`cost $${cost.toFixed(3)} · ${(ms / 1000).toFixed(1)}s · ledger ok`);
}

main().catch((e) => {
  console.error('ERROR', e?.message ?? e);
  process.exit(1);
});
