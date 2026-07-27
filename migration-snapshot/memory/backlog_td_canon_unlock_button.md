---
name: backlog_td_canon_unlock_button
description: TD after E16 — у канонов (LOCKED SBL) нет кнопки UNLOCK в Library UI; добавить с ворнингом.
metadata: 
  node_type: memory
  type: project
  originSessionId: d99aa03b-643f-4f06-b775-40a6bff6c573
---

**TD после прогона E16.** У канонов в Library **нет кнопки UNLOCK** (2026-07-05, E16 run). Полина подтвердила: unlock LOCKED-ассета — hard-gate Директора, но в UI самого контрола нет → Директор не может разлочить канон, когда нужно (в E16 упёрлись в это на `object_gym_equipment`).

**Сделать:** добавить кнопку **Unlock** на карточку канона (LOCKED SBL), **с ворнингом** — разлок открывает LOCKED hard-gate ассет (CLAUDE.md §7: LOCKED files are never modified → create new version). Ворнинг должен объяснить последствие и требовать явного подтверждения Директора (это его hard-limit, не EXEC-DIR-AI).

Примечание: в E16 разлок в итоге НЕ понадобился — корневой фикс аплоадера + backfill забэкапили LOCKED-канон в Drive не разлачивая (см. датащит DEF-01). Но контрол всё равно нужен на будущее.
