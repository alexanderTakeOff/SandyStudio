// Poll concierge_turns every 4s and stream any new rows to stdout — one
// JSON line per turn. Designed for Claude Code's Monitor MCP: each stdout
// line becomes a notification I receive in real time, so I stop missing
// Director / Polina exchanges and pipeline events.
//
// Usage:
//   npx tsx scripts/watch-pa-thread.ts <threadId>
//
// Filters: emits ALL turns (any role/kind). Claude side can post-filter.
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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[line.slice(0, eq).trim()] = val;
  }
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const THREAD = process.argv[2] ?? 'bdbdafcf-2a38-4c58-b706-362fd7ff0f16';
const INTERVAL_MS = Number(process.argv[3] ?? 4000);

const seen = new Set<string>();
let lastCursor = new Date().toISOString();

async function bootstrap() {
  // Seed `seen` with the most recent 30 turn ids so we don't emit history
  // on startup — only new turns from now on count as notifications.
  const { data } = await sb
    .from('concierge_turns')
    .select('id,created_at')
    .eq('thread_id', THREAD)
    .order('created_at', { ascending: false })
    .limit(30);
  for (const t of data ?? []) {
    seen.add(t.id);
    if (t.created_at > lastCursor) lastCursor = t.created_at;
  }
  process.stdout.write(
    JSON.stringify({
      type: 'watcher_ready',
      thread: THREAD,
      seeded: seen.size,
      cursor: lastCursor,
    }) + '\n',
  );
}

async function tick() {
  const { data, error } = await sb
    .from('concierge_turns')
    .select('id,role,event_type,content,metadata,created_at')
    .eq('thread_id', THREAD)
    .gte('created_at', lastCursor)
    .order('created_at', { ascending: true })
    .limit(50);
  if (error) {
    process.stdout.write(
      JSON.stringify({ type: 'watcher_error', error: error.message }) + '\n',
    );
    return;
  }
  for (const t of data ?? []) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    if (t.created_at > lastCursor) lastCursor = t.created_at;
    const m = (t.metadata ?? {}) as Record<string, unknown>;
    const kind = typeof m.kind === 'string' ? m.kind : null;
    const head = String(t.content).slice(0, 240).replace(/\n/g, ' ');
    process.stdout.write(
      JSON.stringify({
        type: 'turn',
        at: t.created_at,
        role: t.role,
        kind,
        head,
        id: t.id,
      }) + '\n',
    );
  }
}

(async () => {
  await bootstrap();
  // Continuous loop — Monitor reads each stdout line as a separate event.
  for (;;) {
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
    try {
      await tick();
    } catch (e) {
      process.stdout.write(
        JSON.stringify({
          type: 'watcher_error',
          error: e instanceof Error ? e.message : String(e),
        }) + '\n',
      );
    }
  }
})();
