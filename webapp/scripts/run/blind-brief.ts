// Build the input packet for a BLIND acceptance pass.
//
//   npx tsx scripts/run/blind-brief.ts \
//     --spec ../docs/plans/forward-run-expectations-e36.md \
//     --shots ../FILMS/_run/e36/blind \
//     --out ../FILMS/_run/e36/blind/brief.md
//
// WHY THIS EXISTS (2026-08-04): the first blind pass got the canon as a one-line
// paraphrase written by hand ("a character is an object with arms and legs") and
// promptly filed a confident FALSE defect against a character the canon draws
// exactly that way. The reviewer judges by what it is handed; a paraphrase
// produces false rejections with the same confidence as real findings.
//
// So the canon is pulled from the database VERBATIM — the same plates the frame
// generator attaches — and never retyped. The acceptance list is copied in whole,
// never summarised. The reviewer receives artefact + spec + canon, and nothing
// about how any of it was made.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { sb, S15 } from './_env';

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`missing --${name}`);
}

async function main() {
  const specPath = resolve(process.cwd(), arg('spec'));
  const shotsDir = resolve(process.cwd(), arg('shots'));
  const outPath = resolve(process.cwd(), arg('out'));

  const spec = readFileSync(specPath, 'utf8');

  // Canon plates, verbatim from the DB. Characters and style only: locations are
  // visible in the artefact itself and describing them would leak intent.
  const { data: plates, error } = await sb
    .from('assets')
    .select('file_type,description,status')
    .eq('series_id', S15)
    .or('file_type.like.SBL-character_%,file_type.like.SBL-style_%')
    .order('file_type');
  if (error) throw new Error(`canon read failed: ${error.message}`);

  const canon = (plates ?? [])
    .filter((p) => (p.description ?? '').trim().length > 0)
    .map((p) => `### ${p.file_type} (${p.status})\n\n${(p.description ?? '').trim()}`)
    .join('\n\n');

  const sheets = existsSync(shotsDir)
    ? readdirSync(shotsDir)
        .filter((f) => /\.(png|jpg)$/i.test(f))
        .sort()
        .map((f, i) => `${i + 1}. ${join(shotsDir, f)}`)
        .join('\n')
    : '(контактные листы не найдены — нарежьте их из готового ката перед приёмкой)';

  const out = `# ПРИЁМКА ЭПИЗОДА — материал приёмщику

Ты принимаешь готовый эпизод. Суди ТОЛЬКО по картинкам и по документам ниже.

## Артефакт — контактные листы, по порядку

${sheets}

Читай их через Read (это изображения). Порядок кадров в каждом листе: слева направо,
сверху вниз.

## Лист ожиданий — «приму, если»

Скопирован целиком, включая канон персонажа, наследуемый каждым кадром.

${spec}

## КАНОН СЕРИИ — дословно из базы, не пересказ

${canon}

## Что от тебя нужно

1. По каждому пункту листа — вердикт ПРИНЯТО / ОТКЛОНЕНО / НЕ ВИДНО, одной строкой, с
   указанием кадра (номер листа + позиция).
2. Отдельным списком — дефекты, которых в листе НЕТ, но которые видны глазами.
3. Не выдумывай: если по контактному листу судить нельзя — пиши «НЕ ВИДНО».

## Запрещено

Не открывай других файлов репозитория: ни журналов, ни планов, ни промптов, ни истории
создания. Только картинки и этот документ. Заглянувший в историю приёмщик подтверждает
гипотезу ложно.
`;

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, out, 'utf8');
  console.log(`OK ${outPath}`);
  console.log(`canon plates: ${(plates ?? []).length} · spec: ${spec.split('\n').length} строк`);
}

main().catch((e) => {
  console.error('ERROR', e?.message ?? e);
  process.exit(1);
});
