// Dump SH19 Plan v07 content to confirm gag arc preserved.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  for (const raw of readFileSync(envPath, 'utf-8').split('\n')) {
    const l = raw.trim(); if (!l || l.startsWith('#')) continue;
    const eq = l.indexOf('='); if (eq <= 0) continue;
    let v = l.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[l.slice(0, eq).trim()] = v;
  }
}
const U = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const K = process.env.SUPABASE_SERVICE_ROLE_KEY!;
async function rest(q: string): Promise<string> {
  return (await fetch(`${U}/rest/v1/${q}`, { headers: { apikey: K, Authorization: `Bearer ${K}` } })).text();
}
async function main(): Promise<void> {
  const r = JSON.parse(await rest(`assets?id=eq.659dff18-843e-4939-abff-d8a546a1d08d&select=filename,status,content`)) as Array<{ filename: string; status: string; content: string }>;
  if (r.length === 0) { console.log('not found'); return; }
  console.log(`${r[0].filename} status=${r[0].status}`);
  console.log('--- content first 5000 chars ---');
  console.log(r[0].content.slice(0, 5000));
}
main().catch((e) => { console.error(e); process.exit(1); });
