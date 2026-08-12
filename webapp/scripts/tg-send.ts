// Разовая отправка файла Директору в пульт — тем же клиентом, что у бота.
//   npx tsx scripts/tg-send.ts <файл> "подпись"
import './run/_env';
import { sendFile } from '../lib/telegram/api';
import { resolve } from 'node:path';

const KIND_BY_EXT: Record<string, 'photo' | 'video' | 'audio' | 'document'> = {
  png: 'photo',
  jpg: 'photo',
  jpeg: 'photo',
  mp4: 'video',
  mp3: 'audio',
};

async function main(): Promise<void> {
  const file = process.argv[2];
  const caption = process.argv[3] ?? '';
  if (!file) throw new Error('usage: tg-send <файл> "подпись"');
  const chat = Number((process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? '').split(',')[0]);
  if (!chat) throw new Error('TELEGRAM_ALLOWED_CHAT_IDS пуст');
  const ext = file.split('.').pop()?.toLowerCase() ?? '';
  await sendFile(chat, KIND_BY_EXT[ext] ?? 'document', resolve(process.cwd(), file), caption);
  console.log('отправлено');
}

main().catch((e) => {
  console.error('ERR:', e instanceof Error ? e.message : e);
  process.exit(1);
});
