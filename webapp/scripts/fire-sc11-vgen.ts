// One-off: fire VGEN single-shot for SC11-SH01 and SC11-SH02 via Inngest dev.
// Use Standard tier (8s forced for img2vid Standard — see runner.ts patch).
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

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

const INNGEST = process.env.INNGEST_DEV_URL ?? 'http://localhost:8288';
const EP = '763c5c1e-44dc-4e10-92fb-e7671e5d4a44';
const SHOTS = ['SS-S14-E20-A3-SC11-SH01', 'SS-S14-E20-A3-SC11-SH02'];

async function main() {
  const write = process.argv.includes('--write');
  for (const shotId of SHOTS) {
    if (!write) {
      console.log(`DRY: would fire ${shotId} standard`);
      continue;
    }
    const res = await fetch(`${INNGEST}/e/devkey`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'sandystudio/exec-vgen/single-shot',
        data: {
          episodeId: EP,
          shotId,
          quality_tier: 'standard',
        },
      }),
    });
    console.log(`${shotId} → HTTP ${res.status}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
