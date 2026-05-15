// σ.2 probe — exercise PA skill tools end-to-end against the filesystem.
// 1. listSkills (no filter) → 2 ACTIVE skills (the two σ.1 seeds).
// 2. getSkill('comedy-shot-must-carry-gag') → returns frontmatter + body.
// 3. proposeSkill (without verbal approval) → verbal_approval_required.
// 4. proposeSkill (with approval) → creates DRAFT file.
// 5. approveSkill → flips to ACTIVE, selector probe confirms.
// 6. updateSkill → flips to DEPRECATED to keep test fixture out of prod.
// 7. Clean up: remove the probe skill dir.
import { findTool, openaiSchemas } from '../lib/concierge/tools';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const PROBE_SLUG = 'probe-skill-tool-fixture';
const ROOT = path.resolve(process.cwd(), '..', '.claude', 'skills');

function fakeCtx(approval: boolean) {
  // Minimal ToolContext stub. Mutating tools call checkVerbalApproval(recentTurns)
  // which scans for approval tokens. Pass an apparent-Director approval turn
  // if approval=true; empty turns array otherwise.
  const recentTurns = approval
    ? [
        {
          role: 'director' as const,
          content: 'одобряю — добавь это как правило',
          created_at: new Date().toISOString(),
          id: 'fake',
          thread_id: 'fake',
          tool_call_id: null,
          metadata: null,
        },
      ]
    : [];
  return {
    supabase: { from: () => ({ insert: async () => ({ error: null }) }) } as never,
    threadId: 'probe',
    mode: '1' as const,
    episodeId: null,
    directorUserId: null,
    recentTurns: recentTurns as never,
    cookieHeader: null,
    appOrigin: 'http://localhost:3000',
  };
}

async function call(name: string, args: Record<string, unknown>, approval: boolean) {
  const tool = findTool(name);
  if (!tool) throw new Error(`tool ${name} not registered`);
  return tool.execute(tool.parse(JSON.stringify(args)) as never, fakeCtx(approval) as never);
}

async function main() {
  console.log(`schemas registered: ${openaiSchemas.length}`);
  console.log(`  skill tools: ${openaiSchemas.filter((s) => /Skill/.test(s.function.name)).map((s) => s.function.name).join(', ')}`);

  console.log('\n[1] listSkills() →');
  console.log(JSON.stringify(await call('listSkills', {}, false), null, 2).slice(0, 500));

  console.log('\n[2] getSkill(comedy-shot-must-carry-gag) →');
  const got = await call('getSkill', { slug: 'comedy-shot-must-carry-gag' }, false);
  if (got.ok) console.log(`  loaded, body=${(got.data as { body: string }).body.length} chars`);
  else console.log('  FAIL:', got.error);

  console.log('\n[3] proposeSkill (no approval) →');
  const noApp = await call('proposeSkill', {
    slug: PROBE_SLUG,
    name: 'Probe Skill Fixture',
    description: 'Test fixture for σ.2 probe. Safe to delete.',
    body: 'This is a test skill that should never be ACTIVE in production.\n\nSafe to delete.',
    hard: false,
    applies_when: { agent: ['EXEC-SB'] },
  }, false);
  console.log('  ok=', noApp.ok, 'err=', noApp.ok === false ? noApp.error : 'n/a');

  console.log('\n[4] proposeSkill (with approval) →');
  const created = await call('proposeSkill', {
    slug: PROBE_SLUG,
    name: 'Probe Skill Fixture',
    description: 'Test fixture for σ.2 probe. Safe to delete.',
    body: 'This is a test skill that should never be ACTIVE in production.\n\nSafe to delete.',
    hard: false,
    applies_when: { agent: ['EXEC-SB'] },
  }, true);
  console.log('  ok=', created.ok, 'summary=', created.ok ? created.summary : created.error);

  console.log('\n[5] approveSkill(probe) →');
  const approved = await call('approveSkill', { slug: PROBE_SLUG }, true);
  console.log('  ok=', approved.ok, 'data=', approved.ok ? JSON.stringify(approved.data) : approved.error);

  console.log('\n[6] updateSkill → DEPRECATED →');
  const dep = await call('updateSkill', { slug: PROBE_SLUG, status: 'DEPRECATED' }, true);
  console.log('  ok=', dep.ok, 'summary=', dep.ok ? dep.summary : dep.error);

  // cleanup
  await fs.rm(path.join(ROOT, PROBE_SLUG), { recursive: true, force: true });
  console.log(`\n[cleanup] removed ${PROBE_SLUG} dir`);

  console.log('\nALL PROBES OK');
}

main().catch((e) => { console.error(e); process.exit(1); });
