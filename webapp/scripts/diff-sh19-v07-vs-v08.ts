// Show v07 vs v08 SH19 Plan content side-by-side to confirm Director's
// edits are preserved in the right version.
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

const TARGETS = [
  { id: '659dff18-843e-4939-abff-d8a546a1d08d', label: 'v07 (Polина first regen, my unblock → REVIEW)' },
  { id: '39954efe-3942-4d9c-bb92-a0c0afed4078', label: 'v08 (Polина second regen, REVISION — still pre-TD-75)' },
];

function extractPromptBody(content: string): string | null {
  const m = content.match(/##\s+Промпт\s*\n+```\s*\n([\s\S]+?)\n```/);
  return m ? m[1] : null;
}

function extractCameraLine(prompt: string): string | null {
  const m = prompt.match(/CAMERA:\s*(.+)/);
  return m ? m[1].trim() : null;
}

function extractActionLine(prompt: string): string | null {
  const m = prompt.match(/ACTION:\s*([\s\S]+?)(?=\n[A-Z]+:|\n*$)/);
  return m ? m[1].trim().replace(/\s+/g, ' ').slice(0, 400) : null;
}

async function main(): Promise<void> {
  for (const t of TARGETS) {
    const rows = JSON.parse(await rest(`assets?id=eq.${t.id}&select=filename,status,content,metadata,updated_at`)) as Array<{ filename: string; status: string; content: string | null; metadata: Record<string, unknown> | null; updated_at: string }>;
    if (rows.length === 0) { console.log(`\n${t.label}: not found`); continue; }
    const r = rows[0];
    console.log(`\n${'='.repeat(72)}`);
    console.log(`${t.label}`);
    console.log(`filename=${r.filename}  status=${r.status}  updated=${r.updated_at}`);
    console.log('='.repeat(72));
    const prompt = r.content ? extractPromptBody(r.content) : null;
    if (!prompt) { console.log('  (no prompt block found)'); continue; }
    const action = extractActionLine(prompt);
    const camera = extractCameraLine(prompt);
    console.log(`\nACTION (first 400 chars):\n  ${action ?? '(none)'}`);
    console.log(`\nCAMERA:\n  ${camera ?? '(none)'}`);
    // Look for Director-style edit markers in metadata.
    if (r.metadata) {
      const meta = r.metadata as Record<string, unknown>;
      const directorEdited = meta.director_edited ?? meta.policy_notes ?? meta.directorOverrides;
      if (directorEdited) {
        console.log(`\nmetadata director-trail: ${JSON.stringify(directorEdited).slice(0, 800)}`);
      }
    }
    // Extract JSON block, look for policy_notes there
    const jsonMatches = [...(r.content ?? '').matchAll(/```json\s*([\s\S]+?)```/g)];
    if (jsonMatches.length > 0) {
      try {
        const body = JSON.parse(jsonMatches[jsonMatches.length - 1][1].trim()) as Record<string, unknown>;
        const policy = body.policy_notes;
        if (Array.isArray(policy)) {
          console.log(`\npolicy_notes[]:`);
          for (const n of policy) console.log(`  - ${n}`);
        }
      } catch { /* skip */ }
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
