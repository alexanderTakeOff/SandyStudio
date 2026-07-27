---
name: backlog_audience_quality_sensor
description: "P3 audience-analysis advisor — EXEC-ANAL as factory quality sensor in SCOUT mode; spec authored, build gated on re-consent + Director go"
metadata: 
  node_type: memory
  type: project
  originSessionId: 959b7a83-9d09-49f9-aa16-599829bcdf2f
---

Shorts-as-cross-cutting-concern roadmap (Director 2026-07-12): **short-creator ≠ отдельный агент**,
а сквозная забота по стадиям (доктрина `.claude/skills/shorts-longform-distribution/SKILL.md`).
Порядок **P1 → P2 → P3**:

- **P1 — воронка/мост: DONE** (master `8ca0d99`). URL родителя в описании шортса (у YouTube нет
  «related video» API-поля); хелпер `webapp/lib/agents/providers/short-linkage.ts`; 9 сирот
  забэкфиллены (`dist-shorts-backfill-parents.ts`); `episodes.metadata.youtube_short_id`.
- **P2 — гэг-нарезка (deferred, «check on new episode»)**: 3-5 самодостаточных гэг-шортсов 15-40с
  вместо кроп-всего-эпизода. Мышцы есть: резак `{startSec,endSec,overlayText}` + cumsum-таймкоды
  (`computeEffectivePlayback`) + `shot_role`/`key_beat` границы. Окна → `episodes.metadata.short_windows`.
- **P3 — audience analysis advisor: SPEC'D, NOT BUILT.** Доктрина = скилл
  `.claude/skills/audience-quality-sensor/SKILL.md` (owner EXEC-ANAL).

**Суть advisor'а (Director-правки, 6 штук):** это **сенсор №2 фабрики (КАЧЕСТВО)** в пару к
цене (`budget_log`). Первичный режим — **РАЗВЕДЧИК (EXPLORE), не оптимизатор (EXPLOIT)**: при малом N
«топ-треть» = шум, «делай больше про X» = локальный оптимум + смерть вариативности. Ключевое:
1) EXPLORE-first, EXPLOIT=режим №2 позже; 2) ось **«дыры»** (карта непройденного из таксономии ⊖
отгруженное) — карточка несёт гипотезу-тест, не вывод; 3) **порог молчания** N\* → флаги, не мандаты;
4) метрики в РАЗНЫХ ролях: completion (нормир. по длине)=качество, views=гейт экспозиции (ниже X →
confidence=null), вирусность=loops+shares (не лайки); 5) **просадка удержания → ШОТ** в центре
(калибровка прогноз↔реальность на уровне шота, тем же cumsum-таймкодом); 6) относительное сейчас +
крючок под гибрид-бенчмарки; совет всегда = ранжированная **гипотеза-паттерн**, не мандат/буквальщина.
Пороги N\*/X — config, не хардкод. Слой честности (confidence по N) — фундамент.

**Build gated on:** (1) **re-consent** scope `yt-analytics.readonly` — добавлен в
`webapp/scripts/youtube-consent.ts`; Director запускает `npx tsx scripts/youtube-consent.ts` из
`webapp/`, выбирает канал Sandy, аппрувит → токен авто-пишется в `.env.local` (нужен restart app).
(2) Director «go» на фазу audience-analysis. Идеация-в-дашборде — часть P3 (q11a: человек решает +
AI советует визуально; q10 all a+b+c; q12y episode-level сейчас, per-гэг после P2).

Сейчас: EXEC-ANAL = мок (`runner.ts` case, `mock-providers.ts:244`); `youtube.ts` без stats-read;
петли analytics→идеация нет. Плумбинг `publish→schedule-analytics→collect` (T+1h/24h/7d/30d) реальный.
[[backlog_shorts_ui_slicer]] · [[safe_and_sustainable]]
