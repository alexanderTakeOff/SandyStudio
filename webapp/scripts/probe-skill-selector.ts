// φ.3 probe — verify the two-step skill API after the σ→φ migration.
// Expectations after deprecating the 3 σ atomic seeds and creating 2 broad
// capability skills (storyboarder-situational-comedy + eref-shot-composition):
//
//   EXEC-SB × comedy            → 1 ACTIVE manifest entry (storyboarder-situational-comedy)
//   EXEC-EREF (no genre)        → 1 ACTIVE manifest entry (eref-shot-composition)
//   EXEC-VGEN (any)             → 1 ACTIVE manifest entry (seedance-prompting)
//   EXEC-PUB × documentary      → 0 ACTIVE manifest entries
//   All 3 σ seed slugs          → present on disk but status=DEPRECATED so
//                                 the selector excludes them
import {
  listSkillManifests,
  selectSkills,
  listAllSkills,
} from '../lib/skills/select-skills';
import {
  getAgentSkillManifest,
  loadAgentSkillBodies,
  composeSkillSelectionPrompt,
  composeActivePlaybooksBlock,
} from '../lib/agents/load-skills';

async function main() {
  // 1) Full disk scan — confirm σ seeds DEPRECATED, new broad skills ACTIVE.
  const all = await listAllSkills();
  console.log(`Total skill files on disk: ${all.length}`);
  for (const s of all) {
    console.log(`  - ${s.slug.padEnd(48)} status=${s.frontmatter.status} hard=${s.frontmatter.hard}`);
  }

  // 2) Selector — manifest path (the lazy-load API).
  const sbComedyManifest = await listSkillManifests({ agent: 'EXEC-SB', genre: 'comedy' });
  console.log(`\n[EXEC-SB × comedy]    manifest entries=${sbComedyManifest.length}`);
  for (const m of sbComedyManifest) {
    console.log(`  - ${m.slug} (${m.bodyChars} body chars)`);
  }

  const erefManifest = await listSkillManifests({ agent: 'EXEC-EREF' });
  console.log(`\n[EXEC-EREF × any]     manifest entries=${erefManifest.length}`);
  for (const m of erefManifest) {
    console.log(`  - ${m.slug} (${m.bodyChars} body chars)`);
  }

  const vgenManifest = await listSkillManifests({ agent: 'EXEC-VGEN' });
  console.log(`\n[EXEC-VGEN × any]     manifest entries=${vgenManifest.length}`);
  for (const m of vgenManifest) {
    console.log(`  - ${m.slug} (${m.bodyChars} body chars)`);
  }

  const irrelevant = await selectSkills({ agent: 'EXEC-PUB', genre: 'documentary' });
  console.log(`\n[EXEC-PUB × documentary] selector hits=${irrelevant.length} (expect 0)`);

  // 3) End-to-end two-step helper trace — Storyboarder picks bodies.
  console.log(`\n=== Two-step helper trace (EXEC-SB × comedy) ===`);
  const manifestResult = await getAgentSkillManifest({ agentId: 'EXEC-SB', genre: 'comedy' });
  console.log(`Step 1 — manifest count=${manifestResult.count}, total body chars=${manifestResult.totalBodyChars}`);

  const selectionPrompt = composeSkillSelectionPrompt(manifestResult.available, 'Storyboarding SS-S01-E22 act 1, comedy');
  console.log(`Step 1 prompt length: ${selectionPrompt.length} chars`);
  console.log(`Step 1 prompt preview (first 400):\n${selectionPrompt.slice(0, 400)}\n...`);

  const bodies = await loadAgentSkillBodies(manifestResult.available.map((m) => m.slug));
  console.log(`Step 2 — bodies loaded=${bodies.loaded.length}, total chars=${bodies.totalChars}, truncated=${bodies.truncatedCount}`);

  const playbookBlock = composeActivePlaybooksBlock(bodies.loaded);
  console.log(`Active Playbooks block length: ${playbookBlock.length} chars`);
  console.log(`Active Playbooks block preview (first 400):\n${playbookBlock.slice(0, 400)}\n...`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
