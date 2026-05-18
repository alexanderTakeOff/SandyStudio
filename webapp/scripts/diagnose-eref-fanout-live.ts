// Live diagnosis for fanout-trigger run that started 13:54:21.
// Two questions, two answers, no predictions:
//
//  Q1. Are the ACTIVE SKILLS actually in the prompt of newly-generated
//      shots? Look at metadata.shot_reference.generation_history[].prompt
//      for any new EREF asset and grep for "ACTIVE SKILLS" / "consecutive".
//
//  Q2. Is Polina firing auto-react on new pipeline_event turns?
//      Look at concierge_turns: how many role=system kind=pipeline_event
//      after 13:54, and how many of them have metadata.acked_by_assistant=true.
//      If trigger fires but auto-react never fired — wiring broken.
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
const EP = '21f7bd6a-f52c-4ae0-bd47-06ff328ec6e7';
const FANOUT_START_ISO = '2026-05-15T13:54:00Z';
const THREAD = 'bdbdafcf-2a38-4c58-b706-362fd7ff0f16';

(async () => {
  console.log('═══════════════════════ Q1: ACTIVE SKILLS in prompts? ═══════════════════════');
  // Get all EREF assets created after fanout start.
  const { data: newAssets } = await sb.from('assets')
    .select('id,filename,status,version,created_at,metadata')
    .eq('episode_id', EP)
    .like('file_type', 'IMG-episode_ref%')
    .gte('created_at', FANOUT_START_ISO)
    .order('created_at', { ascending: true });
  console.log(`new EREF assets since 13:54: ${newAssets?.length ?? 0}`);
  for (const a of newAssets ?? []) {
    const sid = ((a.metadata as { shot_reference?: { shot_id?: string } } | null)?.shot_reference?.shot_id) ?? '?';
    const history = ((a.metadata as { shot_reference?: { generation_history?: Array<{ prompt?: string }> } } | null)?.shot_reference?.generation_history) ?? [];
    console.log(`\n  ${a.created_at?.slice(11, 19)} v${a.version} ${a.status.padEnd(10)} ${sid}`);
    console.log(`  filename: ${a.filename?.slice(0, 75)}`);
    console.log(`  generation_history entries: ${history.length}`);
    for (let i = 0; i < history.length; i++) {
      const p = history[i]?.prompt ?? '';
      const hasSkillsBlock = /## ACTIVE SKILLS/i.test(p);
      const hasCameraVariety = /consecutive|camera angle|three-quarter|side vs|wide vs/i.test(p);
      const hasComedy = /comedy-shot|try.*fail.*escalation|punchline/i.test(p);
      console.log(`    gen[${i}] prompt ${p.length} chars · ACTIVE SKILLS=${hasSkillsBlock} · cameraVariety=${hasCameraVariety} · comedyRule=${hasComedy}`);
      if (i === 0) {
        // print first 400 chars of first prompt
        console.log(`    >>> first 400 chars: ${p.slice(0, 400).replace(/\n/g, ' ⏎ ')}`);
      }
    }
  }

  console.log('\n\n═══════════════════════ Q2: Polina auto-react firing? ═══════════════════════');
  const { data: turns } = await sb.from('concierge_turns')
    .select('id,role,event_type,content,metadata,created_at')
    .eq('thread_id', THREAD)
    .gte('created_at', FANOUT_START_ISO)
    .order('created_at', { ascending: true });
  let pipelineEventCount = 0;
  let claudeMessageCount = 0;
  let ackedCount = 0;
  let assistantAutoReactCount = 0;
  let assistantUserDriven = 0;
  let assistantTotal = 0;
  for (const t of turns ?? []) {
    const m = (t.metadata ?? {}) as Record<string, unknown>;
    const kind = m.kind as string | undefined;
    const source = m.source as string | undefined;
    if (t.role === 'system' && kind === 'pipeline_event') {
      pipelineEventCount += 1;
      if (m.acked_by_assistant === true) ackedCount += 1;
    }
    if (t.role === 'system' && kind === 'claude_message') claudeMessageCount += 1;
    if (t.role === 'assistant') {
      assistantTotal += 1;
      if (source === 'auto_react') assistantAutoReactCount += 1;
      else assistantUserDriven += 1;
    }
  }
  console.log(`since fanout start:`);
  console.log(`  pipeline_event turns:        ${pipelineEventCount}`);
  console.log(`  claude_message turns:        ${claudeMessageCount}`);
  console.log(`  pipeline_event acked:        ${ackedCount} / ${pipelineEventCount}`);
  console.log(`  assistant turns total:       ${assistantTotal}`);
  console.log(`    of which auto_react:       ${assistantAutoReactCount}`);
  console.log(`    of which user-driven:      ${assistantUserDriven}`);

  console.log('\n— pipeline_event turns w/ acked flag —');
  for (const t of (turns ?? []).filter((x) => x.role === 'system' && ((x.metadata as { kind?: string } | null)?.kind === 'pipeline_event'))) {
    const m = (t.metadata ?? {}) as Record<string, unknown>;
    console.log(`  ${t.created_at?.slice(11, 19)} acked=${m.acked_by_assistant === true} severity=${m.severity ?? '?'}  ${(t.content ?? '').slice(0, 80).replace(/\n/g, ' ')}`);
  }
})();
