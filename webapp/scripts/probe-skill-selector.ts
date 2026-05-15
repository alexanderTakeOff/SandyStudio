// σ.1 probe — verify selectSkills() finds both seed skills for the
// Storyboarder × comedy context, and zero for an irrelevant context.
import { selectSkills } from '../lib/skills/select-skills';
import { loadAgentSkills } from '../lib/agents/load-skills';

async function main() {
  const sbComedy = await selectSkills({ agent: 'EXEC-SB', genre: 'comedy' });
  console.log(`[EXEC-SB × comedy]    matches=${sbComedy.length}`);
  for (const s of sbComedy) {
    console.log(`  - ${s.slug} hard=${s.frontmatter.hard} status=${s.frontmatter.status}`);
  }

  const writerComedy = await selectSkills({ agent: 'EXEC-SW', genre: 'comedy' });
  console.log(`[EXEC-SW × comedy]    matches=${writerComedy.length} (expect ≥1 — comedy genre rule should hit Writer too)`);
  for (const s of writerComedy) {
    console.log(`  - ${s.slug}`);
  }

  const sbNoGenre = await selectSkills({ agent: 'EXEC-SB' });
  console.log(`[EXEC-SB × no-genre]  matches=${sbNoGenre.length} (expect 1 — only creator skill, genre rule needs genre ctx)`);
  for (const s of sbNoGenre) {
    console.log(`  - ${s.slug}`);
  }

  const irrelevant = await selectSkills({ agent: 'EXEC-PUB', genre: 'documentary' });
  console.log(`[EXEC-PUB × documentary] matches=${irrelevant.length} (expect 0)`);

  const bundle = await loadAgentSkills({ agentId: 'EXEC-SB', genre: 'comedy' });
  console.log('\n=== formatted block (first 800 chars) ===');
  console.log(bundle.block.slice(0, 800));
  console.log(`...\ntotal block length: ${bundle.block.length} chars, ${bundle.count} skills, ${bundle.truncatedCount} truncated`);
}

main().catch((e) => { console.error(e); process.exit(1); });
