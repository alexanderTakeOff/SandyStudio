// One-off: SH01 plan v02 used seedance-fast because seedance-standard
// wasn't in VANIM allowlist. Director directive q49b: fix allowlist
// (done, commit pending) + push another revision so Animator re-writes
// with seedance-standard for the character-heavy push gag.

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

const message = `Полина, allowlist fix приземлён (q49b). VANIM_PROVIDER_ALLOWLIST теперь содержит \`seedance-standard\` — Animator может его выбирать.

Действие: requestRevision на SH01 plan v02 (asset \`18785562-e726-45e1-943c-4635b50ceb27\`) с этим revisionNote (ДОСЛОВНО):

==BEGIN_VERBATIM_REVISION_NOTE==
HARD CRITERION — Director directive 2026-05-24 (q49b):

Switch provider.id from \`seedance-fast\` to **\`seedance-standard\`**. Reason: VANIM_PROVIDER_ALLOWLIST has been updated; \`seedance-standard\` is now permitted. Director chose Seedance Standard tier specifically for SH01 because:
- SH01 is character-heavy (Sandy push trumeau wide shot) — character motion fidelity matters more than cost
- Standard tier ($0.3024/s) handles complex character motion + bedroom canon better than Fast ($0.2419/s)
- Episode-level visual consistency directive still applies — Seedance variant, not Veo

Plan body must:
- declare \`provider.id = "seedance-standard"\` with provider.rationale citing Director directive for character-heavy shot
- declare \`quality_tier = "standard"\` so runner extracts and forces standard tier in the actual Seedance API call (runner.ts line 1715 wiring)
- preserve all other v02 content (micro-shift motion contract, beat timing, bedroom canon, Sandy identity)

Re-derive only the provider section + quality_tier. Do not regenerate other parts of the Plan that already met Director's previous criteria.
==END_VERBATIM_REVISION_NOTE==

Передай ДОСЛОВНО. Animator увидит как HARD CRITERION block.

После того как v03 plan пришёл — авто-chain (vprev + gagad) → REVIEW → Director смотрит → APPROVE → exec-vgen/start с planAssetId → seedance-standard video.

Director kivnyot когда попросишь verbal approval.`;

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
      tag: 'sh01-v03-seedance-standard',
    }),
  });
  const body = await res.json().catch(() => null);
  console.log('HTTP', res.status);
  console.log(JSON.stringify(body, null, 2));
  process.exit(res.ok ? 0 : 1);
})();
