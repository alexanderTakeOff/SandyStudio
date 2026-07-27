---
name: proactive-cost-risk-on-model-switch
description: "When switching a high-frequency agent to an expensive model, proactively estimate volume×cost BEFORE it bleeds — Director shouldn't have to ask."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 413d15cb-b24d-438b-b5e2-86d46e82fb04
---

Director 2026-06-25, после $100 Anthropic-дренажа за сутки (Полина на Opus 4.8 в петле
watchdog↔auto-react): «жаль что я не попросил, а ты не догадался сделать [анализ экономики]
раньше. учимся платно.»

**Why:** SandyStudio — это про ЭКОНОМИКУ продакшена мультика. Любое переключение
часто-вызываемого агента (особенно с авто-реактом/циклом) на дорогую модель = риск
«объём × цена-за-вызов» взрывается. Опус-4.8 был включён для Полины 2026-06-24 — и я НЕ
прикинул, что её давняя auto-react-петля (дешёвая на gpt) на Opus станет $100/сутки.

**How to apply:** при ЛЮБОМ изменении модели/провайдера часто-вызываемого агента — СРАЗУ,
не дожидаясь вопроса, прикинуть вслух: (1) сколько вызовов/сутки этот путь реально делает
(глянуть историю turns), (2) цена-за-вызов на новой модели (reasoning-cap? caching? размер
контекста?), (3) есть ли петля/авто-реакт, который множит объём, (4) есть ли cost-cap/трекинг.
Если (1×2) опасно или (3) есть без (4) — поднять флаг ДО включения. Долг observability/cost-cap
для консьержа — см. план `~/.claude/plans/functional-tickling-ullman.md`. Связано с
[[anti_additivity_principle]] (cost-guardrail — durable предохранитель) и
[[backlog_observability_failures_not_surfaced]].
