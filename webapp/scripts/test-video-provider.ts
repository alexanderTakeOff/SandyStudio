// ──────────────────────────────────────────────────────────────────────────────
// scripts/test-video-provider.ts
// Bypass Inngest. Bypass agents. Just: GEMINI_API_KEY → Veo 3 → save MP4 to
// public/staging/ → print browser URL.
//
// Run:
//   npm run test-video                                  (default 5s, fast quality)
//   npm run test-video -- "your prompt here"
//   npm run test-video -- "..." --duration 8 --quality standard
//
// Veo 3 generation typically takes 60–180 seconds. Cost (estimated):
//   fast      $0.075/s — 5s ≈ $0.38
//   standard  $0.15/s  — 5s ≈ $0.75
// ──────────────────────────────────────────────────────────────────────────────

import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  generateVideoVeoGemini,
  type VeoQualityTier,
} from '../lib/agents/providers/veo-gemini';

function parseArgs(argv: string[]): {
  prompt: string;
  duration: number;
  quality: VeoQualityTier;
} {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = 'true';
      }
    } else {
      positional.push(a);
    }
  }
  return {
    prompt:
      positional[0] ??
      'A brass robot inspector tiptoes across a glossy red carpet at night, comedic spotlights flash, vibrant 2D animation style, dynamic camera, no text.',
    duration: Number.parseInt(flags.duration ?? '5', 10),
    quality: (flags.quality as VeoQualityTier) ?? 'fast',
  };
}

async function main(): Promise<void> {
  const { prompt, duration, quality } = parseArgs(process.argv.slice(2));

  if (!process.env.GEMINI_API_KEY?.trim()) {
    console.error('GEMINI_API_KEY is not set in env. Add it to webapp/.env.local.');
    process.exit(1);
  }

  console.log(`[test-video] prompt: "${prompt.slice(0, 80)}${prompt.length > 80 ? '…' : ''}"`);
  console.log(`[test-video] calling Veo 3 (quality=${quality}, duration=${duration}s, 16:9)…`);
  console.log(`[test-video] expected wait ~60–180s. polling every 5s.`);

  const startedAt = Date.now();
  const result = await generateVideoVeoGemini({
    prompt,
    durationSeconds: duration,
    aspectRatio: '16:9',
    quality,
  });
  const elapsed = Date.now() - startedAt;

  const stagingDir = path.join(process.cwd(), 'public', 'staging');
  await fs.mkdir(stagingDir, { recursive: true });
  const filename = `veo-${Date.now()}.mp4`;
  const fullPath = path.join(stagingDir, filename);
  await fs.writeFile(fullPath, Buffer.from(result.mp4_b64, 'base64'));

  console.log('');
  console.log('─── RESULT ───');
  console.log(`provider:        ${result.provider}`);
  console.log(`format/size:     ${result.format} ${result.width}×${result.height} @ ${result.duration_seconds}s`);
  console.log(`bytes:           ${result.size_bytes.toLocaleString()}`);
  console.log(`cost (est):      $${result.cost_usd.toFixed(4)}`);
  console.log(`elapsed:         ${(elapsed / 1000).toFixed(1)}s`);
  console.log(`operation:       ${result.operation_name}`);
  console.log('');
  console.log(`saved:           ${fullPath}`);
  console.log(`browser URL:     http://localhost:3000/staging/${filename}`);
  console.log('');
  console.log('Open the URL above in a browser (npm run dev must be running).');
}

main().catch((err) => {
  console.error(`[test-video] FAILED: ${(err as Error).message}`);
  if ((err as { body?: string | null }).body) {
    console.error(`  response body: ${(err as { body: string }).body}`);
  }
  process.exit(1);
});
