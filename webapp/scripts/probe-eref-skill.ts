// Probe — does selectSkills() return Polina's new EREF skill for the EREF agent context?
import { selectSkills } from '../lib/skills/select-skills';
import { loadAgentSkills } from '../lib/agents/load-skills';

(async () => {
  const erefComedy = await selectSkills({ agent: 'EXEC-EREF', genre: 'comedy' });
  console.log(`[EXEC-EREF × comedy]    matches=${erefComedy.length}`);
  for (const s of erefComedy) {
    console.log(`  - ${s.slug} hard=${s.frontmatter.hard} status=${s.frontmatter.status} owner=${s.frontmatter.owner ?? '?'}`);
  }

  const erefAny = await selectSkills({ agent: 'EXEC-EREF' });
  console.log(`[EXEC-EREF × no-genre]  matches=${erefAny.length}`);
  for (const s of erefAny) console.log(`  - ${s.slug}`);

  const bundle = await loadAgentSkills({ agentId: 'EXEC-EREF', genre: 'comedy' });
  console.log(`\nbundle: count=${bundle.count}, block length=${bundle.block.length} chars`);
  console.log('--- first 600 chars of block ---');
  console.log(bundle.block.slice(0, 600));
})();
