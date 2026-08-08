// @not-a-tool: одноразовая проверка изоляции тредов — удалить после прогона.
import { sb } from './run/_env';

async function main() {
  const { data: threads } = await sb
    .from('concierge_threads')
    .select('id,episode_id,series_id,started_at,ended_at')
    .eq('episode_id', 'd0bd6b32-406b-44ad-9935-397371173737')
    .order('started_at', { ascending: false })
    .limit(3);
  console.log('threads for E37:', JSON.stringify(threads, null, 2));
  if (threads?.[0]) {
    const { data: turns } = await sb
      .from('concierge_turns')
      .select('role,content,created_at')
      .eq('thread_id', threads[0].id)
      .order('created_at', { ascending: true });
    console.log('turns:', JSON.stringify(turns, null, 2));
  }
}
main();
