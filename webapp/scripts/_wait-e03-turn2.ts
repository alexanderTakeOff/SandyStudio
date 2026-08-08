// @not-a-tool: ожидание ВТОРОГО ответа ума на «Зрачок-2» — удалить после прогона.
import { sb } from './run/_env';

const THREAD_ID = '37002ea5-39cf-44bc-990f-8143f583b1cb';

async function main() {
  for (let i = 0; i < 90; i++) {
    const { data: turns } = await sb
      .from('concierge_turns')
      .select('role')
      .eq('thread_id', THREAD_ID)
      .eq('role', 'assistant')
      .order('created_at', { ascending: false })
      .limit(1);
    // Первый ассистентский ход уже был — ждём, что появится ВТОРОЙ (считаем через created_at).
    const { count } = await sb
      .from('concierge_turns')
      .select('id', { count: 'exact', head: true })
      .eq('thread_id', THREAD_ID)
      .eq('role', 'assistant');
    if ((count ?? 0) >= 2) {
      console.log('SECOND_ASSISTANT_TURN_ARRIVED', count);
      return;
    }
    void turns;
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.log('TIMEOUT');
}
main();
