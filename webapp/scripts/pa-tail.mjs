#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────────────────────
// scripts/pa-tail.mjs
// Read-only inspector for Prod Assistant conversations. Used by the
// .claude/commands/pa-recent.md and pa-summary.md slash commands.
//
// Subcommands:
//   node scripts/pa-tail.mjs recent  [N]            last N turns of latest thread
//   node scripts/pa-tail.mjs summary [period]       feedback turns in period
//                                                   period: 1h | 6h | 1d | today | 1w  (default 1d)
//   node scripts/pa-tail.mjs dump    <thread-id>    full dump of one thread
//
// Loads .env.local manually (Node --env-file does not override existing vars
// on Windows — see project memory).
// ──────────────────────────────────────────────────────────────────────────────

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webappRoot = path.resolve(__dirname, '..');

function loadEnv() {
  const envPath = path.join(webappRoot, '.env.local');
  if (!existsSync(envPath)) {
    console.error(`[pa-tail] .env.local not found at ${envPath}`);
    process.exit(1);
  }
  const text = readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[k] = v;
  }
  return env;
}

const env = loadEnv();
const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const [, , subcmd = 'recent', ...rest] = process.argv;

function truncate(s, max) {
  if (!s) return '';
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

function formatTurn(t) {
  const role = t.role.toUpperCase().padEnd(9);
  const time = t.created_at.slice(11, 19);
  const evt = t.event_type;
  if (evt === 'tool_call') {
    const calls = (t.metadata?.tool_calls ?? [])
      .map((c) => `${c.name}(${truncate(c.arguments ?? '{}', 120)})`)
      .join('; ');
    return `[${time}] ${role} 🔧 ${calls}`;
  }
  if (evt === 'tool_result') {
    const ok = t.metadata?.ok ? '✓' : '✗';
    const name = t.metadata?.tool_name ?? '?';
    return `[${time}] ${role} ↪ ${name} ${ok}: ${truncate(t.content, 240)}`;
  }
  if (evt === 'feedback') {
    return `[${time}] ${role} 📋 ${truncate(t.content, 600)}`;
  }
  return `[${time}] ${role} ${truncate(t.content, 600)}`;
}

async function recent(n = 10) {
  const { data: threads, error } = await supabase
    .from('concierge_threads')
    .select('id, started_at, episode_id, active_mode')
    .order('started_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  if (!threads || threads.length === 0) { console.log('no threads'); return; }
  const t = threads[0];
  console.log(`\nThread ${t.id} | started ${t.started_at} | mode ${t.active_mode} | episode ${t.episode_id ?? '-'}`);
  console.log('─'.repeat(80));

  const { data: turns, error: tErr } = await supabase
    .from('concierge_turns')
    .select('*')
    .eq('thread_id', t.id)
    .order('created_at', { ascending: false })
    .limit(n);
  if (tErr) throw new Error(tErr.message);
  const ordered = (turns ?? []).reverse();
  for (const turn of ordered) {
    console.log(formatTurn(turn));
  }
}

function periodToHours(period) {
  const m = (period ?? '').toLowerCase();
  if (m === 'today') {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return (now.getTime() - start.getTime()) / 3600_000;
  }
  const match = m.match(/^(\d+)\s*([hdw])$/);
  if (!match) return 24;
  const n = parseInt(match[1], 10);
  return match[2] === 'h' ? n : match[2] === 'd' ? n * 24 : n * 168;
}

async function summary(period = '1d') {
  const hours = periodToHours(period);
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  console.log(`\nFeedback turns in last ${hours.toFixed(1)}h (since ${since}):\n`);
  const { data, error } = await supabase
    .from('concierge_turns')
    .select('*')
    .eq('event_type', 'feedback')
    .gte('created_at', since)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  const turns = (data ?? []);
  if (turns.length === 0) {
    console.log('(none)');
    return;
  }
  for (const t of turns) {
    const meta = t.metadata ?? {};
    const tag = meta.marker ? `!${meta.marker}` : '!fb';
    const win = meta.window_size ? ` N=${meta.window_size}` : '';
    const note = meta.note ? ` note="${truncate(meta.note, 80)}"` : '';
    console.log(`[${t.created_at.slice(0, 19)}] ${tag}${win}${note}`);
    console.log(`  thread=${t.thread_id.slice(0, 8)}`);
    console.log(`  ${truncate(t.content, 300)}`);
    console.log('');
  }
  console.log(`Total: ${turns.length} feedback marker(s).`);
}

async function dump(threadId) {
  if (!threadId) { console.error('thread-id required'); process.exit(1); }
  const { data: turns, error } = await supabase
    .from('concierge_turns')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  for (const turn of turns ?? []) {
    console.log(formatTurn(turn));
  }
}

try {
  if (subcmd === 'recent') {
    const n = rest[0] ? parseInt(rest[0], 10) : 10;
    await recent(isFinite(n) && n > 0 ? Math.min(100, n) : 10);
  } else if (subcmd === 'summary') {
    await summary(rest[0] ?? '1d');
  } else if (subcmd === 'dump') {
    await dump(rest[0]);
  } else {
    console.error(`Unknown subcommand: ${subcmd}. Use: recent | summary | dump`);
    process.exit(1);
  }
} catch (err) {
  console.error(`[pa-tail] ${err?.message ?? err}`);
  process.exit(1);
}
