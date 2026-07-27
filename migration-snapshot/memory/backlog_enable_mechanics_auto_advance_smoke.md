---
name: backlog_enable_mechanics_auto_advance_smoke
description: PINNED — the code-side auto-advance (MECHANICS_AUTO_ADVANCE) is BUILT but never smoke-tested; enable it at the START of a clean episode with pilots reserved.
metadata: 
  node_type: memory
  type: project
  originSessionId: d99aa03b-643f-4f06-b775-40a6bff6c573
---

**PINNED — не забыть (Director 2026-07-05, E16 run: «включай, а то потом опять забудешь»).**

Code-side auto-advance / reconciler был построен на автономном спринте **2026-07-04** (`reconcile.ts`, `reconcile-execute.ts`, `state-matrix.ts`, `production-plan.ts`, route `/api/episodes/{ep}/reconcile`, conductor-тул). Он **готов, но выключен** флагом `MECHANICS_AUTO_ADVANCE` (default OFF, в .env не выставлен) — ни разу не включался / не смоук-тестился (было $-gated). **Это и есть тот тест, ради которого затевался E16 — и который E16 пропустил** (флаг был OFF → прогон шёл по старому ручному пути).

**Почему нельзя просто включить на середине E16:** reconciler НЕ останавливается на рефах — по дизайну гонит `ref_plan→ref_image→shot_plan→video→stitch` до финалки. У E16 нет `production_plan` и нет `eref_pilot_shot_ids` → `isShotInPlan`=true для всех, `reservedShots`=пусто → включение = авто-аппрув всех REVIEW-рефов → каскад в ПЛАТНОЕ видео по всем шотам → stitch. Против цели «рефы→пауза» + деньги.

**Правильный смоук (сделать на СЛЕДУЮЩЕМ чистом эпизоде с НАЧАЛА):**
1. Записать `episodes.metadata.eref_pilot_shot_ids` (пилоты) — чтобы reconciler их НЕ авто-аппрувил (визуальный гейт Директора держится).
2. (Опц.) `episodes.metadata.production_plan.shots` — allowlist, если гоним не все шоты.
3. Выставить `MECHANICS_AUTO_ADVANCE=true`, рестарт сервера.
4. Прогнать эпизод: Полина даёт fanout → **код** (factory эмитит reconcile после каждого агента) сам гонит критик-PASS стадии, пилоты и reserved-гейты ждут Директора.
5. Наблюдать `reconcile/auto-approved` и `reconcile/halt` события.

## Approval-триаж модель (Director 2026-07-05, E16) — СВЕТОФОР, править reconciler под неё

Текущий `planReconcileActions` НЕВЕРЕН для Mode 3: он авто-аппрувит `ref_image`/`video` (STAGE_HAS_CRITIC=false) слепо — «нет критика → аппрувь». Директор: это только Mode 4. Правильная модель:

- 🟢 **GREEN = все критики PASS** → код принимает **оптом, без вопросов**. Mode 3: делегируется Полине (AI-EP) как «bulk-approve всё зелёное».
- 🟠 **ORANGE = REVISE / uncertain** → **Полина** разбирает поштучно (не код).
- 🔴 **RED = FAIL / критик отверг** → **человек-Директор**.
- **Mode 4** = код авто-пассит ВСЁ (включая критик-less артефакты). **Mode 3** = думает Полина, код штампует только однозначно-зелёное.
- **Визуальные артефакты без критика (ref_image, video)** — НЕ слепой код-аппрув: либо дать им image-quality критика (тогда в светофор), либо оставить пилот-гейтом (Полина/Директор глазами). Слепой штамп картинок = причина, по которой флаг на E16 = runaway в платное видео.
- **🔴 RED = attempts исчерпаны** (Director-уточнение): не одиночный FAIL, а когда авто-петля Designer↔критик (`PLAN_REGEN_CAP`, 2-3) + image-regen (`SHOT_REGEN_CAP`) исчерпала ретраи без PASS → эскалация человеку.
- **Критики ревьюят ПЛАН, не картинку:** EXEC-EPREV (Designer's Critic) + EXEC-CREAD (readability) → ref_plan → PASS/REVISE (REVISE гонит план v01→v02→v03). `ref_image` авто-критика НЕ имеет — решение на картинку v02 = визуальный гейт (Полина/Директор глазами). Значит reconciler'у нужно: план→светофор по критику; картинка→reserved визуальный гейт ИЛИ добавить авто image-critic.

Правка: `STAGE_HAS_CRITIC` для ref_image/video → убрать слепой auto-approve; ветку «no gating critic → approve» (reconcile.ts ~165-173) заменить на «→ Полина/Директор гейт». Код-approve строго на PASS-вердикте.

Связано: [[autonomous_factory_architecture_doctrine]] (мышца=код, вести≠чинить), DEF-02/DEF-05/DEF-06 в `docs/analysis/E16-run-defects.md` (почему ручной путь так больно шёл). Флаг-ридер: `mechanicsAutoAdvanceEnabled()` в `production-plan.ts`; решающее ядро `planReconcileActions` в `reconcile.ts`.
