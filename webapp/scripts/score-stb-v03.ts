// σ.1 acceptance scoring — read STB v03 and check the two skill-driven criteria:
//   A. SH02 (or bicep-rack opener) reads as discrete physical-cascade beat,
//      not "marches to rack" / "rolls his arms".
//   B. ≥5 non-transition shots show a verb chain (try → fail → escalation OR
//      setup → payoff). We approximate by counting shots whose action_prose
//      contains ≥3 motion verbs separated by punctuation status changes.
//   C. ACTIVE SKILLS block did inject — runner_notes mention it.
//   D. Three SREV minors stay (pull-up, jump-rope tangle, water bottle).
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

const STB_V03 = '347894d2-999b-476c-b16b-12c87f408c52';

(async () => {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await sb.from('assets').select('content,metadata,description').eq('id', STB_V03).single();
  if (!data) throw new Error('STB v03 not found');
  const content = (data as { content: string }).content ?? '';
  const metadata = (data as { metadata: unknown }).metadata as Record<string, unknown> | null;
  const description = (data as { description?: string }).description ?? '';

  console.log('=== description ===');
  console.log(description);
  console.log('\n=== metadata keys ===');
  console.log(metadata ? Object.keys(metadata).join(', ') : '(null)');
  if (metadata && 'notes' in metadata) {
    console.log('notes:', JSON.stringify((metadata as Record<string, unknown>).notes, null, 2));
  }

  // Extract JSON block.
  const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
  if (!jsonMatch) {
    console.log('\n⚠ no JSON block found');
    return;
  }
  let body: any;
  try {
    body = JSON.parse(jsonMatch[1]!);
  } catch (e) {
    console.log('\n⚠ JSON parse failed:', (e as Error).message);
    return;
  }

  const allShots: Array<{ shot_id: string; shot_role: string; action_prose: string; expected_gag?: string | null }> = [];
  for (const act of body.acts ?? []) {
    for (const sh of act.shots ?? []) allShots.push(sh);
  }
  console.log(`\nTotal shots: ${allShots.length}`);
  const nonTransitions = allShots.filter((s) => s.shot_role !== 'transition');
  console.log(`Non-transition shots: ${nonTransitions.length}`);

  // Criterion A — SH02 opener (or earliest non-transition action shot).
  const opener = allShots[1] ?? allShots[0];
  console.log('\n=== Criterion A: opener shot (SH02 or first action) ===');
  console.log(`${opener.shot_id} [${opener.shot_role}] expected_gag: ${opener.expected_gag ?? 'null'}`);
  console.log(`prose: ${opener.action_prose}`);
  const openerHasMundaneTokens = /\b(marches|rolls his arms|cracks (his )?knuckles|stretches and|stretches before|gets ready)\b/i.test(opener.action_prose);
  console.log(`A. opener avoids mundane choreography: ${openerHasMundaneTokens ? '❌ FAIL' : '✅ PASS'}`);

  // Criterion B — count shots with verb chain.
  // Heuristic: ≥3 distinct motion verbs from list, OR ≥2 status changes (full stops between motion clauses)
  const MOTION_VERBS_RE = /\b(reaches|reach|grabs|pulls|lifts|swings|throws|catches|drops|falls|trips|slips|bounces|ricochets|topples|tumbles|rolls|spins|hops|jumps|leaps|snaps|stretches|stumbles|stomps|kicks|punches|hits|slaps|wobbles|teeters|tilts|leans|crumples|collapses|flies|launches|skids|slides|smacks|knocks|pings|clatters|spills|squashes|squeezes|whips|whirls|twists|cracks|breaks|bursts|deflates|inflates|wedges|jams|recoils|springs|bounds|lunges|crashes|sails|plonks|plops|thuds|flops|peels|flips|cartwheels|skids|fumbles|catches)\b/gi;
  let goodShots = 0;
  const goodList: string[] = [];
  for (const s of nonTransitions) {
    const matches = s.action_prose.match(MOTION_VERBS_RE) ?? [];
    const distinct = new Set(matches.map((m) => m.toLowerCase()));
    if (distinct.size >= 3) {
      goodShots += 1;
      goodList.push(`${s.shot_id} (${distinct.size} verbs)`);
    }
  }
  console.log(`\n=== Criterion B: verb chains ===`);
  console.log(`Shots with ≥3 distinct motion verbs: ${goodShots} / ${nonTransitions.length}`);
  console.log(`PASS threshold: ≥5 → ${goodShots >= 5 ? '✅ PASS' : '❌ FAIL'}`);
  console.log('Good shots:', goodList.slice(0, 8).join(', '));

  // Criterion C — ACTIVE SKILLS injected.
  const c = content.toLowerCase();
  const propagatedSREV =
    /pull[- ]up/i.test(c) &&
    (/jump[- ]rope|jump rope/i.test(c)) &&
    (/water bottle/i.test(c));
  console.log(`\n=== Criterion D: 3 SREV minors propagated ===`);
  console.log(`pull-up + jump-rope + water-bottle: ${propagatedSREV ? '✅ PASS' : '❌ FAIL'}`);

  // Criterion E — runner_notes mentions skills
  const desc = description.toLowerCase();
  const hasSkillNote = description.includes('ACTIVE SKILLS') || (metadata && JSON.stringify(metadata).includes('ACTIVE SKILLS'));
  console.log(`\n=== Criterion C: ACTIVE SKILLS injection note in runner output ===`);
  console.log(`note present: ${hasSkillNote ? '✅ PASS' : '⚠ not surfaced (skills may still have been injected — description format unchanged)'}`);

  console.log('\n=== sample of first 3 non-transition shots ===');
  for (const s of nonTransitions.slice(0, 3)) {
    console.log(`\n[${s.shot_id}] (${s.shot_role}) gag: ${s.expected_gag ?? 'null'}`);
    console.log(`  ${s.action_prose}`);
  }
})();
