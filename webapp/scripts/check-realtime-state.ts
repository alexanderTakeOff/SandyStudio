// Verify the Realtime infrastructure for concierge_turns is wired correctly.
import { createClient } from '@supabase/supabase-js';
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
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

(async () => {
  // Live Realtime probe — subscribe with the same filter ConciergePanel uses
  // and report whether we get the INSERT event for a synthetic system turn.
  const THREAD = 'bdbdafcf-2a38-4c58-b706-362fd7ff0f16';
  const channelTopic = `concierge_turns:${THREAD}`;
  let received = 0;

  const channel = sb.channel(channelTopic).on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'concierge_turns', filter: `thread_id=eq.${THREAD}` },
    (payload) => {
      received++;
      const row = payload.new as { id?: string; role?: string };
      console.log(`>> RT INSERT received: id=${row.id} role=${row.role}`);
    },
  );

  const sub = await new Promise<string>((resolve) => {
    channel.subscribe((status, err) => {
      console.log(`subscribe status: ${status}`, err ? `err=${err.message}` : '');
      if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        resolve(status);
      }
    });
  });

  if (sub !== 'SUBSCRIBED') {
    console.log(`Final status: ${sub}. Aborting.`);
    process.exit(1);
  }

  // Synthetic INSERT — should fire the listener.
  console.log('\nInserting synthetic turn …');
  const { data: ins, error } = await sb
    .from('concierge_turns')
    .insert({
      thread_id: THREAD,
      role: 'system',
      event_type: 'message',
      content: '**Claude:** Realtime check probe',
      metadata: { kind: 'realtime_probe', author: 'Claude' },
    } as never)
    .select('id')
    .single();
  if (error) {
    console.error('insert failed:', error);
    process.exit(1);
  }
  console.log(`inserted ${(ins as { id?: string } | null)?.id}`);

  await new Promise((r) => setTimeout(r, 5000));
  console.log(`\n→ events received in 5s: ${received}`);

  // Cleanup probe row.
  if (ins) {
    await sb.from('concierge_turns').delete().eq('id', (ins as { id: string }).id);
  }
  await sb.removeChannel(channel);
  process.exit(0);
})();
