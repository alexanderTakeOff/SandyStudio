---
name: backlog-td-partial-animatic-and-provider-caps
description: Два TD из решений Director 2026-06-12 — частичный аниматик (q2а) и провайдер-капы в промпты Writer/Storyboarder (D2)
metadata: 
  node_type: memory
  type: project
  originSessionId: 933fcbb8-b0a4-4eed-b4c1-4b543c51d981
---

# TD — частичный аниматик (q2а) + провайдер-минимумы для SW/SB (D2)

Решения Director 2026-06-12 (сессия F1-F8 fix-спринта), имплементация после Mode-4 регрессии.

## TD-A: частичный аниматик (q2а — «логично»)

Сейчас anchor-mode аниматик требует ВСЕ шоты эпизода (next-events.ts: `approved >= shotCount*2`); в E07 обходили руками (`anchor_chain_enabled=false` + legacy slideshow). Решение: разрешить сборку аниматика из ГОТОВОГО подмножества шотов с честной пометкой `partial N/M` в metadata + заголовке. Полезен и в чистовом процессе (ритм-проверка акта 1, пока акт 3 рисуется). Финальный аниматик пересобирается, когда готовы все. Не дыра в гейте: VGEN-гейты остаются на полном аниматике (или partial-маркер блокирует переход к видео всего эпизода — уточнить дизайн при имплементации). ~2-3 ч.

## TD-B: провайдер-капы до брифа (D2 — «вопрос исчерпан»)

Тезис Director: «3 сек не должно быть, если выбран провайдер без такого режима — выбор провайдера в настройках эпизода mast-have ДО брифа». Факты: выбор уже есть (TD-86 `generation_config.video`), но `VIDEO_PROVIDER_CAPS` читают только Animator/критики — Writer и Storyboarder НЕ знают минимумов, 2-сек биты рождаются в сценарии и умирают только на V-чеках планов. Фикс:
1. `generation_config.video` обязателен при создании эпизода (fail-fast, CLAUDE.md §11 Rule 8).
2. min/max duration выбранного провайдера → в промпты SW (биты) и SB (shot duration) — короче минимума не пишется вовсе.
~1-1.5 ч. Train-personnel: тот же коммит правит agents/exec/screenwriter+storyboarder skill-файлы.

Связано: [[session-2026-06-12-f1-f8-fix-sprint]].
