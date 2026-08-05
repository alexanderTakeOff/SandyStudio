// Direct-call assembly for the clean run: concatenates the shot clips in order,
// normalises them to one encode, and appends a short black tail.
//
// Tool work, not generation (doctrine §16): cuts, timings and the black tail are
// transformations of already-accepted material, so they cost $0 and are exact.
// Contract: `--help`.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { defineTool } from './_tool';

function ff(args: string[]): void {
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
}

function durationOf(file: string): number {
  const out = execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file,
  ], { encoding: 'utf8' });
  return Number(out.trim());
}

export default defineTool(
  {
    name: 'stitch',
    summary: 'Собирает кат: клипы по порядку, один энкод на всех, короткий чёрный хвост. $0.',
    args: {
      dir: { about: 'папка с клипами; каждый файл — `<имя>.mp4`' },
      order: { about: 'порядок клипов через запятую, без расширения: `sh01,sh02,...`' },
      out: { about: 'куда положить кат' },
      tail: { about: 'длина чёрного хвоста в секундах', default: '1.0' },
    },
  },
  async ({ arg }) => {
    const dir = resolve(process.cwd(), arg('dir'));
    const order = arg('order').split(',').map((s) => s.trim()).filter(Boolean);
    const out = resolve(process.cwd(), arg('out'));
    const tail = Number(arg('tail'));

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
  },
);
