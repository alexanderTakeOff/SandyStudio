// One-off: post the TD-38 smoke command for SH22 regeneration.
// Director approved this empirical re-run with the TD-38 fix landed
// (Reviewer Plan-blindness closed — reviewer now reads Plan body instead
// of stale storyboard test_plan).

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

const message = `Полина, TD-38 fix приземлён в коде (Reviewer Plan-blindness — reviewer теперь читает Plan body как source of truth вместо stale storyboard test_plan, который держал старый expected_gag «Sandy puddle»).

Пожалуйста запусти **regenerateImageFromPlan** для SS-S15-E01-A2-SC09-SH22 с **planAssetId = 7766bdea-86ec-4783-b404-ff2b12cf9187** (v05 plan, тот самый APPROVED без puddle/squash). 2 варианта.

Тест-гипотеза: с TD-38 reviewer теперь видит Plan v05 как spec → attempt 1 должен пройти APPROVE без retry cascade в puddle. Сравнение с предыдущим run'ом (REGENERATE_EXHAUSTED, asset 2dc35520-2dd5-41f4-afce-8bc23fe50c3c) покажет работает ли фикс.

Director kivnyot когда попросишь verbal approval.

После результата — короткий verdict: сработал ли TD-38 (attempt 1 APPROVE = да; cascade в puddle = нет; что-то посередине = частично, объясни).`;

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
      tag: 'td38-smoke',
    }),
  });
  const body = await res.json().catch(() => null);
  console.log('HTTP', res.status);
  console.log(JSON.stringify(body, null, 2));
  process.exit(res.ok ? 0 : 1);
})();
