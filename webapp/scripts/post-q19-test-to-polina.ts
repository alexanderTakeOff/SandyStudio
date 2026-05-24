// One-off: post the q19 SH19 absolute-slotting test directive to Polina's
// thread via /api/team-chat/post. Director already approved the test
// (q19a, ~$0.08 budget, 2 variants).
//
// Path: claude_message → exec-pa-react auto-fires → Polina sees + asks
// Director for verbal approval → calls regenerateRefPlan with this
// verbatim revisionNote → Designer authors v02 Plan with the absolute-
// slotting block embedded as HARD CRITERION.

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

const revisionNote = `HARD CRITERION — absolute spatial composition (no full-room bedroom layout):

This shot is a MEDIUM tight on the vanity-corner zone, NOT a wide bedroom view.

[Absolute frame slots]
- FRAME CENTRE (occupying ~30% of horizontal width): the front corner of the mirror_vanity / trumeau, including the oval mirror swinging into flat alignment and the cabinet body below.
- FRAME LEFT-THIRD: sandy_hourglass — eyes popped wide, one mitten finger raised. Sandy occupies the left vertical band of the composition.
- FRAME RIGHT-THIRD: anvil — RIGHT arm extended forward with one finger touching the vanity corner; bored half-lidded expression.

[What MUST NOT be visible]
- The bed must NOT be visible in the frame at all.
- The bookcase must NOT be visible.
- The desk must NOT be visible.
- The doorway must NOT be visible.
- The yellow rug visible ONLY as a partial strip below characters' feet at frame bottom.
- The cream wall visible ONLY as a backdrop slice immediately behind the vanity.

[Subject hierarchy — STRICT]
1. Primary: vanity front corner + mirror in motion (centre).
2. Mandatory secondary A: sandy_hourglass (left third).
3. Mandatory secondary B: anvil (right third).

[Camera framing]
Medium shot at eye-level to the vanity's mid-height. Landscape 16:9. Triadic close stage: Sandy-LEFT, vanity-CENTRE, Anvil-RIGHT. Background room context intentionally cropped — frame reads as a tight gag-stage, not a bedroom panorama.

Causality must be unambiguous: Anvil's RIGHT-finger touches the vanity corner → the vanity rotates into alignment → Sandy reacts.

Re-derive — do not minimally tweak the v01 Plan. The v01 produced a default full-bedroom layout (bed visible, full room shown), which is wrong for a MEDIUM shot. The new v02 must visibly differ by cropping room context out and slotting Sandy/vanity/Anvil into absolute frame positions.`;

const message = `Полина, эмпирический тест по q19a (Director подтвердил, ~$0.08, 2 варианта).

Гипотеза: gpt-image-2 МОЖЕТ слушать text prompt при абсолютной spatial-разметке + subject hierarchy + HARD CRITERION framing — так, как сработало в SH20 v02. Тестируем на SH19 (Anvil-finger-tap gag): v01 Plan уже декларировал «Sandy left, Anvil right», но IMG всё равно вышел default-bedroom-layout. Если новый v02 c absolute-slotting директивой даст другой ракурс — гипотеза подтверждена, пишу gpt-image-2-specific Designer skill.

Пожалуйста вызови regenerateRefPlan для SS-S15-E01-A2-SC09-SH19 со следующим revisionNote ДОСЛОВНО (это критически важно — никаких перефразов или своих интерпретаций, copy-paste весь блок между маркерами как есть):

==BEGIN_VERBATIM_REVISION_NOTE==
${revisionNote}
==END_VERBATIM_REVISION_NOTE==

Используй тело между маркерами (без самих маркеров «==BEGIN==» и «==END==») как значение revisionNote параметра.

После создания v02 Plan — DRAFT, Director проверит. Когда approve — запусти regenerateImageFromPlan для нового planAssetId, 2 варианта. Цель — сравнить v01 IMG (текущий bedroom-default) с v02 IMG (ожидаемый slotted MEDIUM) визуально.

Director kivnet когда ты попросишь verbal approval. Жду.`;

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
      tag: 'q19-test',
    }),
  });
  const body = await res.json().catch(() => null);
  console.log('HTTP', res.status);
  console.log(JSON.stringify(body, null, 2));
  process.exit(res.ok ? 0 : 1);
})();
