/**
 * Phase 1 fal.ai probe (2026-05-13).
 *
 * Standalone script — NO production-code changes. Hits fal.ai queue REST
 * directly with fetch, mirrors the veo-gemini.ts pattern so the migration
 * path to a real provider in Phase 2 is obvious.
 *
 * Usage:
 *   FAL_KEY=... npx tsx scripts/test-orbit-fal.ts <model-id> [duration_s]
 *
 * Default model: fal-ai/bytedance/seedance/v1/pro/image-to-video (best
 * camera-instruction follow per my reading; cheapest of the high-tier
 * img2vid models).
 *
 * Alternative model-ids to probe:
 *   fal-ai/kling-video/v2.1/master/image-to-video        (premium, $0.50/5s)
 *   fal-ai/kling-video/v2.1/pro/image-to-video           ($0.30/5s)
 *   fal-ai/minimax/hailuo-02/pro/image-to-video          ($0.30/6s)
 *   fal-ai/bytedance/seedance/v1/pro/image-to-video      (default, $0.20/5s)
 *   fal-ai/luma-dream-machine/image-to-video             ($0.35/5s)
 *
 * If the chosen model-id 404s, fal.ai has renamed it — list current models
 * via `curl -H "Authorization: Key $FAL_KEY" https://fal.run/models` (or
 * https://fal.ai/models in the dashboard).
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

// Minimal manual dotenv — same Windows-friendly pattern used in our other
// CLI scripts. node --env-file does NOT override existing env on Windows.
const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  for (const raw of readFileSync(envPath, 'utf-8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    process.env[line.slice(0, eq).trim()] = val;
  }
}

const FAL_KEY = process.env.FAL_KEY?.trim() ?? process.env.FAL_API_KEY?.trim();
if (!FAL_KEY) {
  console.error('FAL_KEY not set. Add FAL_KEY=<your-key> to webapp/.env.local (get one at https://fal.ai/dashboard/keys).');
  process.exit(2);
}

const MODEL_ID = process.argv[2] ?? 'fal-ai/bytedance/seedance/v1/pro/image-to-video';
const DURATION = Number(process.argv[3] ?? 5);

const EREF_STAGING = '/staging/eref-ss_s14_e20_a2_sc04_sh01_perfume_counter_bar_perfume_madame_sandy-f881c79bd72c.png';

const DEFAULT_PROMPT = [
  '16:9 widescreen composition from the very first frame.',
  'The shot starts on this exact reference frame, then the camera begins a slow orbit to the LEFT around the perfume counter bar interior.',
  'As the camera orbits, more of the location is revealed: the cream-colored side walls, additional shelves of blue-tinted perfume bottles with orange stoppers, the floor tiles, and the warm interior lighting.',
  'Both characters (Sandy the hourglass and Madame the purple perfume bottle) hold their poses in place. Only the camera moves — smooth, cinematic, continuous.',
  'Flat 2D cartoon aesthetic, crisp dark outlines, minimal shading, no text, no logo, no watermark.',
].join(' ');

// Allow each probe to swap the motion intent without editing the script.
// Set PROBE_PROMPT env var (or PROBE_PROMPT_FILE pointing to a UTF-8 text
// file) to override the default orbit prompt. Useful for A/B testing dance,
// pull-back, pan-right, or arbitrary motion descriptions across runs.
function loadPrompt(): string {
  const inline = process.env.PROBE_PROMPT?.trim();
  if (inline) return inline;
  const file = process.env.PROBE_PROMPT_FILE?.trim();
  if (file) {
    const abs = resolve(file);
    if (existsSync(abs)) return readFileSync(abs, 'utf-8').trim();
  }
  return DEFAULT_PROMPT;
}
const PROMPT = loadPrompt();

/** Upload bytes to fal.ai storage; returns a fal-served URL. */
async function falUpload(bytes: Buffer, contentType: string, filename: string): Promise<string> {
  // fal.ai accepts two ways to attach an image:
  //   1) data: URL base64-inline (works for images <few MB)
  //   2) upload to storage, pass URL
  // We use the inline data URL for simplicity — 1.5 MB PNG fits comfortably.
  return `data:${contentType};base64,${bytes.toString('base64')}`;
}

interface QueueSubmitResponse {
  request_id: string;
  status_url?: string;
  response_url?: string;
  cancel_url?: string;
  status?: string;
}

interface QueueStatusResponse {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  request_id?: string;
  response_url?: string;
  logs?: Array<{ message?: string; level?: string }>;
  queue_position?: number;
}

async function main() {
  const erefAbsPath = join(process.cwd(), 'public', EREF_STAGING);
  if (!existsSync(erefAbsPath)) {
    throw new Error(`EREF not found at: ${erefAbsPath}`);
  }
  const pngBytes = readFileSync(erefAbsPath);
  console.log(`[fal-orbit] loaded EREF: ${pngBytes.length} bytes (${EREF_STAGING})`);
  console.log(`[fal-orbit] model: ${MODEL_ID}`);
  console.log(`[fal-orbit] duration: ${DURATION}s`);

  const imageUrl = await falUpload(pngBytes, 'image/png', 'eref.png');

  // Most fal.ai img2vid models accept these common keys; the exact schema
  // varies per model and is documented at https://fal.ai/models/<id>.
  // Seedance / Kling / Hailuo all accept `prompt`, `image_url`, and a
  // duration knob (named slightly differently per model).
  // Seedance 2.0 schema: duration enum "auto"|"4".."15", aspect_ratio enum
  // including "16:9", resolution enum "480p"|"720p"|"1080p", generate_audio
  // boolean (default true, free). For orbit-camera test we kill audio — no
  // need for synthesized ambient noise on a 5s probe.
  const payload: Record<string, unknown> = {
    prompt: PROMPT,
    image_url: imageUrl,
    duration: String(DURATION),
    aspect_ratio: '16:9',
    resolution: '720p',
    generate_audio: false,
  };

  console.log('[fal-orbit] submitting to fal queue …');
  const t0 = Date.now();
  const submitRes = await fetch(`https://queue.fal.run/${MODEL_ID}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Key ${FAL_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  if (!submitRes.ok) {
    const body = (await submitRes.text()).slice(0, 1200);
    throw new Error(`fal submit failed (${submitRes.status}) — ${body}`);
  }
  const submitJson = (await submitRes.json()) as QueueSubmitResponse & Record<string, unknown>;
  console.log('[fal-orbit] queued:', submitJson.request_id);
  console.log('[fal-orbit] submit keys:', Object.keys(submitJson));
  // Surface URLs returned by fal — they're authoritative.
  if (submitJson.status_url) console.log('[fal-orbit]   status_url:', submitJson.status_url);
  if (submitJson.response_url) console.log('[fal-orbit]   response_url:', submitJson.response_url);

  // fal REST quirk: submit goes to the FULL slug, but status/result URLs
  // are returned by fal as parent-truncated paths (e.g. submit to
  // `bytedance/seedance-2.0/image-to-video`, fal returns
  // `bytedance/seedance-2.0/requests/.../status`). The Python fal_client SDK
  // hides this by mapping internally; in raw REST we just use what fal
  // returns. Fallback to full-slug-built URLs only if fal didn't return them.
  const statusUrl =
    (submitJson.status_url as string | undefined) ??
    `https://queue.fal.run/${MODEL_ID}/requests/${submitJson.request_id}/status`;
  const resultUrl =
    (submitJson.response_url as string | undefined) ??
    `https://queue.fal.run/${MODEL_ID}/requests/${submitJson.request_id}`;

  let lastStatusJson: QueueStatusResponse & Record<string, unknown> = { status: 'IN_QUEUE' };
  let status: QueueStatusResponse['status'] = 'IN_QUEUE';
  while (status === 'IN_QUEUE' || status === 'IN_PROGRESS') {
    await new Promise((r) => setTimeout(r, 4000));
    const sres = await fetch(statusUrl, { headers: { Authorization: `Key ${FAL_KEY}` } });
    if (!sres.ok) {
      const body = (await sres.text()).slice(0, 600);
      throw new Error(`status poll failed (${sres.status}) — ${body}`);
    }
    lastStatusJson = (await sres.json()) as QueueStatusResponse & Record<string, unknown>;
    status = lastStatusJson.status;
    const last = lastStatusJson.logs?.slice(-1)[0]?.message ?? '';
    console.log(`[fal-orbit] status=${status} pos=${lastStatusJson.queue_position ?? '-'} ${last ? `· ${last.slice(0, 120)}` : ''}`);
  }

  if (status !== 'COMPLETED') {
    console.error('[fal-orbit] terminal status payload:', JSON.stringify(lastStatusJson).slice(0, 1500));
    throw new Error(`fal request terminated with status=${status}`);
  }

  // Some fal models return the full result inline in the COMPLETED status
  // payload; others require a separate GET. Try inline first.
  // The terminal status JSON shape varies — sometimes the result lives at
  // .response, sometimes the top level already has video.url.
  type AnyResult = { video?: { url?: string }; videos?: Array<{ url?: string }>; response?: Record<string, unknown>; [k: string]: unknown };
  function extractVideoUrl(obj: AnyResult | undefined | null): string | null {
    if (!obj) return null;
    if (obj.video?.url) return obj.video.url;
    if (Array.isArray(obj.videos) && obj.videos[0]?.url) return obj.videos[0]!.url!;
    if (obj.response) return extractVideoUrl(obj.response as AnyResult);
    return null;
  }

  let result: AnyResult | null = lastStatusJson as unknown as AnyResult;
  let videoUrl = extractVideoUrl(result);
  console.log('[fal-orbit] inline result has video.url?', !!videoUrl);
  console.log('[fal-orbit] status keys:', Object.keys(lastStatusJson));

  if (!videoUrl) {
    console.log(`[fal-orbit] fetching result via: ${resultUrl}`);
    const fres = await fetch(resultUrl, { headers: { Authorization: `Key ${FAL_KEY}` } });
    if (!fres.ok) {
      const body = (await fres.text()).slice(0, 1200);
      throw new Error(`fal result fetch failed (${fres.status}) — ${body}`);
    }
    result = (await fres.json()) as AnyResult;
    videoUrl = extractVideoUrl(result);
  }

  if (!videoUrl) {
    console.error('[fal-orbit] result keys:', Object.keys(result ?? {}));
    console.error('[fal-orbit] raw result:', JSON.stringify(result).slice(0, 1500));
    throw new Error('fal result missing video.url — schema mismatch, check model docs');
  }

  console.log(`[fal-orbit] video URL: ${videoUrl}`);
  const vres = await fetch(videoUrl);
  if (!vres.ok) throw new Error(`video download failed: ${vres.status}`);
  const mp4 = Buffer.from(await vres.arrayBuffer());

  const stagingDir = join(process.cwd(), 'public', 'staging');
  mkdirSync(stagingDir, { recursive: true });
  const ts = Date.now();
  const safeModel = MODEL_ID.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const outName = `test-orbit-fal-${safeModel}-${ts}.mp4`;
  const outPath = join(stagingDir, outName);
  writeFileSync(outPath, mp4);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[fal-orbit] DONE in ${elapsed}s — ${mp4.length} bytes`);
  console.log(`[fal-orbit] saved: ${outPath}`);
  console.log(`[fal-orbit] browser URL: http://localhost:3000/staging/${outName}`);
  console.log(`[fal-orbit] OUT_NAME=${outName}`);
}

main().catch((e) => {
  console.error('[fal-orbit] FAILED:', e);
  process.exit(1);
});
