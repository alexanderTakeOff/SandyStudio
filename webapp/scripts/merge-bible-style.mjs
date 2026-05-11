// One-shot: merge russian style draft into general_idea v02-DRAFT for SS-S14.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync('.env.local','utf8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const SERIES_ID = 'd1dfa060-748d-4713-ad55-ec30d3214f73';

// 1) Read current general_idea v02-DRAFT
const { data: gi, error: e1 } = await sb.from('assets')
  .select('id, content, version, status')
  .eq('series_id', SERIES_ID)
  .eq('file_type', 'SBL-general_idea')
  .eq('status', 'DRAFT')
  .order('version', { ascending: false })
  .limit(1)
  .maybeSingle();
if (e1 || !gi) { console.error('general_idea DRAFT not found:', e1?.message); process.exit(1); }
console.log(`Found general_idea v${gi.version} ${gi.status} id=${gi.id}, ${gi.content?.length ?? 0} chars`);

// 2) Read russian style draft (style_style_s14)
const { data: styleRu } = await sb.from('assets')
  .select('id, content, version, status, filename')
  .eq('series_id', SERIES_ID)
  .eq('file_type', 'SBL-style_style_s14')
  .order('version', { ascending: false })
  .limit(1)
  .maybeSingle();
console.log(`Russian style: id=${styleRu?.id}, ${styleRu?.content?.length ?? 0} chars`);

// 3) Also pull english style_main for reference
const { data: styleEn } = await sb.from('assets')
  .select('id, content, status, filename')
  .eq('series_id', SERIES_ID)
  .eq('file_type', 'SBL-style_main')
  .order('version', { ascending: false })
  .limit(1)
  .maybeSingle();
console.log(`English style_main: id=${styleEn?.id}, ${styleEn?.content?.length ?? 0} chars`);

// 4) Compose merged general_idea content
const currentGI = gi.content ?? '';
const styleSection = (styleRu?.content || styleEn?.content || '').trim();

if (!styleSection) {
  console.error('No style content found to merge.');
  process.exit(1);
}

// If general_idea already has a ## Style section, replace it. Otherwise append.
let merged;
const styleHeadingRe = /\n##\s+Style\b[\s\S]*?(?=\n##\s+|\n$|$)/i;
const styleBlock = `\n\n## Style\n\n${styleSection}\n`;
if (styleHeadingRe.test(currentGI)) {
  merged = currentGI.replace(styleHeadingRe, styleBlock);
} else {
  merged = currentGI.trimEnd() + styleBlock;
}

console.log(`\nMerged content (${merged.length} chars). Preview of new ## Style section:`);
console.log('─'.repeat(60));
console.log(merged.split(/\n## /).pop()?.slice(0, 400) + '...');
console.log('─'.repeat(60));

// 5) Update general_idea v02-DRAFT in place
const { error: e2 } = await sb.from('assets')
  .update({ content: merged, updated_at: new Date().toISOString() })
  .eq('id', gi.id);
if (e2) { console.error('Update failed:', e2.message); process.exit(1); }
console.log('\n✓ general_idea v02-DRAFT updated with merged style section.');

// 6) Mark the two orphan style drafts as REJECTED so Library is cleaner
const orphans = [styleRu?.id, styleEn?.id].filter(Boolean);
for (const id of orphans) {
  const { error: e3 } = await sb.from('assets')
    .update({ status: 'REJECTED', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (e3) console.warn(`  warn: failed to reject ${id}: ${e3.message}`);
  else console.log(`✓ Marked ${id} as REJECTED.`);
}

// 7) Activity event for audit
await sb.from('activity_events').insert({
  event_type: 'asset_updated',
  severity: 'info',
  title: 'Bible: merged style → general_idea (manual recovery by engineer)',
  description: 'Engineer-driven cleanup: russian style draft text appended as ## Style inside general_idea v02-DRAFT. Orphan style_main + style_style_s14 drafts rejected.',
  actor: 'engineer_via_chat',
  asset_id: gi.id,
  metadata: { series_id: SERIES_ID, source_drafts: orphans },
});
console.log('✓ Activity event logged.');
