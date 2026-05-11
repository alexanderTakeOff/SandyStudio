// One-shot reader for the most recent Prod Assistant thread.
// Loads .env.local manually because Node --env-file doesn't override existing vars (see memory).
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')];
    }),
);

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const { data: threads, error: tErr } = await supabase
  .from('concierge_threads')
  .select('id, started_at, episode_id, active_mode')
  .order('started_at', { ascending: false })
  .limit(1);
if (tErr) { console.error(tErr); process.exit(1); }
if (!threads || threads.length === 0) { console.log('no threads'); process.exit(0); }
const t = threads[0];
console.log(`\n=== Thread ${t.id} ===`);
console.log(`Started: ${t.started_at} | Mode: ${t.active_mode} | Episode: ${t.episode_id ?? '(none)'}\n`);

const { data: turns, error: trErr } = await supabase
  .from('concierge_turns')
  .select('role, event_type, content, metadata, created_at')
  .eq('thread_id', t.id)
  .order('created_at', { ascending: true });
if (trErr) { console.error(trErr); process.exit(1); }

for (const turn of turns ?? []) {
  const role = turn.role.toUpperCase().padEnd(9);
  const evt = turn.event_type;
  const time = new Date(turn.created_at).toTimeString().slice(0, 8);
  if (evt === 'tool_call') {
    const calls = (turn.metadata?.tool_calls ?? []).map((c) => `${c.name}(${c.arguments})`).join('; ');
    console.log(`[${time}] ${role} 🔧 ${calls}`);
  } else if (evt === 'tool_result') {
    const ok = turn.metadata?.ok;
    const name = turn.metadata?.tool_name;
    const preview = turn.content.slice(0, 200).replace(/\n/g, ' ');
    console.log(`[${time}] ${role} ↪ ${name} ${ok ? '✓' : '✗'}: ${preview}${turn.content.length > 200 ? '…' : ''}`);
  } else {
    const txt = turn.content.length > 800 ? turn.content.slice(0, 800) + '…' : turn.content;
    console.log(`[${time}] ${role} ${txt}`);
  }
  console.log('');
}
