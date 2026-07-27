---
name: backlog_critic_approval_advances_without_artifact
description: "Директор аппрувит КАРТОЧКУ КРИТИКА (не артефакт); пайплайну нужен одобренный АРТЕФАКТ (script/storyboard). Аппрув критика → либо тихое ожидание+warning (не видно), либо критик-цепочка стартует следующий этап без одобренного артефакта → «no approved script/storyboard». Одна логика на script→SB и storyboard→EREF."
metadata: 
  node_type: memory
  type: project
  originSessionId: 3a3a92ed-4dc1-4559-a22e-802ae01c200e
  modified: 2026-07-23T05:37:18.889Z
---

# Ошибка логики: аппрув критика ≠ аппрув артефакта (E31 2026-07-22)

Директор (его формулировка): «writer written script → critic pass → director approve
critic → !critic starting storyboard! → fail (no approved script). Same logic storyboard →
ref artist». Поправил моё поверхностное объяснение — «там не всё так просто».

## Verified в коде (`lib/agents/next-events.ts`)
- Роутер аппрувов имеет заплатки **D5/D6/D7 (2026-07-09)** на обеих границах:
  - `REV-script_qa` approved → EXEC-SB: стр. 563–592. Если `SCR-script` НЕ одобрен
    (`!scrId`) → НЕ фаерит, пишет `pipeline/storyboard-waiting-script` (severity warning),
    ждёт. Аналогично ждёт каст.
  - `REV-world_check` approved → EXEC-EREF/MGEN: стр. 645–656. Если `STB-storyboard` НЕ
    одобрен → НЕ фаерит, пишет `pipeline/references-waiting-storyboard` (warning), ждёт.
- Т.е. по этому пути **краха нет** — тихое ожидание + warning-событие, которое Директор
  в UI **не видит** → воспринимается как «аппрувнул критика, ничего не произошло».

## Корень (глубже заплаток)
1. **Аппрувится НЕ ТОТ объект.** UI показывает карточку критика (REV-*) как аппрувимую.
   Одобрение критика бесполезно — гейт требует одобренный **артефакт** (SCR-script /
   STB-storyboard). Правильная модель: Директор аппрувит АРТЕФАКТ (гейтится PASS-ом критика),
   а вердикт критика — read-only сигнал, не объект аппрува. D6/D7 глушат краш, но модель кривая.
2. **Второй путь — критик-цепочка** (`factory.ts` `spec.nextEvent`, «all modes», стр. ~973–983;
   комментарии 906–911, 619–622) идёт МИМО роутера аппрувов. Инвариант «артефакт одобрен» на
   ней НЕ подтверждён — **надо дотрассировать factory.ts**: вероятно именно она стартует
   следующий EXECUTOR (storyboarder/EREF) на PASS критика без одобренного артефакта → тот самый
   наблюдаемый «no approved script/storyboard». (Runtime бьёт статику — Директор видел фейл.)
3. **Один паттерн на двух границах:** script→storyboard И storyboard→EREF.

## Фикс (backlog)
- **Модель аппрува:** Директор аппрувит АРТЕФАКТ, не критика. На карточке артефакта показывать
  вердикт критика read-only баннером + действия (Approve / Request-Revision) ЗДЕСЬ. Убрать
  approve/reject-кебаб с карточки критика (см. [[backlog_critic_revise_action_ux_gap]]).
- **Единый инвариант продвижения:** ОБА пути (computeNextEvents + factory.ts критик-цепочка)
  должны фаерить следующий EXECUTOR ТОЛЬКО при одобренном входном артефакте. Сейчас гейт есть
  лишь на одном пути. Свести к одному месту (anti-additivity) вместо D5/D6/D7-заплаток per-border.
- **Видимость ожидания:** `pipeline/*-waiting-*` warning поднять в UI (Director видит ПОЧЕМУ этап
  не стартовал), а не хоронить в ленте. Родственно [[backlog_observability_failures_not_surfaced]].

## Открытый вопрос (не закрывать без трассы)
Дотрассировать `factory.ts` `spec.nextEvent` критик-цепочки: фаерит ли она следующий EXECUTOR
на PASS критика без проверки аппрува артефакта. Если да — вот источник наблюдаемого краха.
Всплыло в E31-сессии (там же заведён episode.runtime_target). [[backlog_critic_revise_action_ux_gap]]
