---
name: backlog_skill_loader_hardening_p1
description: "DONE 2026-07-24 (q5a/q6a) — loader громкий, 3 жертвы вылечены, зеркала признаны не-рантайм"
metadata: 
  node_type: memory
  type: project
  originSessionId: 5566d593-598e-4e05-bf48-87d165649c7d
  modified: 2026-07-24T08:41:16.305Z
---

**СДЕЛАНО 2026-07-24** (`bd7ef2bf`, Тео, q6a). Источник — аудит learning loop + Codex.

**Что закрыто:**
1. **Громкий фейл лоадера** — `scanSkillsDir` больше не глотает падения за env-флагом;
   отдаёт `{skills, failures}`, `console.warn` на каждый дроп, `/api/skills` → `meta.failures`.
   На ПЕРВОМ прогоне поймал реальную жертву: **`sandy-gag-library`** (вся грамматика гэгов
   Сэнди) молча не грузилась — top-level `authors:` список ломал самописный YAML-парсер
   (`load-skill-file.ts` держит только контрактные поля + скаляры). Вынес authors/maturity
   в тело → грузится ACTIVE. Урок: громкий фейл = не гигиена, а детектор реальных дыр.
2. **STUB → DRAFT** (`episode-serialization`, `sandystudio-archivist`) — `STUB` невалиден
   (тип ACTIVE|DRAFT|DEPRECATED), кидал на загрузке → невидимы даже в `/api/skills`. Это
   намеренные заглушки («full impl in Sprint 5») → правильный статус DRAFT (не грузить, но видно).
3. **Зеркала — НЕ проблема (Директор 2026-07-24).** Критерий: трогают ли они РАНТАЙМ webapp?
   Проверено: единственный читатель скиллов = `select-skills.ts`, читает ТОЛЬКО `.claude/skills`.
   `.agents/skills` = Codex-копия аудитора, `.codex/hooks` = Codex CLI — в приложении не
   исполняются. → parity-гвард НЕ ставим (снял свой же тест). Claude работает, Codex аудирует.

**Побочно:** дострелил capture-хук на Codex-стороне (`.codex/hooks/training-capture.cjs` был
жив — kill был половинчатым); Codex-копию скиллов обновил разово (без гварда).

**Остаётся (низкий приоритет, НЕ рантайм-блокер):** 2 skill-body >20k символов не сохранятся
через `/api/skills` POST (лимит zod); Reporting API без пагинации (`hog-report-poll`).
