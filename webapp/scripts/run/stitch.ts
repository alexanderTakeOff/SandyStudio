// Direct-call assembly for the clean run: concatenates the shot clips in order,
// normalises them to one encode, and appends a short black tail.
//
// Tool work, not generation (doctrine §16): cuts, timings and the black tail are
// transformations of already-accepted material, so they cost $0 and are exact.
//
//   npx tsx scripts/run/stitch.ts --dir ../FILMS/_run/e35/clips \
//     --order sh01,sh02,sh03,sh04,sh05,sh06 \
//     --out ../FILMS/_run/e35/SS-S15-E35-cut-v01.mp4 [--tail 1.0]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`missing --${name}`);
}

function ff(args: string[]): void {
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
}

function durationOf(file: string): number {
  const out = execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file,
  ], { encoding: 'utf8' });
  return Number(out.trim());
}

async function main() {
  const dir = resolve(process.cwd(), arg('dir'));
  const order = arg('order').split(',').map((s) => s.trim()).filter(Boolean);
  const out = resolve(process.cwd(), arg('out'));
  const tail = Number(arg('tail', '1.0'));

  const parts: string[] = [];
  for (const name of order) {
    const p = join(dir, `${name}.mp4`);
    if (!existsSync(p)) throw new Error(`missing clip: ${p}`);
    parts.push(p);
    console.log(`${name}: ${durationOf(p).toFixed(1)}s`);
  }

  const work = join(dir, '_work');
  mkdirSync(work, { recursive: true });

  // Black tail, built to match the clips' geometry and frame rate exactly.
  const tailPath = join(work, 'tail.mp4');
  ff([
    '-f', 'lavfi', '-i', `color=c=black:s=720x1280:r=24:d=${tail}`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', tailPath,
  ]);
  parts.push(tailPath);

  const listPath = join(work, 'list.txt');
  writeFileSync(listPath, parts.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'));

  mkdirSync(dirname(out), { recursive: true });
  // Re-encode rather than stream-copy: the clips come back from the provider with
  // their own headers, and a copy-concat of mismatched streams produces a file that
  // plays for some players and not others — a silent defect on delivery.
  ff([
    '-f', 'concat', '-safe', '0', '-i', listPath,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19',
    '-pix_fmt', 'yuv420p', '-r', '24', '-an', out,
  ]);

  rmSync(work, { recursive: true, force: true });
  console.log(`OK ${out}`);
  console.log(`total ${durationOf(out).toFixed(1)}s`);
}

main().catch((e) => {
  console.error('ERROR', e?.message ?? e);
  process.exit(1);
});
