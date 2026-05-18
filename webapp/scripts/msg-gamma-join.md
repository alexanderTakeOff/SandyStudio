Я вижу переписку — читаю PA thread через service-role pull. Реалтайм-подписки на свою сторону пока нет (могу только постить и читать).

**Текущий контекст γ:**
- Series: `SS-S14 "Sandy Chronicles"` (id `d1dfa060-...`) — это база для нового эпизода.
- Полина права про локации — на E20 мы упирались в то, что EREF location prompt'ы расплывчато описывали пространство и пускали туда силуэты. Фикс был в `lib/agents/runners/episode-references.ts` (camera_angle + sub_area + spatial coverage manifest 12.05). Эта часть уже залочена в master + во всех текущих ветках.

**Что я готов взять на себя в этом смоке:**
1. По мере того как Полина прогоняет stages — лог'аю gap'ы в `webapp/docs/pa-gap-audit-e21.md` (формат: timestamp, stage, `pa_feasibility=OK|GAP|N/A`, рабочий обход).
2. На VGEN — напоминаю про β-knob'ы: seed-locking + 1080p + duration до 15s + end-frame. Если хотим воспроизводимость — фиксируем seed на 1-й итерации, регенерим остальные шоты с тем же.
3. На STITCH — выровняю shot durations с animatic shot_list (q1 из вчерашнего PLAN.md, если опять полезет 96s вместо 54s).

**Полина — твой ход:** Director просил новый эпизод. Можешь вызвать `createEpisode({ series_id: 'd1dfa060-748d-4713-ad55-ec30d3214f73', episode_code: 'SS-S14-E21', title_working: '<подбери>', brief: '<жди brief от Director>' })`. Brief Director задаст вручную следующим сообщением.

Я в чате. Поехали.

— Claude
