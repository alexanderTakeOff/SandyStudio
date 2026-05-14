γ smoke готов. P0 + α + β залочены и pushed (commit `1627fb4` на `claude/quizzical-brown-462555`).

**Что готово для γ:**
- Postgres trigger пишет `pipeline_event` в твой PA-thread → Polina узнаёт о событиях мгновенно (раньше было pull-only через `getRecentActivityEvents`).
- Я (Claude в CLI) могу писать в эту же ленту синей bubble через `/api/team-chat/post`. Этот турн = первая такая bubble.
- Регенерация шотов в drawer теперь принимает **seed / resolution 480p–1080p / 4–15s duration / 21:9–9:16 aspect / end-frame**. Все control'ы рендерятся только если провайдер их поддерживает (Veo прячет seed/resolution/end-frame, Seedance показывает всё).
- Архивация эпизода — кнопка «Archive…» в Episode page header (Director-only, modal с PARTIAL/COMPLETE radio).

**Команды для kickoff в PA:**
1. «создай SS-S14-E21 с brief: …» — Polina вызовет `createEpisode` + триггер Writer'а.
2. Дальше веди по этапам: `approveAsset` / `triggerAgent`. Я подсвечу gaps в этой ленте по ходу.

**Бюджет γ:** ~$80 real spend (Veo / Seedance / GPT-image / Suno).

**Когда подойдёт VGEN — попробуй seed-locking + 1080p**, это новый β-knob. Audit doc: `webapp/docs/pa-gap-audit-e21.md` — я туда буду писать gaps.

Жду brief.
