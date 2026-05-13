/**
 * Smoke test 2026-05-13 — Veo 3.1 Standard img2vid orbit-camera test.
 *
 * Goal: take a 1:1 EREF (La Frontera prilavok with Madame + Sandy), generate
 * a 16:9 video where camera does a slow orbit-left, revealing more of the
 * surrounding location (walls, shelves, room), not just the counter.
 *
 * Cost: 0.15 USD/s × 8s = $1.20.
 * Run: `cd webapp && npx tsx scripts/test-orbit-img2vid.ts`
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

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

import { generateVideoVeoGemini } from '@/lib/agents/providers/veo-gemini';

const EREF_STAGING = '/staging/eref-ss_s14_e20_a2_sc04_sh01_perfume_counter_bar_perfume_madame_sandy-f881c79bd72c.png';

async function main() {
  const erefAbsPath = join(process.cwd(), 'public', EREF_STAGING);
  if (!existsSync(erefAbsPath)) {
    throw new Error(`EREF not found at: ${erefAbsPath}`);
  }
  const pngBytes = readFileSync(erefAbsPath);
  console.log(`[orbit-test] loaded EREF: ${pngBytes.length} bytes`);

  // Orbit-left + reveal prompt. Key phrasings:
  //  - "slow orbit-left" — explicit camera move direction.
  //  - "reframe to 16:9 widescreen from the very first frame" — defeats Veo's
  //    1:1→16:9 mid-shot expand bug observed earlier this session.
  //  - "reveal the rest of the perfume counter bar interior" — tells Veo it
  //    has license to invent the surrounding location (left/right walls,
  //    shelves, ceiling) rather than just zoom on the counter.
  //  - "characters hold their pose" — anchors Madame + Sandy as static
  //    subjects; only the camera moves.
  const prompt = [
    '16:9 widescreen composition from the very first frame.',
    'The shot starts on this exact reference frame, then the camera begins a slow orbit to the LEFT around the perfume counter bar interior.',
    'As the camera orbits, more of the location is revealed: the cream-colored side walls, additional shelves of blue-tinted perfume bottles with orange stoppers, the floor tiles, and the warm interior lighting.',
    'Both characters (Sandy the hourglass and Madame the purple perfume bottle) hold their poses in place. Only the camera moves — smooth, cinematic, continuous.',
    'Flat 2D cartoon aesthetic, crisp dark outlines, minimal shading, no text, no logo, no watermark.',
  ].join(' ');

  console.log('[orbit-test] prompt:', prompt);
  console.log('[orbit-test] firing Veo 3.1 Standard, 8s, 16:9 img2vid …');
  const t0 = Date.now();
  const res = await generateVideoVeoGemini({
    prompt,
    referenceImageBase64: pngBytes.toString('base64'),
    referenceImageMime: 'image/png',
    quality: 'standard',
    aspectRatio: '16:9',
    durationSeconds: 8,
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[orbit-test] success in ${elapsed}s — cost $${res.cost_usd.toFixed(2)}, ${res.size_bytes} bytes`);

  const stagingDir = join(process.cwd(), 'public', 'staging');
  mkdirSync(stagingDir, { recursive: true });
  const ts = Date.now();
  const outName = `test-orbit-sc04-${ts}.mp4`;
  const outPath = join(stagingDir, outName);
  writeFileSync(outPath, Buffer.from(res.mp4_b64, 'base64'));
  console.log(`[orbit-test] wrote ${outPath}`);
  console.log(`[orbit-test] browser URL: http://localhost:3000/staging/${outName}`);
  console.log(`[orbit-test] OUT_NAME=${outName}`);
}

main().catch((e) => {
  console.error('[orbit-test] FAILED:', e);
  process.exit(1);
});
