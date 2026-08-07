// ──────────────────────────────────────────────────────────────────────────────
// scripts/test-image-provider.ts
// Bypass Inngest. Bypass agents. Just: env key → real OpenAI Images API →
// save PNG to public/staging/ → print browser URL.
//
// Run:
//   npm run test-image
//   npm run test-image -- "your prompt here"
//
// Verifies the env key works, the adapter works, and the binary persistence
// pipeline works — without needing a running Next.js / Inngest / Supabase.
// ──────────────────────────────────────────────────────────────────────────────

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { generateImageOpenAI } from '../lib/providers/openai-image';

const DEFAULT_PROMPT =
  'YouTube thumbnail for an animated comedy short. Style: stylised 2D animation, vibrant colours, dynamic composition, comedy art direction, 16:9 framing, high contrast. No text.';

async function main(): Promise<void> {
  const prompt = process.argv[2] ?? DEFAULT_PROMPT;

  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.error('OPENAI_API_KEY is not set in env. Add it to webapp/.env.local.');
    process.exit(1);
  }

  console.log(`[test-image] prompt: "${prompt.slice(0, 80)}${prompt.length > 80 ? '…' : ''}"`);
  console.log(`[test-image] calling gpt-image-1 (size=1536x1024, quality=low for cheap proof)…`);

  const startedAt = Date.now();
  const result = await generateImageOpenAI({
    prompt,
    size: '1536x1024',
    quality: 'low',
  });
  const elapsed = Date.now() - startedAt;

  const stagingDir = path.join(process.cwd(), 'public', 'staging');
  await fs.mkdir(stagingDir, { recursive: true });
  const filename = `test-${Date.now()}.png`;
  const fullPath = path.join(stagingDir, filename);
  await fs.writeFile(fullPath, Buffer.from(result.b64_data, 'base64'));

  console.log('');
  console.log('─── RESULT ───');
  console.log(`provider:        ${result.provider}`);
  console.log(`format/size:     ${result.format} ${result.width}×${result.height}`);
  console.log(`bytes:           ${result.size_bytes.toLocaleString()}`);
  console.log(`cost (est):      $${result.cost_usd.toFixed(4)}`);
  console.log(`elapsed:         ${(elapsed / 1000).toFixed(1)}s`);
  if (result.revised_prompt) {
    console.log(`revised prompt:  ${result.revised_prompt.slice(0, 120)}…`);
  }
  console.log('');
  console.log(`saved:           ${fullPath}`);
  console.log(`browser URL:     http://localhost:3000/staging/${filename}`);
  console.log('');
  console.log('Open the URL above in a browser (npm run dev must be running).');
}

main().catch((err) => {
  console.error(`[test-image] FAILED: ${(err as Error).message}`);
  if ((err as { body?: string }).body) {
    console.error(`  response body: ${(err as { body: string }).body}`);
  }
  process.exit(1);
});
