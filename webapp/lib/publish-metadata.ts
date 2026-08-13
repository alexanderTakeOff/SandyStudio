// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/publish-metadata.ts
// Parse EXEC-COPY's SPC-metadata markdown into clean YouTube fields.
//
// EXEC-COPY output is NOT uniform across episodes: headers vary ("## Title",
// "## Title (Primary)", "## Title (3 variants — director selects)") and bodies
// list labelled options ("**Option 1 (Primary):** …", "**Variant A (…):**\n<title>").
// A naive exact-header + first-line parser produced empty or markdown-polluted
// titles (E12/E13 empty → YouTube 400; E14 → "**Option 1:** …"). This robust
// parser is the ONE shared implementation used by both the EXEC-PUB runner and
// the distribution polish script.
// ──────────────────────────────────────────────────────────────────────────────

export interface PublishMetadata {
  title: string;
  description: string;
  tags: string[];
}

/** Body of the first `## <name>…` section — header PREFIX match so
 *  "## Title (Primary)" / "## Title (3 variants…)" all resolve — up to next `##`. */
function sectionBody(md: string, name: string): string {
  const out: string[] = [];
  let capturing = false;
  for (const line of md.split(/\r?\n/)) {
    const h = line.match(/^##\s*(.+?)\s*$/);
    if (h) {
      if (capturing) break; // next header ends the section
      if (h[1].toLowerCase().startsWith(name.toLowerCase())) capturing = true;
      continue;
    }
    if (capturing) out.push(line);
  }
  return out.join('\n').trim();
}

/** Strip markdown emphasis + a leading "Option N (…):" / "Variant X (…):" /
 *  "Primary:" label from a candidate title line. */
function cleanTitleLine(raw: string): string {
  let s = raw.replace(/[*_`]/g, '').trim();
  s = s.replace(/^[-•]\s*/, '');
  s = s.replace(/^(option\s*\d+|variant\s*(?:\d+|[a-z])|primary|short|casual|main)\b[^:]*:\s*/i, '').trim();
  s = s.replace(/\s*\([^)]*(?:chars|≤|<=)[^)]*\)\s*$/i, '').trim(); // drop "(≤70: 68 chars)" author annotation
  s = s.replace(/^["“”']+\s*/, '').replace(/\s*["“”']+$/, '').trim(); // drop surrounding quotes
  return s;
}

/** First usable title from a Title section that may list several labelled
 *  options/variants. Returns '' if none found. */
function extractTitle(md: string): string {
  const body = sectionBody(md, 'title');
  for (const line of body.split(/\r?\n/)) {
    const s = cleanTitleLine(line);
    if (s.length > 3) return s.slice(0, 100);
  }
  return '';
}

/** Description section minus a leading bold label line, bold markers stripped. */
function cleanDescription(md: string): string {
  const body = sectionBody(md, 'description');
  return body
    .split(/\r?\n/)
    .filter((l, i) => !(i === 0 && /^\s*\*\*[^*]+\*\*\s*$/.test(l)))
    .join('\n')
    .replace(/\*\*/g, '')
    .trim();
}

/**
 * Что документ РЕАЛЬНО содержит — без единой подстановки.
 *
 * Разделено с `parseVideoMetadata` 13.08 (очередь Полины п.17): фолбэк на имя эпизода
 * подставляется ВНУТРИ разбора, поэтому проверить «а нашлось ли вообще что-нибудь»
 * по его результату невозможно — оба живых читателя фолбэк передают, и пустой заголовок
 * приходит уже подменённым. Гейт публикации смотрит СЮДА, до всякой подстановки.
 */
export function extractRawMetadata(md: string): PublishMetadata {
  const tagsRaw = sectionBody(md, 'tags');
  return {
    title: extractTitle(md),
    description: cleanDescription(md),
    tags: tagsRaw
      ? tagsRaw.split(/[,\n]/).map((t) => t.replace(/^[-*•#\s]+/, '').trim()).filter(Boolean).slice(0, 30)
      : [],
  };
}

export function parseVideoMetadata(md: string, fallbackTitle?: string): PublishMetadata {
  const raw = extractRawMetadata(md);
  return {
    title: (raw.title || fallbackTitle || '').slice(0, 100),
    description: raw.description,
    tags: raw.tags,
  };
}

const CYRILLIC = /[Ѐ-ӿ]/;

/**
 * ГЕЙТ УПАКОВКИ: изделие не уезжает на канал недооформленным.
 *
 * Инцидент E07 (13.08): документ `SPC-metadata` был написан русскими заголовками
 * («## Заголовок» вместо «## Title»), разбор вернул пустоту по всем трём полям, пустой
 * заголовок молча подменился кодом эпизода — и на канал уехало бы «SS-S20-E07» с пустым
 * описанием и без тегов. Тихий отказ: видео опубликовано, брак незаметен.
 *
 * Проверяется СЫРОЙ разбор (`extractRawMetadata`), потому что после подстановки фолбэка
 * отличить «автор не написал» от «автор написал» уже нельзя.
 *
 * Язык берётся из паспорта канала (`publish_defaults.default_language`), а не хардкодом:
 * архитектура мультиканальная, и «всегда английский» стал бы ложным блокером для первого
 * же неанглоязычного канала.
 */
export function assertPublishable(
  raw: PublishMetadata,
  opts: { source: string; language?: string | null },
): void {
  const missing: string[] = [];
  if (!raw.title.trim()) missing.push('## Title');
  if (!raw.description.trim()) missing.push('## Description');
  if (raw.tags.length === 0) missing.push('## Tags');
  if (missing.length > 0) {
    throw new Error(
      `${opts.source}: упаковка не читается — не найдено ${missing.join(', ')}. ` +
        `Секции ищутся по АНГЛИЙСКИМ заголовкам (## Title · ## Description · ## Tags); ` +
        `русские заголовки разбор не находит и молча отдаёт пустоту. Перепиши документ и повтори.`,
    );
  }

  const language = (opts.language ?? 'en').toLowerCase();
  if (language.startsWith('en')) {
    const cyrillicIn = [
      raw.title && CYRILLIC.test(raw.title) ? 'заголовке' : '',
      raw.description && CYRILLIC.test(raw.description) ? 'описании' : '',
      raw.tags.some((t) => CYRILLIC.test(t)) ? 'тегах' : '',
    ].filter(Boolean);
    if (cyrillicIn.length > 0) {
      throw new Error(
        `${opts.source}: кириллица в ${cyrillicIn.join(', ')}, а язык канала — ${language}. ` +
          `Всё, что видит зритель, пишется на языке канала (закон Директора 13.08).`,
      );
    }
  }
}
