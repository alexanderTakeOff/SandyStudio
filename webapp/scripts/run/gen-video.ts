// Direct-call shot renderer for the clean run: pads the reference frame to a true
// 9:16 with its own wall colour, then submits image-to-video to Seedance.
//
// WHY THE PAD (seedance-prompting rule 6): the render aspect and the reference
// aspect MUST match. Our frames come out 1024×1536 (2:3) because `clampSize()`
// pins the three legacy gpt-image-1 sizes (D39), while delivery is 9:16. Feeding
// a 2:3 still into a 9:16 render makes Seedance crop and recompose — content loss
// plus identity drift. Padding costs $0 and happens in ffmpeg: the top of every
// frame in this episode is bare wall, so extending it is invisible.
//
//   npx tsx scripts/run/gen-video.ts \
//     --frame ../FILMS/_run/e35/frames/sh01-v02.png \
//     --prompt-file ../FILMS/_run/e35/prompts/sh01.video.txt \
//     --out ../FILMS/_run/e35/clips/sh01.mp4 --duration 10 [--seed 1234] [--tier fast]
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { sb } from './_env';
import { generateVideoFalSeedance } from '../../lib/agents/providers/fal-seedance';

// Episode comes from the environment, never hardcoded: a stale id bills the wrong
// episode silently (2026-08-04 stocktake).
const EPISODE_ID = process.env.RUN_EPISODE_ID;
if (!EPISODE_ID) {
  console.error('RUN_EPISODE_ID is not set — refusing to bill an unknown episode.');
  process.exit(1);
}

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`missing --${name}`);
}

/** Sample one pixel well inside the wall area and return it as ffmpeg 0xRRGGBB. */
function wallColour(src: string): string {
  const raw = execFileSync(
    'ffmpeg',
    ['-v', 'error', '-i', src, '-vf', 'crop=1:1:8:8', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
    { maxBuffer: 1024 },
  );
  return `0x${raw.subarray(0, 3).toString('hex')}`;
}

/** Pad a 1024×1536 frame up to 1024×1820 (9:16) by extending the bare wall on top. */
function padTo916(src: string, dst: string): void {
  const colour = wallColour(src);
  execFileSync('ffmpeg', [
    '-v', 'error', '-y', '-i', src,
    '-vf', `pad=1024:1820:0:284:color=${colour}`,
    dst,
  ]);
}

async function main() {
  const frame = arg('frame');
  const promptFile = arg('prompt-file');
  const out = arg('out');
  const duration = Number(arg('duration', '10'));
  const tier = arg('tier', 'standard') as 'standard' | 'fast';
  const seedRaw = arg('seed', '');
  const seed = seedRaw ? Number(seedRaw) : undefined;

  const srcAbs = resolve(process.cwd(), frame);
  if (!existsSync(srcAbs)) throw new Error(`frame not found: ${srcAbs}`);
  const paddedAbs = srcAbs.replace(/\.png$/, '.916.png');
  padTo916(srcAbs, paddedAbs);
  console.log(`padded → ${paddedAbs}`);

  const prompt = readFileSync(resolve(process.cwd(), promptFile), 'utf8').trim();

  const t0 = Date.now();
  const res = await generateVideoFalSeedance({
    prompt,
    durationSeconds: duration,
    aspectRatio: '9:16',
    resolution: '720p',
    quality: tier,
    referenceImageBase64: readFileSync(paddedAbs).toString('base64'),
    referenceImageMime: 'image/png',
    seed,
  });
  const ms = Date.now() - t0;

  if (!res.mp4_b64) {
    console.error('NO VIDEO in a successful response:', JSON.stringify(res).slice(0, 400));
    process.exit(1);
  }

  const abs = resolve(process.cwd(), out);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, Buffer.from(res.mp4_b64, 'base64'));

  const { error: ledgerErr } = await sb.from('budget_log').insert({
    job_id: null,
    episode_id: EPISODE_ID,
    agent_id: 'DIRECT-RUN',
    api_provider: 'fal',
    model_or_tier: `${res.model_id}/${tier}/720p/9:16`,
    operation: `clip:${out.split(/[\\/]/).pop()}`,
    cost_usd: res.cost_usd,
    duration_ms: ms,
  });
  if (ledgerErr) {
    console.error(`LEDGER FAILED (money spent, not recorded): ${ledgerErr.message}`);
    process.exit(2);
  }

  console.log(`OK ${abs}`);
  console.log(
    `cost $${res.cost_usd.toFixed(2)} · ${(ms / 1000).toFixed(0)}s · ${res.width}x${res.height} · ${res.duration_seconds}s · ledger ok`,
  );
}

main().catch((e) => {
  console.error('ERROR', e?.message ?? e);
  process.exit(1);
});
