// One-off: instruct Polина to fire EXEC-VANIM for SH01+SH02 instead of
// requesting revision on the legacy-generated VID-shot assets. Director
// approved this path (q42a) — ANIMATOR_CHAIN now wired so Plan-driven
// path will produce a SPC-shot_plan for each shot, which Director will
// review before video regen.

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

const message = `Полина, по твоей q2 — НЕ делай revision на VID-shot для SH01/SH02.

Контекст: animatic approve улетел в legacy path (ANIMATOR_CHAIN ещё не был enabled на момент approval). Сейчас ANIMATOR_CHAIN_ENABLED=true приземлён в master (commit f7f6d28) — правильный путь теперь plan-driven через EXEC-VANIM, не revision на готовый VID-shot.

Конкретное действие:

Для SS-S15-E01-A1-SC01-SH01 и SS-S15-E01-A1-SC01-SH02 запусти EXEC-VANIM напрямую — две отдельных задачи. Используй \`triggerAgent\` (или эквивалент в твоём токсете для firing Inngest events).

Цель: Animator напишет SPC-shot_plan для каждого шота со своим решением motion-prompt'а:
- SH01 (wide establishing, Sandy push trumeau): beat-timed wind-up → push → tiny shift → held exertion; no character canon dump, focus on motion structure
- SH02 (prop-only macro vanity foot + scratch): **НЕТ Sandy character canon в prompt** (это prop-only shot), close-up lock, запрет на zoom-out/cutaway

После того как Animator сгенерит SPC-shot_plan для каждого шота:
- exec-vprev (Critic) авто-fire'нет
- если comedy genre — GAGAD review
- DRAFT SPC-shot_plan → REVIEW → Director смотрит план → APPROVE
- approve → exec-vgen/start с planAssetId → plan-driven video (с end_image/seed/quality_tier из Plan body)

Legacy VID-shot'ы (c564e296-... и ddeaaed5-...) — пока не трогай, они станут baseline для сравнения «legacy vs plan-driven». Если plan-driven версии выйдут лучше, старые потом перезапишем через v02.

Director подтвердит verbal approval когда ты попросишь на triggerAgent.`;

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
      tag: 'animator-chain-trigger',
    }),
  });
  const body = await res.json().catch(() => null);
  console.log('HTTP', res.status);
  console.log(JSON.stringify(body, null, 2));
  process.exit(res.ok ? 0 : 1);
})();
