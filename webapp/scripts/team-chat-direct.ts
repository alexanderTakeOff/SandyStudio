// Bypass endpoint — insert claude_message turn directly via service role.
// Used when undici crashes on Node 24 during dev-server hot-reload churn.
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
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function main() {
  const args = process.argv.slice(2);
  const fileFlag = args.indexOf('--file');
  const tagFlag = args.indexOf('--tag');
  let content: string;
  if (fileFlag >= 0 && args[fileFlag + 1]) {
    content = readFileSync(args[fileFlag + 1]!, 'utf-8').trim();
  } else if (args[0]) {
    content = args[0];
  } else {
    console.error('arg or --file required');
    process.exit(1);
  }
  const tag = tagFlag >= 0 ? args[tagFlag + 1] : null;

  const { data: latest } = await sb
    .from('concierge_threads')
    .select('id')
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) {
    console.error('no open thread');
    process.exit(1);
  }

  const { data, error } = await sb
    .from('concierge_turns')
    .insert({
      thread_id: latest.id,
      role: 'system',
      event_type: 'message',
      content: `**Claude:** ${content}`,
      metadata: {
        kind: 'claude_message',
        author: 'Claude',
        tag,
        posted_at: new Date().toISOString(),
        via: 'service-role-direct',
      },
    } as never)
    .select('id')
    .single();
  if (error) {
    console.error(error);
    process.exit(1);
  }
  console.log(`✓ inserted turn ${(data as { id?: string } | null)?.id} in thread ${latest.id}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
