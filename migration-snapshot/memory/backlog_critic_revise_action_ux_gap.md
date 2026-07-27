---
name: backlog_critic_revise_action_ux_gap
description: "При вердикте критика REVISE Директору непонятно что делать — кебаб на карточке критика (approve/reject) не запускает переписывание; правильное действие живёт на сториборде, но неочевидно. «Missing logic»."
metadata: 
  node_type: memory
  type: project
  originSessionId: 3a3a92ed-4dc1-4559-a22e-802ae01c200e
  modified: 2026-07-23T05:29:15.465Z
---

# Дефект UX: critic REVISE → непонятен порядок действий (E31 2026-07-22)

Директор при E31: «я вижу critic verdict REVISE. what should I pick in the critic's
kebab? approve all? reject? missing logic omg».

**Проблема:** когда критик (EXEC-CREAD readability / EXEC-WCHK continuity) возвращает
REVISE, ассет-сториборд уходит в REVISION, а карточка ревью критика (REV-*) показывает
кебаб approve/reject. Это сбивает:
- Критик УЖЕ вынес вердикт — его не нужно аппрувить/реджектить.
- Ни approve, ни reject на критике НЕ запускают переписывание сториборда. Пропавшее звено.
- Правильное действие — на СТОРИБОРДЕ (в REVISION): «Request Revision» авто-мёржит заметки
  критика (collectRefCriticNotes/collectShotCriticNotes + mergeRevisionNote) и пере-фаерит
  storyboarder. Но эта аффорданс неочевидна / теряется рядом с кебабом критика.

**Backend уже умеет правильно:** approve-route REQUEST_REVISION на сториборде тянет
персист-заметки критика и шлёт `sandystudio/exec-sb/create-storyboard` с revisionNote.
Дыра чисто во фронте/навигации — Директор не понимает КУДА нажать.

**Фикс (backlog):** на карточке-сториборде при REVISE показывать ОДНУ ясную пару действий:
- «Применить правку критика и переписать» (re-run storyboarder с смёрженными заметками), и
- «Аппрувнуть как есть» (override REVISE → дальше на EREF).
Кебаб approve/reject на карточке самого критика в этом контексте — убрать/переименовать
(вердикт критика не объект аппрува Директора). Показывать вердикт критика как read-only
баннер на сториборде + действия НА сториборде.

Родственно: [[backlog_polina_read_tools_gap]] (тот же класс — интерфейс не отражает где
реально принимается решение). Всплыло в ту же E31-сессию, где заведён episode.runtime_target.
