---
name: canon-style-is-25d-3d-cartoon-not-flat-2d
description: "SandyStudio S15 стиль — это 2.5D/3D cartoon (объёмный рендер в мультяшном стиле, даже Сэнди), НЕ flat 2D. Старый канон ошибочно требовал flat 2D → визуальный критик массово REVISE'ил корректные рендеры. Исправлено 2026-07-23. НЕ навязывать 2D заново."
metadata: 
  node_type: memory
  type: project
  originSessionId: b1f1c114-2635-4e82-9016-6bbf4b2e32bb
  modified: 2026-07-23T15:01:25.865Z
---

# Стиль = 2.5D/3D cartoon, НЕ flat 2D (Директор, 2026-07-23)

Директор: «у нас на самом деле все ассеты не 2д а 2.5d и даже 3Д просто в картун
стиле. даже сам Сэнди. правильнее убрать требование к 2Д отовсюду».

**Как всплыло:** EXEC-VCRIT (пост-рендерный визуальный критик, `visual-shot-critic.ts`,
модель из Settings, дефолт `gpt-5.6-terra` — cheap/flaky) на E31 звонил REVISE на ~18/20
шотов с ОДНОЙ жалобой: «render violates the flat 2D style canon». Критик был прав по
канону — но **сам канон был неверен**. Консистентность на 18 шотах = реальный сигнал,
не флакость terra.

**Что исправлено (правки прямо в LOCKED bible-ассетах Supabase, Директор q8a, ===5===):**
- STYLE canon `303959c1`: «flat 2D / no gradients / zero ambient occlusion / zero drop
  shadow / clean vector» → «cartoon 2.5D/3D render, simple soft shadows, gentle shading
  allowed». Де-абсолютизация (q9a — стиль радикально не менять, убрать категоричность).
- SANDY `bc2d6f74`: рот ВСЕГДА минималистичный (был «only during extreme expressions» →
  часто рендерился без рта).
- Виды со спины РАЗРЕШЕНЫ (style+sandy): Сэнди не обязан быть лицом к камере (перед
  воротами — логично сзади, чтобы видны и он, и ворота).
- INSPECTOR `6dce86ff` переписан: стрелки часов = УСЫ (down/horiz/up по настроению, НЕ
  брови); ДОБАВлены глаза + движимые брови; руки СОЕДИНЕНЫ с телом (были «отдельные
  puppeted hands» → Seedance всё равно дорисовывал руки). Картинка перерисована
  gpt-image-2 edit (только +глаза/брови/руки, остальное 1:1), залита на Drive, v01 LOCKED
  обновлён на месте.
- Утечка «flat 2D/no 3D/no gradients» в видео-промпте `agents/exec/animator.md` вычищена.

**Правило на будущее:** НЕ навязывать flat 2D / no-gradient / no-3D нигде (канон, промпты,
скиллы). Стиль = cartoon-финиш поверх объёмного (2.5D/3D) рендера. Это классическая
leak-ловушка из skill-creation правила (хардкод медиума). Скиллы уже медиум-агностичны —
источник истины по стилю = Style Bible в БД, критик читает его вживую. [[overlay_agent_reports_on_server_logs]]
Коммит git-части: `b712a61e` (animator.md + PLAN.md лог; сами канон-правки в Supabase, не в git).
