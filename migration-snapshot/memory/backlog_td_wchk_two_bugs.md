---
name: backlog-td-wchk-two-bugs
description: "Два WCHK-бага из E09 2026-06-13 — (1) ordering: критик стреляет до аппрува раскадровки → precondition fail, не перезапускается; (2) verdict-stamp: content=PASS vs metadata.verdict=REVISE."
metadata: 
  node_type: memory
  type: project
  originSessionId: 933fcbb8-b0a4-4eed-b4c1-4b543c51d981
---

# TD — два бага EXEC-WCHK (Continuity Critic), E09 2026-06-13

## BUG-1 — ordering: WCHK стреляет до аппрува, не перезапускается → застревание
При READABILITY_GATE_ENABLED on WCHK дёргается от CREAD PASS. CREAD читает
раскадровку в REVIEW (ДО аппрува Директора) → его выстрел в WCHK прилетает, когда
доска ещё не APPROVED → WCHK падает «APPROVED STB-storyboard not found». Аппрув
раскадровки WCHK повторно НЕ дёргает (STB-ветка computeNextEvents при
readability-gate on не пушит WCHK). Итог: WCHK никем не запущен, E09 застрял
(обошёл ручным триггером).
Director-инстинкт: «сначала проверяет сотрудник (WCHK), потом апрувит директор».
ФИКС: выровнять WCHK с CREAD — читать REVIEW-доску (снять APPROVED-precondition),
давать continuity-вердикт ДО аппрува; Директор жмёт «утвердить» видя И читаемость,
И континьюити. (Либо: аппрув раскадровки (ре)дёргает WCHK.)
Доброкач. premature-fail рисуется красным крестиком как блокер — вводит в
заблуждение (UX): premature-fire не должен выглядеть как fail.

## BUG-2 — verdict stamp mismatch: content=PASS vs metadata=REVISE
В REV-world_check разошлись витрина и хранилище:
- `content` (UI-отчёт): Verdict PASS, все шоты PASS, issues [].
- `metadata.verdict` + `description`: REVISE («ledger OK (pool 63)»).
Детерминированный ledger (major_pool 63) застампил metadata в REVISE, а LLM-отчёт
= PASS; не сведены. Director видел PASS (правильно), аппрувнул; Тео ошибочно
доложил REVISE с metadata. В Mode 4 (авто) metadata.verdict=REVISE мог бы
авто-бацнуть раскадровку вопреки PASS-отчёту.
ФИКС: единый источник вердикта в continuity-check.ts — стамп metadata.verdict =
markdown-вердикт; проверить ledger major_pool→verdict (pool 63 при «ledger OK»
подозрительно — порог/подсчёт). Урок Тео: читать вердикт из content, не metadata.

Контекст: пост-прогонный батч. Лог: `C:\SandyStudio\docs\e09-supervision-log.md`.
Связь: [[critic_revision_cap_doctrine]], [[backlog_td_surgical_revision_after_critique]].
