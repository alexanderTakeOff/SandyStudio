// @not-a-tool: ждёт ответ Полины на wake-событие Ф4-теста.
import { sb } from './run/_env';
const since = new Date(Date.now() - 3 * 60 * 1000).toISOString();
async function main() {
  for (let i = 0; i < 100; i++) {
    const { data } = await sb
      .from('concierge_turns')
      .select('role,content,metadata,created_at')
      .gt('created_at', since)
      .in('role', ['assistant', 'system'])
      .order('created_at', { ascending: true });
    const wake = (data ?? []).find(
      (t) => t.role === 'assistant' && (t.metadata as Record<string, unknown>)?.bridge,
    );
    if (wake) {
      console.log('ОТВЕТ НА СОБЫТИЕ:', wake.content);
      console.log('meta:', JSON.stringify(wake.metadata).slice(0, 160));
      return;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.error('ответа нет за 8 минут');
  process.exit(1);
}
main();
