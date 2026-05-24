// One-off: Director directive 2026-05-24 — Seedance for entire SS-S15-E01.
// SH02 plan already Seedance → approve. SH01 plan was veo-standard →
// revision with two requirements: provider switch + micro-shift motion.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  for (const raw of readFileSync(envPath, 'utf-8').split('\n')) {
    const l = raw.trim();
    if (!l || l.startsWith('#')) continue;
    const eq = l.indexOf('=');
    if (eq <= 0) continue;
    let v = l.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[l.slice(0, eq).trim()] = v;
  }
}

const token = process.env.TEAM_CHAT_TOKEN?.trim();
if (!token) {
  console.error('TEAM_CHAT_TOKEN missing in .env.local');
  process.exit(1);
}

const message = `Полина, Director решил по обоим планам:

**SH02 (asset \`56655d3b-89a2-4d54-b525-8e51177f1192\`)** — APPROVE как есть. План уже на Seedance, твой camera-lock caveat валиден но Director берёт под empirical risk (если динамика потеряется vs legacy, перегенерим точечно). Запусти approveAsset + image regen начнётся автоматически.

**SH01 (asset \`da44f460-55db-4bf3-85a2-ad5439a8368c\`)** — REVISION с двумя требованиями (передай Animator'у дословно):

==BEGIN_VERBATIM_REVISION_NOTE==
HARD CRITERION — Director directive 2026-05-24:

1. PROVIDER LOCK: switch from veo-standard to **seedance-standard** (or seedance-fast). Reason: Director decided to use a single provider (Seedance) for the entire SS-S15-E01 episode for visual consistency. Veo and Seedance produce visibly different output styles; mixing them across shots creates a jarring episode-level inconsistency. All shots in this episode must use Seedance variant.

2. MOTION CONTRACT: replace «trumeau does not move» (current Plan) with «trumeau barely shifts under impossible pressure — less than 1-2 mm visible micro-shift, almost immovable but enough to motivate the scratch line forming in SH02». Reason: SH01 currently says zero movement, SH02 shows a scratch forming — between adjacent shots this creates a causal disconnect (where did the scratch come from if nothing moved?). Need to preserve the visual gag of «impossible effort, near-zero result» without breaking SH01→SH02 causality.

3. BEAT TIMING (5s breakdown): wind-up (0.5s) → push/strain (2s) → imperceptible micro-shift + scratch beginning (1.5s) → held strain reaction (1s). The micro-shift must be visually subtle — almost imperceptible but clearly happening, so SH02 macro-scratch reads as cause-effect.

Re-derive — do not minimally tweak the v01 Plan. The new v02 Plan must:
- declare provider.id = "seedance-fal-img2vid" with provider.rationale citing the episode-level Director directive
- prompt body explicitly mention «vanity barely shifts under impossible pressure — less than 1-2 mm visible micro-shift»
- camera section retains the established «static wide three-quarter bedroom» framing
- preserve all bedroom canon (bed, rug, bookshelf, desk, teal lamp, vanity)
- preserve Sandy identity description
==END_VERBATIM_REVISION_NOTE==

Используй тело между маркерами (без самих маркеров) как revisionNote параметра. Передай ДОСЛОВНО — Animator увидит как HARD ACCEPTANCE CRITERIA block в своём prompt'е.

Действия по порядку:
1. requestRevision на SH01 Plan asset \`da44f460-...\` с этим revisionNote → exec-vanim/plan авто-fire с v02
2. Когда v02 пришёл — авто-fire vprev + (comedy) gagad критики
3. v02 SPC-shot_plan в REVIEW → Director смотрит → APPROVE
4. SPC-shot_plan.APPROVED → exec-vgen/start с planAssetId → seedance video

Parallel: approveAsset на SH02 Plan \`56655d3b-...\` сейчас → image regen начнётся автоматически.

Director kivnyot когда ты попросишь verbal approval.`;

(async () => {
  const res = await fetch('http://localhost:3000/api/team-chat/post', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      content: message,
      author: 'Тео',
      tag: 'sh01-revision-sh02-approve',
    }),
  });
  const body = await res.json().catch(() => null);
  console.log('HTTP', res.status);
  console.log(JSON.stringify(body, null, 2));
  process.exit(res.ok ? 0 : 1);
})();
