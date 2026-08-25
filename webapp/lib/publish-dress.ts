// Упаковка, которая едет НА площадку поверх уже залитого видео: обложка.
//
// Правило «обложка выпуска = свежайший APPROVED IMG-thumbnail эпизода» жило
// раньше тремя копиями — в `scripts/run/publish.ts`, в EXEC-PUB (`lib/agents/
// runner.ts`) и в легаси-скрипте полировки. Копии разошлись в мелочи, которая
// решает всё: одна ветка брала байты из Drive, другая из кэша, третья молча
// пропускала обложку, если у строки не было `drive_file_id`. Здесь она одна.
import { ensureCachedMedia } from './media-cache';
import { readFile } from 'node:fs/promises';

export interface ThumbnailBytes {
  readonly filename: string;
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

/** Минимальная форма клиента: ровно те звенья цепочки, которыми пользуемся ниже.
 *  Описана структурно, а не через any, чтобы опечатка в звене падала компиляцией. */
interface ThumbnailRow {
  filename?: string | null;
  drive_file_id?: string | null;
  version?: number | null;
}
interface DbQuery {
  eq: (column: string, value: string) => DbQuery;
  order: (column: string, opts: { ascending: boolean }) => DbQuery;
  limit: (n: number) => PromiseLike<{ data?: ThumbnailRow[] | null }>;
}
type Db = {
  from: (table: string) => { select: (columns: string) => DbQuery };
};

/**
 * Байты утверждённой обложки эпизода — или `null`, если её нет.
 *
 * Тип отдаётся по сигнатуре файла, а не по расширению имени: `thumbnails.set`
 * отказывает на несовпадении content-type, а имя в студии каноническое и про
 * формат не знает ничего.
 */
export async function approvedThumbnailBytes(db: Db, episodeId: string): Promise<ThumbnailBytes | null> {
  const { data } = await db
    .from('assets')
    .select('filename,drive_file_id,version')
    .eq('episode_id', episodeId)
    .eq('file_type', 'IMG-thumbnail')
    .eq('status', 'APPROVED')
    .order('version', { ascending: false })
    .limit(1);

  const row = data?.[0];
  if (!row?.filename) return null;

  const abs = await ensureCachedMedia({ filename: row.filename, driveFileId: row.drive_file_id ?? '' });
  const bytes = new Uint8Array(await readFile(abs));
  return { filename: row.filename, bytes, contentType: sniffImageType(bytes) };
}

/** PNG или JPEG по первым байтам; иначе — громкий отказ, а не догадка. */
export function sniffImageType(bytes: Uint8Array): string {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  throw new Error('обложка не PNG и не JPEG — площадка такой файл не примет');
}
