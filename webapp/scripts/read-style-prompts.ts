// Quick one-off: read prompts of the 4 generated S14 style references + the
// general_idea v02 LOCKED text canon, dump to stdout for synthesis work.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadDotenvOverride(filename: string): void {
  try {
    const text = readFileSync(resolve(process.cwd(), filename), 'utf-8');
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  } catch {/* ignore */}
}
loadDotenvOverride('.env.local');

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const STYLE_IDS = [
  '083a9268-4e1e-4a62-a881-b279873e89c6', // a
  'b95f8de4-1b45-4f4e-bbf8-18026c11d594', // b
  'ca48adb2-1b8a-4fc5-924f-b64cbbd8746f', // c
  '0d30ef36-898d-40a2-b921-0cd57fda0971', // d
  'b09b03a0-a690-4dfa-b973-1cc38cb12aeb', // e
  'a6852f9c-a1ad-4d78-9f80-9a07d17f82f5', // f
  '0b9a80a0-edca-402e-962e-093752899186', // g
];

async function main() {
  // 4 style refs
  for (const id of STYLE_IDS) {
    const { data } = await sb.from('assets').select('id, filename, status, content, metadata').eq('id', id).maybeSingle();
    if (!data) continue;
    const a = data as { id: string; filename: string; status: string; content: string | null; metadata: { image_prompt?: { current_version?: number; history?: Array<{ version: number; prompt: string }> } } | null };
    const cv = a.metadata?.image_prompt?.current_version;
    const cur = cv ? a.metadata?.image_prompt?.history?.find(h => h.version === cv) : a.metadata?.image_prompt?.history?.[a.metadata.image_prompt.history.length - 1];
    console.log(`\n===== ${a.filename} [${a.status}] =====`);
    console.log(`PROMPT (v${cv ?? '?'}):`);
    console.log(cur?.prompt ?? '(no prompt)');
    console.log(`\nCONTENT:\n${(a.content ?? '(empty)').slice(0, 1000)}`);
  }

  // general_idea v02 LOCKED
  console.log('\n\n===== general_idea v02 LOCKED =====');
  const { data: gi } = await sb.from('assets').select('id, filename, status, content').eq('file_type', 'SBL-general_idea').eq('status', 'LOCKED').order('filename', { ascending: false }).limit(1);
  if (gi && gi.length > 0) {
    const g = gi[0] as { id: string; filename: string; status: string; content: string | null };
    console.log(`${g.filename}`);
    console.log(g.content ?? '(empty)');
  }
}
main().catch(e => { console.error(e); process.exit(1); });
