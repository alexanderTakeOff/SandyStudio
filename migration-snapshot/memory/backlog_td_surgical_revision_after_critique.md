---
name: backlog-td-surgical-revision-after-critique
description: "Доктрина/TD — при переавторизации после вердикта критика продюсер-агент правит ТОЛЬКО отмеченное, остальное сохраняет дословно (не перекраивает). Director-flagged 2026-06-13."
metadata: 
  node_type: memory
  type: project
  originSessionId: 933fcbb8-b0a4-4eed-b4c1-4b543c51d981
---

# TD — surgical revision after critique (Director-flagged 2026-06-13, ВАЖНО системно)

Director: «при перезапуске и исправлении одного момента не перекроить остальное…
важно этот момент отразить СИСТЕМНО — по хирургическим правкам после критики».

## Проблема
Когда критик (CREAD/SREV/VPREV/EPREV/WCHK) возвращает REVISE, продюсер
(Storyboarder/Writer/Designer/Animator) переавторизует с НУЛЯ по revisionNote.
LLM-регенерация склонна перекроить ВСЁ: сменить нумерацию шотов, локации,
объект-референсы, выкинуть работающие гэги, поехать по таймингу/финалу — хотя
критик просил поправить лишь несколько битов. Один фикс рушит соседние.

E09 пример: CREAD REVISE на читаемость (добавить tiny-mess + false-success биты в
помеченные шоты). Ручной обход (Тео q13a): в revisionNote добавлен жёсткий
preservation-контракт — «применить ТОЛЬКО критерии CREAD; сохранить число/нумерацию
шотов, канон-локации (elevator_*_wall), объекты (button_cluster/floor_indicator/
call_button), работающие гэги, 55s, финал; не ре-архитектурить». Сработало как
разовая мера — нужно системно.

## Системный фикс (пост-прогон)
1. **Producer skills** (agents/exec/storyboarder.md + screenwriter/animator/
   episode_reference_designer): добавить правило «SURGICAL REVISION»: при наличии
   revisionNote меняй ТОЛЬКО то, что просит критик; всё остальное переноси
   ДОСЛОВНО (нумерация, канон-slug'и локаций/объектов, работающие биты, тайминг,
   финал). Это патч, не полный regen.
2. **Auto-revisionNote builder** (next-events.ts reviewNextEvent / критик-чейн,
   где acceptance_criteria → revisionNote): автоматически добавлять стандартный
   preservation-блок к каждому revisionNote (один хелпер, анти-аддитивно), чтобы
   защита работала и в авто-цикле (Mode 4), не только при ручном вызове.
3. Возможно — diff-проверка: после re-author сравнить структурные инварианты
   (shot count, location slugs, object refs) v_old vs v_new; если изменились
   вне scope критики — флагнуть.

Связь: усиливает [[critic_revision_cap_doctrine]] (cap на циклы) и
[[train_personnel_doctrine]]. Пост-прогонный батч с brief-authoring /
artdir-breakdown / polina-workplan / canon-preflight.

---

## ДОБАВЛЕНО 2026-06-13 (Director: «починить реагирование на замечания EPREV») — auto-re-author при REVISE в Mode 2

Отдельный (но смежный) баг: критик вернул REVISE → продюсер НЕ перезапускается
автоматически в Mode 2 → артефакт виснет в REVISION, никто не двигает. Это «не
ФИРИТСЯ» (а surgical-контракт выше — про «как» фирить, когда уже фирит).

Зафиксировано 3 проявления E09 2026-06-13 (все обходил ручным re-trigger):
- CREAD REVISE на раскадровку → SB не переавторизовался (Mode 2).
- EPREV REVISE на оба ref-plan (SH01/SH02) → Designer не переавторизовался → Reference Artist пуст.
- (WCHK — отдельный ordering-баг, см. [[backlog_td_wchk_two_bugs]].)

Корень: ветки auto-re-author в next-events.ts/критик-чейне гейтятся на AUTOTEST
(Mode 4); в Mode 2 REVISE только флипает статус в REVISION без re-fire продюсера.
ФИКС: критик REVISE должен авто-перезапускать продюсера (Designer/Storyboarder/
Animator) с acceptance_criteria как revisionNote ВО ВСЕХ режимах (или хотя бы
Mode 2/2.5), под cap'ом ([[critic_revision_cap_doctrine]]) — а не только в Mode 4.
Совмещается с surgical-preservation-контрактом выше (одно и то же место: auto-
revisionNote builder). Пост-прогон.

---

## ДОБАВЛЕНО 2026-06-19 (Director: «эффект регресса при регенерации» → нужен ОТДЕЛЬНЫЙ скилл по процессу внесения правок)

Director наблюдает СИСТЕМНО: **при регенерации очень часто возникает эффект РЕГРЕССА —
следующая редакция получается хуже / короче / ущербнее предыдущей.** Причина та же,
что в верхнем блоке: продюсер по revisionNote переписывает документ С НУЛЯ вместо
точечной правки. Поэтому нужна не только защита в revisionNote, а **выделенный скилл
по самому ПРОЦЕССУ внесения изменений в документ** (edit-in-place дисциплина):
- править ТОЛЬКО отмеченное критиком, всё прочее переносить дословно (байт-в-байт);
- НИКОГДА не пересоздавать заново — это патч поверх предыдущей APPROVED-версии, не новый драфт;
- после правки версия не должна быть короче/беднее предыдущей без явного указания (анти-регресс инвариант);
- diff-гейт: длина/число секций/инварианты не должны проседать вне scope правки → иначе флаг.

**Живой кейс E11 2026-06-19:** Director снял вердикт критика (slug-false-positives),
велел заменить ТОЛЬКО локацию (спальня→empty_background) и аппрувнуть. Я точечно
правил v05 и одобрил. Но Полинина recovery-петля сделала REQUEST_REVISION на мой
APPROVED v05 → Writer регенерил **v06 с нуля**: спальня вернулась (61 вхождение),
структура поехала. Классический регресс от полной регенерации. Пришлось переналожить
правку на v06 вручную. Скилл должен делать такой регресс невозможным by construction.

Адресат скилла: process-flavor (см. `~/.claude/rules/common/skill-creation.md`) — «document
surgical-revision protocol», применимый к Writer/Storyboarder/Designer/Animator, без
зашитой конкретики эпизода. Связь: [[critic_revision_cap_doctrine]], [[train_personnel_doctrine]].
