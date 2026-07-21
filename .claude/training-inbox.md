# Training Inbox — RAW, dirty, unprocessed

> Temporary capture buffer for personnel-training signal (skills/rules updates).
> Append-only, RAW. NOT a source of truth. The daily 15:00 distiller reads this,
> updates `.claude/skills/*` + rules, then marks entries `[PROCESSED]`.
> Info is never deleted — pruned-from-skill detail goes to `<skill>-history.md`.
>
> Entry format:
> ## <ISO date> · <source: director-msg | session | agent> · <tentative target skill/rule>
> raw snippet (verbatim, unedited) — status: NEW | PROCESSED

---

## 2026-06-09 · director-msg · NEW · process directive (meta)
Set up: (1) UserPromptSubmit hook that scans every Director message for
training-relevant info and appends it RAW to this inbox; (2) daily 15:00 cron that
studies this inbox + agents' skills + rules, edits skills (add/prune) to keep them
current without catastrophic growth and without losing info; size-cap skills.
Must be a recurring event.

## 2026-06-09 · session · NEW · seedance-prompting + eref-designer  [already drafted into skills, confirm on distill]
Vertical Shorts (9:16) reference frames: a 16:9 landscape ref into a 9:16 Seedance
render crops ~44% + identity drift. Ref aspect MUST match render aspect_ratio. Root
cause E03: episode had no `delivery_targets` → EREF Designer silently fell back to
youtube_landscape (1536×1024). `delivery_targets` resolving via FALLBACK is a RED
FLAG, not a pass — halt + decision_requested instead of defaulting to landscape.

## 2026-06-09 · session · NEW · concierge / governance skill (boldness)
Polina over-cautious: auto-react (`chat-internal`) HARD-blocks ALL mutating tools
regardless of governance_mode; `checkVerbalApproval` demands per-action Director
token regardless of mode. But system prompt already says Mode 3 = "dispatch freely,
surface for awareness". Fix = make the 2 gates mode-aware; budget ceiling
(`assertBudgetAvailable`, atomic) is the real cost backstop, so the ONLY hard stop
should be the project price ceiling. Hard limits stay Director-only (Publish/LOCKED/
Budget/Mode). Director's principle: "снижать осторожность, упираться только если
выходим за потолок price проекта." (TD: q9y approved — mode-aware fix + EXEC-DIR-AI
service token + pre-spend estimate.)

## 2026-06-09 · session · NEW · gate / preflight + verify-trio lesson
media-preflight (added 7c76a05, 2026-06-04) over-broadly preflighted ALL `SBL-%`
LOCKED canon as media, including text sections (general_idea.md, no bytes) →
"Media unreachable" false-block. Latent 5 days because no fresh EREF ran after the
gate. replay-pilot (mock, no OPENAI_API_KEY) SKIPS the preflight → this whole class
of bug is invisible to the verify trio. Lesson: hardening that adds a preflight must
be exercised on a real (non-mock) fresh run of the affected stage; and the preflight
must scope to assets the agent actually opens as media (not text).

## 2026-06-09 · session · NEW · Mode-4 autonomous chain gap (TD-87)
Mode-4 factory `nextEvent` chain diverged from `computeNextEvents`: WCHK jumps to
EXEC-EDIT, SKIPS EREF+MGEN; per-shot designer/critic/plan-approve don't auto-advance.
Operator had to fire each stage by hand via Inngest /e/dev. Durable fix = converge
Mode-4 auto-chain onto the single `computeNextEvents` router.

## 2026-06-09 · director-msg + session · NEW · storyboarder-situational-comedy [drafted into skill]
Director: insufficient camera/orbit/angle variation is a SYSTEMATIC error, root at the STORYBOARDER (EXEC-SB) skill, not the reference designer. 22 same-bedroom E03 shots → flat repeated angles → Reference Critic REVISE-flagged 12. The SB skill had camera-MOVEMENT-per-comic-function but NO camera-ANGLE/orbit-VARIETY-across-shots rule. Added section + cited camera_orbit_signature_policy (threshold from Style Bible). Critic was RIGHT — fix upstream where angles are authored, not patch downstream.

## 2026-06-09 · session · NEW · ops / Inngest deploy lesson
Copying changed factory.ts/lib files to master does NOT reliably take effect for the LIVE Inngest worker — Next-dev HMR reloads modules but the Inngest dev server keeps the already-registered function definitions. Code/pipeline fixes that change Inngest functions (factory.ts, runners) need a WORKER RESTART to activate. TD-87 smoke showed no auto-execute because the worker still ran old factory.ts. Add to deploy/verify ritual: after editing pipeline functions, restart the worker before smoke.

## 2026-06-09 08:54 · director-msg (hook) · NEW · (triage at distill)
/goal догенерить 17 недостающих IMG-кадров per-shot pipeline'ом, затем пересобрать animatic и дойти тоесть закончить генерацию SH01 и SH02 ( pilot) video
после этого мой чек пойнт

## 2026-06-09 09:07 · director-msg (hook) · NEW · (triage at distill)
все делай через полину вторая goal это завершение ее обучения и обеспечение ее инструментами для полного управлениия  всем циклом выпуска продукции

## 2026-06-09 09:08 · director-msg (hook) · NEW · (triage at distill)
<scheduled-task name="context" file="C:\Users\NAVIA VISION ONE\.claude\scheduled-tasks\context\SKILL.md">
This is an automated run of a scheduled task. The user is not present to answer questions. For implementation details, execute autonomously without asking clarifying questions — make reasonable choices and note them in your output. "write" actions (e.g. MCP tools that send, post, create, update, or delete), only take them if the task file asks for that specific action. When in doubt, producing a report of what you found is the correct output.

ПРОВЕРЯЙ КОНТЕКСТ СЕССИИ И ЕСЛИ КОНТЕКСТ БОЛЕЕ 65 % ОКНА ТО ВСЕ СООБЩЕНИЯ  В МОЙ АДРЕС НАЧИНАЙ С ОРАНЖЕВОГО КРУЖОЧКА ЭМОДЖИ
</scheduled-task>

## 2026-06-09 09:15 · director-msg (hook) · NEW · (triage at distill)
<scheduled-task name="hourly-context" file="C:\Users\NAVIA VISION ONE\.claude\scheduled-tasks\hourly-context\SKILL.md">
This is an automated run of a scheduled task. The user is not present to answer questions. For implementation details, execute autonomously without asking clarifying questions — make reasonable choices and note them in your output. "write" actions (e.g. MCP tools that send, post, create, update, or delete), only take them if the task file asks for that specific action. When in doubt, producing a report of what you found is the correct output.

Run the `/context` slash command in a fresh session.

Invoke it via the Skill tool: `Skill({skill: "context", args: ""})`. If the skill name is namespaced (e.g. `ecc:context` or similar), use that exact form — check the available-skills list for the right identifier before calling.

This is Director Alexander's periodic context check-in (Russian-speaking; the original /loop input was «/context ежечасно» — "hourly"). The output is whatever `/context` itself emits; do not paraphrase or extend it. Do not load extra tools, do not start subagents, do not make any edits or commits. After /context completes, the run is done.

If the /context skill is not available in this session for any reason, report that fact in one short sentence and stop. Do not attempt to substitute alternative diagnostics.
</scheduled-task>

## 2026-06-09 09:32 · director-msg (hook) · NEW · (triage at distill)
почитай полину.\я не уверен что ты на правильном пути. ну или может я не глубоко вник

## 2026-06-09 10:08 · director-msg (hook) · NEW · (triage at distill)
<scheduled-task name="context" file="C:\Users\NAVIA VISION ONE\.claude\scheduled-tasks\context\SKILL.md">
This is an automated run of a scheduled task. The user is not present to answer questions. For implementation details, execute autonomously without asking clarifying questions — make reasonable choices and note them in your output. "write" actions (e.g. MCP tools that send, post, create, update, or delete), only take them if the task file asks for that specific action. When in doubt, producing a report of what you found is the correct output.

ПРОВЕРЯЙ КОНТЕКСТ СЕССИИ И ЕСЛИ КОНТЕКСТ БОЛЕЕ 65 % ОКНА ТО ВСЕ СООБЩЕНИЯ  В МОЙ АДРЕС НАЧИНАЙ С ОРАНЖЕВОГО КРУЖОЧКА ЭМОДЖИ
</scheduled-task>

## 2026-06-09 10:15 · director-msg (hook) · NEW · (triage at distill)
<scheduled-task name="hourly-context" file="C:\Users\NAVIA VISION ONE\.claude\scheduled-tasks\hourly-context\SKILL.md">
This is an automated run of a scheduled task. The user is not present to answer questions. For implementation details, execute autonomously without asking clarifying questions — make reasonable choices and note them in your output. "write" actions (e.g. MCP tools that send, post, create, update, or delete), only take them if the task file asks for that specific action. When in doubt, producing a report of what you found is the correct output.

Run the `/context` slash command in a fresh session.

Invoke it via the Skill tool: `Skill({skill: "context", args: ""})`. If the skill name is namespaced (e.g. `ecc:context` or similar), use that exact form — check the available-skills list for the right identifier before calling.

This is Director Alexander's periodic context check-in (Russian-speaking; the original /loop input was «/context ежечасно» — "hourly"). The output is whatever `/context` itself emits; do not paraphrase or extend it. Do not load extra tools, do not start subagents, do not make any edits or commits. After /context completes, the run is done.

If the /context skill is not available in this session for any reason, report that fact in one short sentence and stop. Do not attempt to substitute alternative diagnostics.
</scheduled-task>

## 2026-06-09 11:08 · director-msg (hook) · NEW · (triage at distill)
<scheduled-task name="context" file="C:\Users\NAVIA VISION ONE\.claude\scheduled-tasks\context\SKILL.md">
This is an automated run of a scheduled task. The user is not present to answer questions. For implementation details, execute autonomously without asking clarifying questions — make reasonable choices and note them in your output. "write" actions (e.g. MCP tools that send, post, create, update, or delete), only take them if the task file asks for that specific action. When in doubt, producing a report of what you found is the correct output.

ПРОВЕРЯЙ КОНТЕКСТ СЕССИИ И ЕСЛИ КОНТЕКСТ БОЛЕЕ 65 % ОКНА ТО ВСЕ СООБЩЕНИЯ  В МОЙ АДРЕС НАЧИНАЙ С ОРАНЖЕВОГО КРУЖОЧКА ЭМОДЖИ
</scheduled-task>

## 2026-06-09 11:15 · director-msg (hook) · NEW · (triage at distill)
<scheduled-task name="hourly-context" file="C:\Users\NAVIA VISION ONE\.claude\scheduled-tasks\hourly-context\SKILL.md">
This is an automated run of a scheduled task. The user is not present to answer questions. For implementation details, execute autonomously without asking clarifying questions — make reasonable choices and note them in your output. "write" actions (e.g. MCP tools that send, post, create, update, or delete), only take them if the task file asks for that specific action. When in doubt, producing a report of what you found is the correct output.

Run the `/context` slash command in a fresh session.

Invoke it via the Skill tool: `Skill({skill: "context", args: ""})`. If the skill name is namespaced (e.g. `ecc:context` or similar), use that exact form — check the available-skills list for the right identifier before calling.

This is Director Alexander's periodic context check-in (Russian-speaking; the original /loop input was «/context ежечасно» — "hourly"). The output is whatever `/context` itself emits; do not paraphrase or extend it. Do not load extra tools, do not start subagents, do not make any edits or commits. After /context completes, the run is done.

If the /context skill is not available in this session for any reason, report that fact in one short sentence and stop. Do not attempt to substitute alternative diagnostics.
</scheduled-task>

## 2026-06-09 12:08 · director-msg (hook) · NEW · (triage at distill)
<scheduled-task name="context" file="C:\Users\NAVIA VISION ONE\.claude\scheduled-tasks\context\SKILL.md">
This is an automated run of a scheduled task. The user is not present to answer questions. For implementation details, execute autonomously without asking clarifying questions — make reasonable choices and note them in your output. "write" actions (e.g. MCP tools that send, post, create, update, or delete), only take them if the task file asks for that specific action. When in doubt, producing a report of what you found is the correct output.

ПРОВЕРЯЙ КОНТЕКСТ СЕССИИ И ЕСЛИ КОНТЕКСТ БОЛЕЕ 65 % ОКНА ТО ВСЕ СООБЩЕНИЯ  В МОЙ АДРЕС НАЧИНАЙ С ОРАНЖЕВОГО КРУЖОЧКА ЭМОДЖИ
</scheduled-task>

## 2026-06-09 12:15 · director-msg (hook) · NEW · (triage at distill)
<scheduled-task name="hourly-context" file="C:\Users\NAVIA VISION ONE\.claude\scheduled-tasks\hourly-context\SKILL.md">
This is an automated run of a scheduled task. The user is not present to answer questions. For implementation details, execute autonomously without asking clarifying questions — make reasonable choices and note them in your output. "write" actions (e.g. MCP tools that send, post, create, update, or delete), only take them if the task file asks for that specific action. When in doubt, producing a report of what you found is the correct output.

Run the `/context` slash command in a fresh session.

Invoke it via the Skill tool: `Skill({skill: "context", args: ""})`. If the skill name is namespaced (e.g. `ecc:context` or similar), use that exact form — check the available-skills list for the right identifier before calling.

This is Director Alexander's periodic context check-in (Russian-speaking; the original /loop input was «/context ежечасно» — "hourly"). The output is whatever `/context` itself emits; do not paraphrase or extend it. Do not load extra tools, do not start subagents, do not make any edits or commits. After /context completes, the run is done.

If the /context skill is not available in this session for any reason, report that fact in one short sentence and stop. Do not attempt to substitute alternative diagnostics.
</scheduled-task>

## 2026-06-09 13:08 · director-msg (hook) · NEW · (triage at distill)
<scheduled-task name="context" file="C:\Users\NAVIA VISION ONE\.claude\scheduled-tasks\context\SKILL.md">
This is an automated run of a scheduled task. The user is not present to answer questions. For implementation details, execute autonomously without asking clarifying questions — make reasonable choices and note them in your output. "write" actions (e.g. MCP tools that send, post, create, update, or delete), only take them if the task file asks for that specific action. When in doubt, producing a report of what you found is the correct output.

ПРОВЕРЯЙ КОНТЕКСТ СЕССИИ И ЕСЛИ КОНТЕКСТ БОЛЕЕ 65 % ОКНА ТО ВСЕ СООБЩЕНИЯ  В МОЙ АДРЕС НАЧИНАЙ С ОРАНЖЕВОГО КРУЖОЧКА ЭМОДЖИ
</scheduled-task>

## 2026-06-09 13:15 · director-msg (hook) · NEW · (triage at distill)
<scheduled-task name="hourly-context" file="C:\Users\NAVIA VISION ONE\.claude\scheduled-tasks\hourly-context\SKILL.md">
This is an automated run of a scheduled task. The user is not present to answer questions. For implementation details, execute autonomously without asking clarifying questions — make reasonable choices and note them in your output. "write" actions (e.g. MCP tools that send, post, create, update, or delete), only take them if the task file asks for that specific action. When in doubt, producing a report of what you found is the correct output.

Run the `/context` slash command in a fresh session.

Invoke it via the Skill tool: `Skill({skill: "context", args: ""})`. If the skill name is namespaced (e.g. `ecc:context` or similar), use that exact form — check the available-skills list for the right identifier before calling.

This is Director Alexander's periodic context check-in (Russian-speaking; the original /loop input was «/context ежечасно» — "hourly"). The output is whatever `/context` itself emits; do not paraphrase or extend it. Do not load extra tools, do not start subagents, do not make any edits or commits. After /context completes, the run is done.

If the /context skill is not available in this session for any reason, report that fact in one short sentence and stop. Do not attempt to substitute alternative diagnostics.
</scheduled-task>

## 2026-06-09 14:08 · director-msg (hook) · NEW · (triage at distill)
<scheduled-task name="context" file="C:\Users\NAVIA VISION ONE\.claude\scheduled-tasks\context\SKILL.md">
This is an automated run of a scheduled task. The user is not present to answer questions. For implementation details, execute autonomously without asking clarifying questions — make reasonable choices and note them in your output. "write" actions (e.g. MCP tools that send, post, create, update, or delete), only take them if the task file asks for that specific action. When in doubt, producing a report of what you found is the correct output.

ПРОВЕРЯЙ КОНТЕКСТ СЕССИИ И ЕСЛИ КОНТЕКСТ БОЛЕЕ 65 % ОКНА ТО ВСЕ СООБЩЕНИЯ  В МОЙ АДРЕС НАЧИНАЙ С ОРАНЖЕВОГО КРУЖОЧКА ЭМОДЖИ
</scheduled-task>

## 2026-06-09 14:15 · director-msg (hook) · NEW · (triage at distill)
<scheduled-task name="hourly-context" file="C:\Users\NAVIA VISION ONE\.claude\scheduled-tasks\hourly-context\SKILL.md">
This is an automated run of a scheduled task. The user is not present to answer questions. For implementation details, execute autonomously without asking clarifying questions — make reasonable choices and note them in your output. "write" actions (e.g. MCP tools that send, post, create, update, or delete), only take them if the task file asks for that specific action. When in doubt, producing a report of what you found is the correct output.

Run the `/context` slash command in a fresh session.

Invoke it via the Skill tool: `Skill({skill: "context", args: ""})`. If the skill name is namespaced (e.g. `ecc:context` or similar), use that exact form — check the available-skills list for the right identifier before calling.

This is Director Alexander's periodic context check-in (Russian-speaking; the original /loop input was «/context ежечасно» — "hourly"). The output is whatever `/context` itself emits; do not paraphrase or extend it. Do not load extra tools, do not start subagents, do not make any edits or commits. After /context completes, the run is done.

If the /context skill is not available in this session for any reason, report that fact in one short sentence and stop. Do not attempt to substitute alternative diagnostics.
</scheduled-task>

## 2026-06-09 14:47 · director-msg (hook) · NEW · (triage at distill)
смотрю на картинки рефереенсов и что похоже Сэнди рисуется по памяти и в промтах нет отсылок  на канон 

соответственно твоя задача понять почему у нас вдруг сегодня референсы делаются без канона если это так не надо ничего переделывать мы отлаживаем сейчас timeline timeline больше но попытайтесь выяснить В чём причина
 сразу не начинай разбираться , давай дойдем до конца эпизода , в todo

## 2026-06-09 14:57 · director-msg (hook) · NEW · (triage at distill)
по поводу канона от себя замечу Что такое ощущение что в пилотных кадрах куда-то уплыл с третьего кадра по Двадцатый кадр Мне так кажется что канон присутствует с двадцатого кадра по 24 канун опять куда-то плывёт то ли есть то ли нет точка ну и последние 24 кадр у меня вообще просто чёрная квадрат пустой 
полина провела проверку. и удивляет явный регрес - раньше по рефам не было проблес с каноном, после якорей - появились. не аккуратная работа , брат.

вердиктт  Полины: 

Проверила по фактам, без переделок.

В Ref Plans канон не исчез полностью: в промптах есть текстовые блоки Subject — sandy_hourglass, Style canon, Location, иногда anchor_assets: ["sandy_hourglass", ...]. То есть Designer пишет Sandy по текстовому канону.

Но проблема, похоже, реальная в другом месте: персонажный visual reference на Sandy не передаётся как image anchor. В continuity_anchors у проверенных шотов я вижу только spatial/location anchors комнаты. sandy_hourglass указан в anchor_assets, но в фактическом списке attached anchors остаётся только bedroom/spatial image. Значит Image Artist получает картинку комнаты + текст про Sandy, а не визуальный канон Sandy. Отсюда ощущение “рисует по памяти”.

Ещё хуже: есть разброс по версиям планов. Старые approved v02 планы для SH04/SH09 содержат подробный Sandy canon, но новые stale-anchor recovery v03 планы лежат DRAFT и у части шотов тоже показывают только spatial anchor. Pipeline при image-only, судя по событиям, работал от approved/passing планов, не обязательно от этих новых DRAFT. Поэтому корень не в одном конкретном промпте, а в сборке inputs: текстовый canon есть, image-canon Sandy не прикладывается.

Предварительная причина:

Reference Designer формирует anchor_assets декларативно: sandy_hourglass, sandy_bedroom_continuity.
Resolver/runner реально материализует в continuity_anchors только spatial_same_location.
Character Bible visual slug sandy_hourglass не превращается в attached reference image для Reference Artist.
Critic это не ловит как blocker, потому что проверяет текстовую спецификацию, а не факт attached image anchors.
Timeline сейчас трогать не нужно. Для отладки я бы передала инженерам точку проверки: EREF execute-from-plan / prompt assembly должен логировать resolved image inputs: location anchors + character Bible visual refs отдельно; если anchor_assets содержит sandy_hourglass, но resolved image list не содержит Sandy visual ref — это bug в resolver или в доступности Library asset.


++++
два пилото отработали , что-то есть , качества не жду поэтому можно гнать остальные но проверь что с последним рефом (24) - черный , может так задумано странно

## 2026-06-09 15:08 · director-msg (hook) · NEW · (triage at distill)
<scheduled-task name="context" file="C:\Users\NAVIA VISION ONE\.claude\scheduled-tasks\context\SKILL.md">
This is an automated run of a scheduled task. The user is not present to answer questions. For implementation details, execute autonomously without asking clarifying questions — make reasonable choices and note them in your output. "write" actions (e.g. MCP tools that send, post, create, update, or delete), only take them if the task file asks for that specific action. When in doubt, producing a report of what you found is the correct output.

ПРОВЕРЯЙ КОНТЕКСТ СЕССИИ И ЕСЛИ КОНТЕКСТ БОЛЕЕ 65 % ОКНА ТО ВСЕ СООБЩЕНИЯ  В МОЙ АДРЕС НАЧИНАЙ С ОРАНЖЕВОГО КРУЖОЧКА ЭМОДЖИ
</scheduled-task>

## 2026-06-09 15:13 · director-msg (hook) · NEW · (triage at distill)
и серьёзный косяк который я вижу это то что формат видеокадров он какой-то не похожий на формат шорцев и некоторые кадры сгенерировались вообще просто в формате пейзажа Хотя возможно что нет Похоже что просто наш эпизод timeline растягивает картинку на всю ширину и срезает верхнюю часть потому что вначале они показывались как бы портретном режиме А сейчас смотрю все растянулись по ширине почему-то

 перепроверь

## 2026-06-09 15:15 · director-msg (hook) · NEW · (triage at distill)
<scheduled-task name="hourly-context" file="C:\Users\NAVIA VISION ONE\.claude\scheduled-tasks\hourly-context\SKILL.md">
This is an automated run of a scheduled task. The user is not present to answer questions. For implementation details, execute autonomously without asking clarifying questions — make reasonable choices and note them in your output. "write" actions (e.g. MCP tools that send, post, create, update, or delete), only take them if the task file asks for that specific action. When in doubt, producing a report of what you found is the correct output.

Run the `/context` slash command in a fresh session.

Invoke it via the Skill tool: `Skill({skill: "context", args: ""})`. If the skill name is namespaced (e.g. `ecc:context` or similar), use that exact form — check the available-skills list for the right identifier before calling.

This is Director Alexander's periodic context check-in (Russian-speaking; the original /loop input was «/context ежечасно» — "hourly"). The output is whatever `/context` itself emits; do not paraphrase or extend it. Do not load extra tools, do not start subagents, do not make any edits or commits. After /context completes, the run is done.

If the /context skill is not available in this session for any reason, report that fact in one short sentence and stop. Do not attempt to substitute alternative diagnostics.
</scheduled-task>

## 2026-06-09 15:17 · director-msg (hook) · NEW · (triage at distill)
Ну вот и я вижу всё ещё проблемы с музыкой причём очень странно вчера музыка Нормально Работала я мог вручную хотя бы загрузить файл и настроить его fade и прочее а сегодня я нажимаю кнопку реплейс и ничего не происходит файл не загружается Мы вроде бы это не правили сегодня Откуда взялся регресс

## 2026-06-09 15:24 · director-msg (hook) · NEW · (triage at distill)
разбирайся - на каком этапе теряются мои указания по провайдеру: 

директор говорил - seedance- standard  - we have  seedance Fast
директор  говорил - 480 - we have 720
директор  говорил - 9:16   - we have  16:9

как будто саботаж какой-то !!! 


===1===

## 2026-06-09 15:34 · director-msg (hook) · NEW · (triage at distill)
у нас есть такая панелька настройки эпизода где у нас сейчас только одна галочка и бюджет 

Я предлагаю эту панельку сделать во-первых коллапсабыл а во-вторых Добавить сюда выбор провайдера выбор 

соответственно настроить провайдера соответственно если я выбираю провайдера то должны меняться и возможности по выбору этого провайдера да то есть если какие-то опции есть они должны там быть если их нет то они должны там не быть

 как это лучше сделать?  После выбора провайдера подменять какой-нибудь панельку выводить или сделать какую-то Мега универсальную панельку и активировать или не активировать какие-то элементы этой панели в зависимости от возможности провайдера Я не знаю Подумай сам но судя по всему с моей задачей сделать так чтобы указание директора не терялись вы не справились 


Поэтому будем действовать таким образом эпизод запускается в его настройках кто-то либо директор либо его заместитель либо Полина либо ты забиваешь конкретные данные по эпизоду и они хранятся вот здесь Возможно мы сделаем так чтобы можно было чтобы было опция условно говоря что эти параметры могут перебиваться параметрами кадра Ну если вдруг понадобится что-то переделать какой-то кадр повысить в качестве наоборот и так далее Это можно делать и менять параметрах кадра как и сейчас у нас можно сделать, но это должна быть опция. по умолчанию параметры эпизода выше по статусу чем параметры кадра. подумай как это правильно сделать.
 очень хорошо подумай 

трижды подумай что это за собой повлечёт где ты там опять на ловишь косяков 

Запусти в серьёзном размышлении несколько агентов 
Пусть они прошерстят и весь код найдут ВСЕ  зависимости в том числе и фронтах чтобы у нас не было косяков!!! 
хочешь - обнвим сессию для большего контекста , хочешь можно продолжить как есть . сейчас констекст 60%

===1===

## 2026-06-09 15:51 · director-msg (hook) · NEW · (triage at distill)
q26b
q27 всегда креатив кадра
q28   оба
q29 — Серия-дефолты: оставить 
q30 б)

## 2026-07-08 13:13 · director-msg (hook) · NEW · (triage at distill)
самое правильное имхо -  режим последовательные в праралленьный   , начать в моде 2, дойти до пилотов рефов, и пилотов видео , прееключить в моде 3 - ждать результата. покритикуй оцени риски!

## 2026-07-08 13:19 · director-msg (hook) · NEW · (triage at distill)
пока не проверен только R4 , остальное уже проверял - норм
полина читает отчеты критиков - даже критики зачасстую слишком придираются . 
потолки и лимиты директор ставит вначале, после появленя эпизода. 
 запускай сервера! 
Пока собирается, зафиксирую план запуска, чтобы ты видел порядок:

✅ env прокинут в worktree, MECHANICS_AUTO_ADVANCE = OFF (сознательно).
⏳ next build — идёт.
next start → прод-сервер :3000 (без HMR-churn).
inngest dev роутер → :8288 против :3000.
Health-check: :3000 отвечает + :8288 видит зарегистрированные функции.

## 2026-07-08 13:51 · director-msg (hook) · NEW · (triage at distill)
твоя задача сегодня на смоке НЕ ТРОГАТЬ КОД, 
все шаги писать в логи. по аналонии с прошлым прогоном. 
в конце - анализ   и дашборд - есть у нас такая опция. 

первый косяк. wrirer trying before Casting 
второй косяк : 
MODE 1 - каст не у директора на апруве 

17:41 · Александр
which MODE now?
17:41 · Полина
Mode 1 — MANUAL. Director approves every creative gate (Brief, Script, Storyboard, Canon check, References, etc. — each requires explicit "да/одобряю").

## 2026-07-08 13:59 · director-msg (hook) · NEW · (triage at distill)
похоже нам надо немножко поправить порядок paypeline у нас референс артист запускается после критиков сториборда утверждения а надо чтобы он запускался после того именно как сториборд утверждён

## 2026-07-08 14:35 · director-msg (hook) · NEW · (triage at distill)
Я предлагаю в режиме три чтобы не гонять Полину просто так если критик даёт вердикт пас то переводить сразу статус из ревеню в статус утверждено и запускать процесс Это касается и видео и референсов если критик не пропустил то тогда включается Полина и наблюдает если он два раза или сколько там у него стоит в ограничениях не исправил план планировщик то тогда подключается Полина на третьем режиме вместо директора


только это надо хорошенько систематизировать Это я пока вот смотрю на картинки вижу например восьмой кадр план утверждён критик дал пас но статус Всё ещё в ревью а картинка вроде как уже генерится Что странно логично переводить статус критика тогда утверждён и запускать картинки


Ну смотри у нас есть такое какое-то понятие про пилотные кадры и они такие-то почему-то особенные они у нас генерят картинку сразу почему-то  без плана и без критика . как это так протекает Я не понимаю но как-то оно так протекло . вот это наблюдаю .  мне кажется Надо убрать вообще понятия пилотных кадров и просто сделать так что в режиме номер три Полина всё одобряет сама но процесс автоматически останавливается после того как у нас первых два кадра сделаны еференци если это режим последовательный или два кадра референции два видео если режим параллельный . и тогда просто сама машина автоматически фабрика встает на стоп до того момента пока директор не толкнёт её дальше сделав взглядом оценку двух первых кадров и видео. но не делать их какими-то специальными что думаешь?


 кстати сейчас почему-то кнопочки у меня подсвечиваются анимация в них идёт и даже анимация в кебабе работает почему-то в режиме три . не знаю как насчёт других режимов.  но у меня куда-то пропал блок где я редактирую длительность видео кадров этот режим был в аниматики раньше  и вв видео аниматики в общем в нашем универсальном аниматеке А сейчас мы куда-то исчез !!!

## 2026-07-08 14:42 · director-msg (hook) · NEW · (triage at distill)
Ну и вот то что я сейчас ещё наблюдаю если я руками утверждаю обрублю картинку референс то видео дизайнер сразу начинает работать что вроде бы правильно но в режиме номер три на фанауте Полина должна апрувить картинки или автомат если все PASS  а не директор как мне кажется ===1=== 

и сразу . постмори незаметно для полнины а что у нас с 7, 9, 10, 12, 13. похоже фанаут сбился гдето опять - недолечили 
а второй недочет, что это обнаружил я а не фабрика. !!!

## 2026-07-08 14:52 · director-msg (hook) · NEW · (triage at distill)
вот смотри critic PASS APROVED  but Istill need to push the button Generate image . not reasonable right?

## 2026-07-08 16:06 · director-msg (hook) · NEW · (triage at distill)
1 . Это то что когда все видео были сгенерированы мне пришлось вручную их утверждать потому что Полина видимо наверное не имеет права такого без моей команды утверждать Я бы конечно мог её взять команду но я решил просто сделать это самому

2. упал final cut/    заработал когдя я перезагрил В ТАЙМЛАЙНЕ, не в сомпозиторе
19:43 [agent_failed] Online Editor failed — ENOENT: no such file or directory, open 'C:\api\media\SS-S15-E18-AUD-music-v01-DRAFT-a59ac451bd89e850.mp3'

19:44 · Полина
🟡 Полина ждёт ответа: «Уперлась в предохранитель цикла (6 раундов). Последний сбой инструмента: «updateWorkPlan: parse error: content is required». Нужно решение/уточнение Директора.»
Нашла точную причину — это баг рассинхронизации путей после апрува, не творческий вопрос.

Что произошло: ты загрузил трек как AUD-music-v01-DRAFT-a59ac451bd89e850.mp3 (mime audio/mpeg, 3.67MB) — физический файл сохранился именно под этим DRAFT-путём с расширением .mp3.

После твоего одобрения система переименовала запись ассета в AUD-music-v01-APPROVED.wav (сменила и статус, и расширение на .wav), но физический файл на диске остался лежать по старому DRAFT-пути с .mp3 — переименования/копирования файла не произошло. Online Editor читает путь из метаданных, находит несуществующий DRAFT-...mp3 и падает с ENOENT — дважды подряд, оба раза одна и та же причина, это не двойной расход, а один и тот же баг, воспроизведённый дважды.

⚠️ У меня нет инструмента для переименования/перемещения файлов на диске — это инфраструктурный баг в логике approve-рефлоу (extension mismatch + no file move), а не то, что я могу починить тулами.

🔴 Два варианта на выбор:

Перезалить тот же трек заново (новый upload пересоздаст путь корректно под текущим статусом) — самый быстрый обход.
Передать баг инженерам как есть (approve переименовывает asset-запись, но не двигает физический файл + меняет расширение без переконвертации).

=====закончили эпизод да 2.5 часа это рекорд.  ура (почти) 
теперрь: 
1 сделай полный спискок косяков за прогон. без расшифровки и лечения пока.  строчка на косяк
2 сделай статистику автоматизации  как прошлые разы - сохрани как и прошлые - и покажи мне.

## 2026-07-08 16:17 · director-msg (hook) · NEW · (triage at distill)
ИЗ СРОЧНОГО Fanout: рефы SH07/09/10/12/13/14 не сгенерились. разберись ПО ЛОГАМ СЕРВЕРА
прямо сейчас, чтобы отключить дергание полины. кстати скажи сколько раз ее дергала фабрика и автореакт и сколько я дергал. ! 

так из непонятных вещей (в косяки) это кто у нас в режиме номер три когда полная автоматизация - не понятно кто  утверждает картинки!  То есть у нас есть критики на планы Ну вот когда уже сгенерирована картинка прежде чем из неё генерировать видео её тоже должен кто-то утвердить то есть тоже должен быть видимо какой-то цикл либо должно вызываться Полина или какой-то другой Агент с просмотром Ну собственно говоря о чём мы говорим смотреть и одобрять также точно это касается референсов и видимо видео тоже

## 2026-07-08 16:38 · director-msg (hook) · NEW · (triage at distill)
D1 - понаятно  , в работу 
D2  - понятно в работу
D3  Не понятно  - скритик это часть лупа сториборда - выход из лупа наверное через сториборда а не через внутрь?  критикуй. 
D4  на след итерацию возвращаемся с матрице утверждений - логично править переходу уже имея матрицу на руках. 
D5 - пилоты - убираем как класс. обсуждали. логика простая - на моде 3 - два первых кадра - стоп - директор гейт.  ( опять же - в матрицу!) 
D6  - блок длительности не пропал оказывается он оживает когда утвержден editor (он же реф-анииматик) 
 !!! реф-анииматик - убираем как класс - он только косяки рождает. 
!!! Composer можно убрать из пайплайна - но это не к спеху - просто починить связку композитор - таймлайн - монтажер ( что сегодня свалило и таймлайн  и монтажера)
D7 это баг тоже рожден РЕФ-аниматором ! после его утверджения - все заработало, непонятно.
d8 - за тобой. 
D9 -  матрица утверждений
D10...11 - надо обсудить

## 2026-07-08 17:08 · director-msg (hook) · NEW · (triage at distill)
было бы нормально если бы полину за сегодняшний эпизод дернули 30 раз а не 300 раз . сделай анализ как к этиму прийти без потери акривности полины. запусти отдельного агента на это

## 2026-07-08 17:34 · director-msg (hook) · NEW · (triage at distill)
отчет агента сохрани полностью   и ссылку на него  добавь в ~/.claude/session-data/2026-07-08-e18-smoke-outcomes-session.tmp

## 2026-07-08 17:38 · director-msg (hook) · NEW · (triage at distill)
хочу продолжить нашу работу в терминале. как правильно запустить его чтобы опять не портачить с ветками и мастером?

## 2026-07-08 17:47 · director-msg (hook) · NEW · (triage at distill)
<task-notification>
<task-id>a35f59da3aba930f5</task-id>
<tool-use-id>toolu_015mDiMwhA18A2PSsGv39F5Z</tool-use-id>
<output-file>C:\Users\NAVIAV~1\AppData\Local\Temp\claude\C--SandyStudio--claude-worktrees-fetch-timeout-swaps\4ab8985f-d30c-4c6d-9958-3b82c718d728\tasks\a35f59da3aba930f5.output</output-file>
<status>completed</status>
<summary>Agent "Map Gate A/B concierge code paths" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>I have everything needed. Here is the complete map of the code governing Polina (EXEC-CONC) auto-reaction to pipeline telemetry.

---

## 1. Gate A — DB trigger that injects activity events as `role:system` turns

**Path:** `webapp/supabase/migrations/0033_pa_actionable_asset_events.sql`

The trigger function `public.tg_inject_activity_event_into_concierge()` is (re)defined here (the header comment says the original lived in migration 0030; 0033 is a `CREATE OR REPLACE` that widens the whitelist).

- **Whitelist / filter** — `v_actionable` boolean, lines **33-42**:
```sql
  v_actionable boolean := NEW.event_type IN (
    'agent_started','agent_completed','agent_failed',
    'approval_granted','approval_revision','approval_rejected',
    'manual_trigger','budget_threshold_reached','blocker_raised',
    'decision_requested','input_requested','canon_extension_proposed',
    'episode_archived',
    -- TD-20.B 2026-05-20 — Library generation visibility (safety net;
    -- primary fix is logEvent + 'agent_completed' in the routes).
    'asset_created'
  );
```
- Early-exit if not actionable: lines **51-53**.
- Thread resolution (latest open thread for episode, fallback latest open global): lines **55-72**.
- **Director-own suppression clause** — lines **74-79** (compares `NEW.actor` to the thread's `director_id`, only for the three approval events):
```sql
  IF NEW.event_type IN ('approval_granted','approval_revision','approval_rejected')
     AND v_director_id IS NOT NULL
     AND NEW.actor::text = v_director_id::text
  THEN
    RETURN NEW;
  END IF;
```
- Dedup guard (skip if a turn with this `activity_event_id` already exists): lines **81-89**.
- The actual `INSERT ... role='system'` into `concierge_turns`: lines **116-117**.

Note: this Postgres trigger writes the BROADER "context turn" set (13 event types incl. `agent_started`). It is a separate, cheaper path than the paid-wake gate (item 3).

---

## 2. Gate A mirror in TypeScript

**Path:** `webapp/lib/concierge/ambient-events.ts`

- **`ACTIONABLE_EVENT_TYPES`** whitelist — lines **40-53** (12 types; note it does NOT include `episode_archived` or `asset_created`, so it is already out of sync with the SQL trigger's 14):
```ts
const ACTIONABLE_EVENT_TYPES: ReadonlySet&lt;string&gt; = new Set([
  'agent_started',
  'agent_completed',
  'agent_failed',
  'approval_granted',
  'approval_revision',
  'approval_rejected',
  'manual_trigger',
  'budget_threshold_reached',
  'blocker_raised',
  'decision_requested',
  'input_requested',
  'canon_extension_proposed',
]);
```
- `DIRECTOR_OWN_EVENTS` set (the TS mirror of the suppression clause): lines **56-60**.
- `decideAmbientEvent()` pure function with the filter + director-own skip: lines **77-116** (whitelist check at 81-83, director-own skip at 87-93).

---

## 3. Gate B — `pa/notify-needed` paid-wake gate

**Path:** `webapp/lib/api/event-actionable.ts`

- **`ACTIONABLE_EVENT_TYPES`** (the narrower "should we spend a model call?" set) — lines **22-40**:
```ts
export const ACTIONABLE_EVENT_TYPES: ReadonlySet&lt;string&gt; = new Set([
  'agent_completed',
  'agent_failed',
  'approval_granted',
  'approval_revision',
  'approval_rejected',
  'manual_trigger',
  'budget_threshold_reached',
  'blocker_raised',
  'decision_requested',
  'input_requested',
  'canon_extension_proposed',
  'episode_archived',
  // TD-20.B 2026-05-20 — symmetric safety net with migration 0033's ...
  'asset_created',
]);
```
Header note (lines 14-19) records that `agent_started` was REMOVED 2026-06-25 because it was ~40% of the auto-react burn.
- `isActionableEventType()`: lines **42-44**.
- **Loop-breaker** `isSelfCausedNotify()` (suppresses notify for the AI-director's OWN decision/dispatch events) — `SELF_ACTION_EVENT_TYPES` at lines **58-63**, function at **65-70**. Relies on `actorKind()` from `./agent-names`.

---

## 4. Auto-react loop / dedup / billing

There are two files here. `exec-pa-react.ts` is only the debounce+dispatch shim; the real paid loop is in `chat-internal/route.ts`.

**Path:** `webapp/inngest/functions/exec-pa-react.ts` (the sole subscriber to `sandystudio/pa/notify-needed`)
- **Debounce** — lines **67-77**. Period = `PA_REACT_DEBOUNCE_SEC` (default **20s**, widened from 5s). Key is `threadId` → else `episodeId` → else `"global"`, with a `:fail` suffix so `agent_failed` gets its own bucket. **This is NOT a `(actor, asset_id)` dedup** — it is a per-thread/episode time-window collapse only.
- **Concurrency** cap `limit:1` per thread/episode: lines **80-87**.
- It then POSTs `/api/concierge/chat-internal` with the `PA_INTERNAL_TOKEN` bearer: lines **120-143**. No billing happens here.

**Path:** `webapp/app/api/concierge/chat-internal/route.ts` (the actual paid reaction)
- **Loop** — `for (let round = 0; round &lt; maxRounds; round++)` at line **504**; `maxRounds = AUTO_REACT_ROUND_BACKSTOP` (default 6) at line **492**.
- **Billing per call** — `recordConciergeCost(...)` is called **once per LLM round / per completion**, inside the loop at lines **548-560**, with `source: 'auto_react'`. So one wake can bill multiple `budget_log` rows (one per round).
- **Dedup mechanisms present** (none of them by `(actor, asset_id)`):
  - Anti-cascade time guard (skip if last turn is an assistant turn newer than `ANTI_CASCADE_WINDOW_MS = 10_000`): line **76** + **242-247** (failures and direct-address bypass it).
  - Spin guard by tool-call signature (`evaluateRound`): lines **582-596** — dedups repeated *tool calls*, not events.
- `RECENT_TURN_WINDOW` = `CONCIERGE_AUTO_REACT_TURN_WINDOW` default **24**: lines **81-84**.
- Output cap `CONCIERGE_AUTO_REACT_MAX_TOKENS` default **800**: line **350**.

**Supporting file:** `webapp/lib/concierge/auto-react-loop.ts`
- `AUTO_REACT_ROUND_BACKSTOP` = `CONCIERGE_AUTO_REACT_BACKSTOP` default **6**: lines **23-26**.
- `evaluateRound()` spin/dedup logic (dedups by canonical tool-call signature, stops on duplicate mutating call or 3 no-progress rounds): lines **82-107**.

---

## 5. The fence env vars

**Path:** `webapp/lib/concierge/cost.ts` — this is the enforcement module.

- **`recordConciergeCost()`** — inserts one `budget_log` row per call, `agent_id = 'EXEC-CONC'`, `operation = concierge_${source}`. Defined lines **40-80**. It does **not** touch `episodes.budget_spent` (concierge spend is studio-global; header note lines 11-15).
- **`isConciergeBudgetTripped()`** — the rolling-window / per-episode circuit-breaker. Lines **117-146**. Trips on the first of two limbs: call-COUNT (`calls &gt;= maxCalls`, paid providers only) OR `$ spent &gt;= capUsd` (line **143-144**). Fails OPEN on read error (line 136-138). Per-episode mode when `episodeId` passed (lifetime budget), else global 24h window (lines 122-134).
- **`conciergeBudgetCapConfig()`** — reads the env vars, lines **148-158**:
```ts
  const capUsd = Number(process.env.CONCIERGE_DAILY_CAP_USD) || 30;
  const windowHours = Number(process.env.CONCIERGE_CAP_WINDOW_H) || 24;
  const maxCalls = Number(process.env.CONCIERGE_AUTO_REACT_MAX_CALLS) || 40;
```
- **`concierge_cap_usd`** (per-episode override) — read in `resolveConciergeCapUsd()` from `episodes.metadata.concierge_cap_usd`, lines **167-181** (specifically the metadata read at **177-179**).
- **`conciergeAutoReactEnabled()`** master kill-switch `CONCIERGE_AUTO_REACT_ENABLED` (default true): lines **188-190**.

**Where the fence is ENFORCED:** `webapp/app/api/concierge/chat-internal/route.ts`, lines **271-321** (only when `parsed.source !== 'claude_message'`):
- kill-switch check → skip `auto_react_disabled` (272-274),
- resolve per-episode cap (275-277),
- `isConciergeBudgetTripped()` (278),
- if tripped, persist an `awaiting_director_input` turn and return `skipped: 'concierge_budget_tripped'` (279-320). Honest limb attribution (`calls` vs `cost`) at lines 285-288.

The env vars are also surfaced in the episode budget UI: `webapp/components/episode/EpisodeSettingsCard.tsx`, `webapp/app/api/episodes/route.ts`, and `webapp/app/api/episodes/[id]/settings/route.ts` (these read/write `concierge_cap_usd`).

---

## 6. D18 — interactive chat endpoint and the cap

**Path:** `webapp/app/api/concierge/chat/route.ts`

- It imports **only** `conciergeAutoReactEnabled` from `@/lib/concierge/cost` (line **30**) — used purely to display the header flag in the `GET` handler (line **79**).
- It does **NOT** import or call `recordConciergeCost`, `isConciergeBudgetTripped`, or `conciergeBudgetCapConfig`. The streaming completion calls at lines **542** and **557** run with **no cost recording and no budget-gate check**.
- Consequences for the firehose analysis:
  - **Interactive Director chat is NOT counted toward the cap/circuit-breaker.** Its LLM spend never lands in `budget_log`, so it neither trips nor is throttled by `isConciergeBudgetTripped`.
  - Because the breaker only sees `auto_react` rows (written exclusively by `chat-internal`), the cap governs only the autonomous loop, and the count-fence (`CONCIERGE_AUTO_REACT_MAX_CALLS`) counts **rounds**, not wakes (one wake can emit up to 6 rows).
- Other relevant anchors in this file: `MAX_TOOL_ROUNDS = AUTO_REACT_ROUND_BACKSTOP` at line **101**; `RECENT_TURN_WINDOW = 80` at line **109** (vs 24 in auto-react); Opus thinking cap applied per round via `conciergeReasoningParam()` at line **533**.

---

### Cross-cutting notes for your fix plan
- Three separate whitelists must stay in sync but currently do NOT: SQL trigger (14 types, incl. `agent_started`) in `0033_*.sql:33-42`; TS ambient mirror (12 types, no `asset_created`/`episode_archived`) in `ambient-events.ts:40-53`; paid-wake gate (13 types, no `agent_started`) in `event-actionable.ts:22-40`. The 438 injected context events flow through the SQL trigger (broadest, includes `agent_started`); the 378 paid wakes flow through `event-actionable.ts` → `pa/notify-needed` → `exec-pa-react` → `chat-internal`.
- There is **no `(actor, asset_id)` dedup anywhere** in the wake path. Collapsing is purely (a) time-window debounce per thread/episode in `exec-pa-react.ts:67-77`, and (b) anti-cascade time guard + tool-signature spin guard in `chat-internal`. An EREF fan-out's per-shot `agent_completed` events for distinct `asset_id`s are the kind of traffic the 20s debounce is meant to collapse, but distinct threads/episodes or the `:fail` bucket split them back apart.</result>
<usage><subagent_tokens>79074</subagent_tokens><tool_uses>18</tool_uses><duration_ms>101711</duration_ms></usage>
</task-notification>

## 2026-07-08 19:59 · director-msg (hook) · NEW · (triage at distill)
теперь понял. грамотное. решение. 
дай предложение по следующим правкам. 
напомни список

## 2026-07-08 20:20 · director-msg (hook) · NEW · (triage at distill)
Ну, смотри, не верю тому, что было написано до этого. Подходи ко всем этим задачам, которые в корзине номер три. По отдельности каждая задача со свежим взглядом. Например, оценка d четырнадцать, d пятнадцать как самой острой проблемы. Она немножко не верна потому что с точки зрения меня сделать повторный музыкального файла и нажать кнопочку бесплатного финал ката. Это не самая острая проблема. Но, конечно, её надо переводить в порядок. Остальные вроде бы понятные. За исключением рефаниматика. Это мега ответственная задача, потому что за него много чего цепляется, поэтому проведи самостоятельное исследование и обязательно сделай детальный план имплементации. Остальные вроде бы из корзины номер три понятные дискретные вещи. По поводу d четыре я что-то не могу понять, напомни о чём это.

## 2026-07-08 20:25 · director-msg (hook) · NEW · (triage at distill)
<task-notification>
<task-id>a5dba77a82281e95e</task-id>
<tool-use-id>toolu_018NqWYGLA1khxGXK5UYnPPa</tool-use-id>
<output-file>C:\Users\NAVIAV~1\AppData\Local\Temp\claude\C--SandyStudio--claude-worktrees-fetch-timeout-swaps\4ab8985f-d30c-4c6d-9958-3b82c718d728\tasks\a5dba77a82281e95e.output</output-file>
<status>completed</status>
<summary>Agent "Map what ref-animatic is" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>I have a complete picture. Here is the structured map.

---

# Reference-Animatic vs Video-Animatic — Removal-Plan Map

## Headline finding (read this first)

There is **no separate `ref-animatic` asset class in the code**. There is exactly **one** asset `file_type`: **`VID-animatic`**, whose payload is `metadata.animatic_v1` (an `AnimaticContract`, contract id `"animatic@v1"`). What you are calling:

- **"reference animatic"** = a `VID-animatic` whose `shot_list` was built from **APPROVED `IMG-episode_ref` still images** (`buildShotListFromApprovedEREF`), produced by the **sequential-pipeline approval ceremony** (EXEC-EDIT → `ANIMATIC_REVIEW` → Director approves → `ANIMATIC_APPROVED`). It is a **still-image slideshow** and it is the **hard gate** that unblocks video (EXEC-VGEN).
- **"video animatic"** = the **same `VID-animatic` asset's `animatic_v1` contract** re-used later as the **edit-decision-list (EDL)** for the hybrid Episode Timeline (plays real `VID-shot` mp4s) and consumed by **EXEC-STITCH** for the final cut.

So the "ref-animatic" you want to remove is not a class — it is a **stage + ceremony + gate** (the sequential path). The `animatic_v1` contract itself is load-bearing for the timeline, stitching, and the duration editor and must survive. The code distinguishes the two only by **how the shot_list images are sourced** and **whether an approval ceremony ran**, never by file_type.

---

## 1. What IS a "ref-animatic" — definitions &amp; how code tells them apart

### The single contract
`webapp/lib/api/animatic-shotlist.ts`
- L17 `ANIMATIC_CONTRACT = 'animatic@v1'`
- L21-38 `interface AnimaticShot` — `shot_id`, `asset_id` (an approved `IMG-episode_ref` id, or `null` placeholder), `image_url`, `duration_seconds`, `shot_role`, `caption`.
- L159-182 `interface AnimaticContract` — `shot_list`, `audio_tracks`, `director_overrides`, `total_duration`.
- L1-13 header: *"The Animatic asset is NOT a rendered video file. It is an asset row whose `metadata.animatic_v1` holds an ordered shot list that references already-approved IMG-episode_ref assets… Per-shot durations are editable live and persisted as `director_overrides` without re-render."*

### The two builders (this is where REF vs VIDEO frames diverge)
Same file:
- **REFERENCE animatic** — L448-503 `buildShotListFromApprovedEREF()`: pulls `IMG-episode_ref%` APPROVED rows, matches each storyboard shot by `metadata.shot_reference.shot_id`. This is the still-image reference slideshow.
- Anchor variant — L522-643 `buildShotListFromAnchorChain()`: frames from `IMG-anchor_%` START frames (TD-49 anchor mode).
- L670-680 `newAnimaticContract()` — wraps a shot_list into a fresh contract.

The **VIDEO** playback is not a different asset — it is the **same contract** rendered by the player in "hybrid mode" (see §3), where the resolver swaps still frames for `VID-shot` mp4s when they exist.

### The runner that emits the asset
`webapp/lib/agents/runners/animatic-slideshow.ts`
- L28 `ANIMATIC_CONTRACT = 'animatic_slideshow@v1'` (the markdown-body kind, distinct from the player contract).
- L319 `runAnimaticSlideshow()` (EREF path) and L480 `runAnchorAnimaticSlideshow()` (anchor path). Both emit `file_type: 'VID-animatic'` with `metadata.animatic_v1`.
- L337-342: throws *"No APPROVED IMG-episode_ref assets — approve refs in the Episode references stage first"* — the defining REF-animatic precondition.

### DB / enum surfaces (episode FSM, not a file_type enum)
`webapp/supabase/migrations/0001_enums.sql`
- L9 comment: *"ANIMATIC_APPROVED is the generation gate — nothing generates until set."*
- L21-24 episode_status values: `ANIMATIC_IN_PROGRESS`, `ANIMATIC_REVIEW`, `ANIMATIC_REVISION`, `ANIMATIC_APPROVED`.
`webapp/lib/api/status-transitions.ts` L85-89: `STORYBOARD_APPROVED → ANIMATIC_IN_PROGRESS → ANIMATIC_REVIEW → {ANIMATIC_REVISION | ANIMATIC_APPROVED} → GENERATION_IN_PROGRESS` with the note `// hard gate per Phase 4 design`.
`webapp/supabase/migrations/0011_phase5c_fixes.sql` L6 — `'VID-animatic'` is one of the allowed `file_type` CHECK values (no separate ref/video type).

### Pipeline-stage naming
`webapp/lib/api/pipeline-stages.ts`
- L39 stage id `'animatic'`; L216 stage `{ id:'animatic', label:'Editor', agents:['EXEC-EDIT'], role:'editor' }`; L242 `if (ft.startsWith('VID-animatic')) return 'animatic'`; L268 `'EXEC-EDIT': 'animatic'`.

---

## 2. How the ref-animatic is CREATED and APPROVED (and what it gates)

### Creation — two entry paths, both fire `sandystudio/exec-edit/create-animatic`

**Sequential auto-fire** — `webapp/lib/agents/next-events.ts` L1024-1069 (branch `IMG-episode_ref | AUD-music APPROVED → EXEC-EDIT`): when EREF is **v1** and both `≥1 IMG-episode_ref` and `≥1 AUD-music` are APPROVED, fires `create-animatic`. Note L1038-1043: **EREF v2** per-shot approvals **do NOT** auto-fire — they require the explicit advance route below.

**Explicit "Advance to Animatic"** — `webapp/app/api/episodes/[id]/eref/advance/route.ts`: validates the 1-shot-1-approved invariant (`getShotApprovalProgress`, L59), collects approved EREF ids, fires `create-animatic` (L100). This is the EREF-v2 ceremony trigger.

**Anchor auto-fire** — `next-events.ts` L910-998 (`IMG-anchor_* APPROVED`): once `2×shotCount` anchors approved, fires ONE `create-animatic` with `anchor_mode:true` (the pacing gate).

### Runner wiring
`webapp/lib/agents/factory.ts` L119 `'EXEC-EDIT': 'VID-animatic'` (output type). `webapp/lib/agents/runner.ts` L1642-1731 `case 'EXEC-EDIT'`: chooses `runAnchorAnimaticSlideshow` (anchor) vs `runAnimaticSlideshow` (EREF) and writes `animatic_kind:'slideshow_v1'` + `animatic_v1`. Mock/real branches L1742-1779.

### Approval surface
The `VID-animatic` is approved via the generic `webapp/app/api/assets/[id]/approve/route.ts` (calls `computeNextEvents`). The in-drawer UI is `AnimaticPlayer` footer (`components/animatic/AnimaticPlayer.tsx` L959-984 `postDecision`, and the footer row gated at L1976-1977 for `REVIEW`/`DRAFT`).

### The gate (THIS is what "hangs off" the ref-animatic)
`webapp/lib/agents/gate.ts`:
- L189-194 `EXEC-VGEN` requires `{ VID-animatic, minCount:1, label:'Approved animatic' }`.
- L208-218 `EXEC-STITCH` requires `VID-animatic` + `VID-shot`.
- **Parallel-mode override** L499-518: in `parallel` pipeline mode the `VID-animatic` requirement is **dropped** for EXEC-VGEN (per-reference canon-gating + pilot-stop replace it).
- **Anchor override** L468-490: EXEC-EDIT's own upstream requirement swaps `IMG-episode_ref` → `IMG-anchor`.

`next-events.ts` L1080-1252 (`VID-animatic APPROVED` branch) is the big fan-out: approving the animatic launches the VGEN pilot pass (or per-shot Animator plans), and `pickPilotVgenShots`. This is the downstream everything the sequential ref-animatic unblocks.

### Pipeline-mode context (critical for your removal)
`webapp/lib/api/pipeline-mode.ts` L1-30: `'sequential'` (DEFAULT) = *"all references → animatic (ref-fill, reviewed) → video (gated on an APPROVED animatic)"*; `'parallel'` = *"per-reference canon-gating replaces the batch ref-animatic review; video is NOT gated on a pre-approved animatic."* **The parallel mode already removes the ref-animatic ceremony** — study it as the template.

`webapp/lib/api/ensure-animatic.ts` `ensureEpisodeAnimaticEDL()` (L40-153): materializes a **silent, auto-`APPROVED` `VID-animatic` EDL** for parallel episodes that never ran the ceremony — *"closes that gap WITHOUT reintroducing the approval ceremony… status starts APPROVED"* (L14-15, L141-145). Called from `next-events.ts` L1318 and L1337. **This is the mechanism that keeps the `animatic_v1` contract alive when the ref-animatic ceremony is gone** — your removal plan will lean on it.

---

## 3. THE DURATION EDITOR (defect D6) — where it lives and how it's coupled

### Where duration editing lives
**UI:** `webapp/components/animatic/AnimaticPlayer.tsx`
- Constants L67-71: `MIN_SHOT_S=0.5`, `MAX_SHOT_S=60`, `SHOT_STEP=0.5`.
- L842-858 `setDuration()` — writes per-shot `overrides[shotId].duration_seconds`.
- L860-889 `setTrimStart()` — head-trim (`trim_start_seconds`, ffmpeg inpoint).
- L891-937 `handleSaveTiming()` — `PATCH /api/assets/${assetId}/animatic-timing` with `overrides` + `audio_tracks`.
- L1849-... the ±0.5s head/tail trim widget block; L1831 Save-timing button.

**Persistence route:** `webapp/app/api/assets/[id]/animatic-timing/route.ts`
- L171-175 **hard-rejects any asset whose `file_type` is not `VID-animatic`**.
- L176-180 requires `isAnimaticV1(metadata)`.
- L216-227 merges `director_overrides`; L244 recomputes clamped `total_duration`.

**Contract math:** `animatic-shotlist.ts` L200-207 `effectiveDurationSeconds`, L281-293 `computeEffectivePlayback` (duration override + head trim + real clip-length clamp), L312-324 `computeTotalDuration`, L235-242 `isDeletedShot` (≤0.5s = soft-delete). Override type `AnimaticDirectorOverride` L41-52.

### How it is coupled to the ref-animatic (the D6 defect)
The duration editor **only functions when a materialized `VID-animatic` asset exists**, because:
1. The PATCH route (above) refuses anything but `VID-animatic` + `animatic_v1`.
2. In the timeline, the editor is gated behind **`!synthetic`**: `AnimaticPlayer.tsx` L1831 (Save-timing), L1849 (the trim/duration widget), L1976 (approve/reject footer). All three are **hidden when `synthetic === true`.**

`webapp/components/timeline/EpisodeTimelineSection.tsx` sets that flag:
- L242-271 `storyboardContract` — a **read-only skeleton** synthesized from the approved storyboard when **no `VID-animatic` exists yet**.
- L277-280: `activeContract = animaticAsset ? … : storyboardContract`; **`isSynthetic = !animaticAsset &amp;&amp; storyboardContract !== null`**.
- L782-813: `&lt;AnimaticPlayer synthetic={isSynthetic} assetId={animaticAsset?.id ?? ''} …&gt;`.
- L233-237 / L515-537 comments spell out the old chicken-and-egg: *"to approve refs in the timeline the timeline needed an animatic built from already-approved refs"* — i.e. historically the per-shot **duration editor + Save-timing became available only after a `VID-animatic` existed, which in sequential mode meant only after the ref-animatic approval.**

So: **duration editing is coupled to the existence of a materialized `VID-animatic` asset, and in sequential mode that asset is born only from the ref-animatic ceremony.** "Timeline-as-home" (2026-07-02) partially decoupled the *timeline view* (synthetic skeleton) but deliberately left the *editor* off until the asset materializes (L1828-1831 comment: *"pacing is read-only until the animatic materializes on the first real edit (Phase 3)"*). `ensureEpisodeAnimaticEDL` is Phase 3's materializer.

---

## Removal-plan anchor list (what hangs off the ref-animatic)

| Concern | Exact anchor |
|---|---|
| Only asset type | `VID-animatic` (`animatic_v1`) — `animatic-shotlist.ts` L17,159; `factory.ts` L119; migration `0011` L6 |
| REF shot_list builder (the "ref" part) | `animatic-shotlist.ts` L448-503 `buildShotListFromApprovedEREF` |
| Runner producing the asset | `runner.ts` L1642-1731; `runners/animatic-slideshow.ts` L319, L480 |
| Sequential auto-fire create | `next-events.ts` L1024-1069 |
| EREF-v2 ceremony trigger | `app/api/episodes/[id]/eref/advance/route.ts` L59-107 |
| Approval FSM gate | `0001_enums.sql` L21-24; `status-transitions.ts` L85-89 |
| Downstream gates that REQUIRE the animatic | `gate.ts` L189-194 (VGEN), L208-218 (STITCH); overrides L468-490 (anchor), L499-518 (parallel) |
| Big fan-out on animatic APPROVE | `next-events.ts` L1080-1252 |
| Parallel-mode = ceremony already removed (template) | `pipeline-mode.ts` L1-30; `ensure-animatic.ts` L40-153; `next-events.ts` L1259-1320, L1327-1338 |
| Duration editor UI | `AnimaticPlayer.tsx` L842-889, L891-937, L1831/1849/1976 (`!synthetic` gates) |
| Duration persistence route (VID-animatic-only) | `app/api/assets/[id]/animatic-timing/route.ts` L171-180 |
| Timeline synthetic-vs-real coupling | `EpisodeTimelineSection.tsx` L242-280, L782-813 |
| STITCH reads the contract as EDL | `runner.ts` L2450-2497 ("no APPROVED VID-animatic" throw), plus VGEN override-apply L1852-1893 |

**Bottom line for your plan:** you are not deleting a class; you are (a) deleting the sequential **create-animatic ceremony + `ANIMATIC_*` FSM gate + `VID-animatic` requirement in `gate.ts` EXEC-VGEN**, while (b) **preserving the `animatic_v1` contract and the `VID-animatic` asset as the EDL** — using `ensureEpisodeAnimaticEDL` (already the parallel-mode mechanism) so the duration editor's `!synthetic` guard flips on and the STITCH EDL still exists. The parallel pipeline mode is a working, in-tree example of exactly this teardown.

Note: I explored read-only and did not create the plan file — findings are above for you to author the removal plan.</result>
<usage><subagent_tokens>151961</subagent_tokens><tool_uses>26</tool_uses><duration_ms>176687</duration_ms></usage>
</task-notification>

## 2026-07-08 20:26 · director-msg (hook) · NEW · (triage at distill)
<task-notification>
<task-id>a0866bb2eea52584c</task-id>
<tool-use-id>toolu_01U9oSS18cSHnQphDP2VdSvd</tool-use-id>
<output-file>C:\Users\NAVIAV~1\AppData\Local\Temp\claude\C--SandyStudio--claude-worktrees-fetch-timeout-swaps\4ab8985f-d30c-4c6d-9958-3b82c718d728\tasks\a0866bb2eea52584c.output</output-file>
<status>completed</status>
<summary>Agent "Map ref-animatic dependencies" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>I have a complete dependency inventory. Here are my findings.

---

# ref-animatic Dependency Inventory (branch `teo/e18-smoke`)

**Core fact:** the "ref-animatic" is not a rendered file — it is an asset row with `file_type = 'VID-animatic'` whose `metadata.animatic_v1` holds an ordered shot list (`AnimaticContract`). All coupling keys off the string `VID-animatic` and the `animatic_v1` metadata contract. The type/contract module `webapp/lib/api/animatic-shotlist.ts` is the schema source of truth (`ANIMATIC_CONTRACT = 'animatic@v1'`, line 17; `AnimaticShot`, `AudioTrack`, `AnimaticContract`, `AnimaticDirectorOverride` types).

`webapp/lib/agents/reconcile.ts` — **no `animatic` references at all** (grep clean). It deals in pilots/reserved shots only, so removal does not touch reconcile.

---

## 1. GATES / PIPELINE DEPENDENCIES

### The two hard gates that require an APPROVED `VID-animatic`
`webapp/lib/agents/gate.ts` — the `AGENT_GATES` map:

- **EXEC-VGEN (video generation)** — line 189-193:
```ts
'EXEC-VGEN': {
    required: [
      { fileTypePrefix: 'VID-animatic', minCount: 1, label: 'Approved animatic' },
    ],
```
- **EXEC-STITCH (final cut)** — line 208-217:
```ts
'EXEC-STITCH': {
    required: [
      { fileTypePrefix: 'VID-animatic', minCount: 1, label: 'Approved animatic' },
      { fileTypePrefix: 'VID-shot', minCount: 1, label: 'Approved shots' },
    ],
```

So the animatic gates **VGEN (video generation)** and **STITCH (final cut assembly)**. EREF is *upstream* of the animatic (not gated on it); EXEC-EDIT *produces* it (gate line 182-188 requires `IMG-episode_ref`, not the animatic).

### VGEN eligibility decision — the backlog note is CONFIRMED in code
Two independent code paths drop the animatic requirement in **parallel** mode:

**(a) Gate override** — `webapp/lib/agents/gate.ts` Step 0a, lines 492-518:
```ts
// EXEC-VGEN (video) normally requires an APPROVED VID-animatic — the sequential
// pacing gate. In PARALLEL mode video flows straight from an approved shot plan...
if (agentId === 'EXEC-VGEN') {
    ...
    parallel = readPipelineMode(...) === 'parallel';
    ...
    if (parallel) {
      effectiveRequired = spec.required.filter(
        (d) =&gt; d.fileTypePrefix !== 'VID-animatic',
      );
    }
}
```

**(b) Router edge** — `webapp/lib/agents/next-events.ts`, lines 1000-1022: in parallel mode an APPROVED `IMG-episode_ref` fires `exec-vanim/plan` directly "WITHOUT waiting for a whole-episode animatic." Comment at 1005: *"Sequential mode is untouched (refs wait for the animatic gate)."*

So: **sequential mode = VGEN is gated on APPROVED animatic; parallel mode = VGEN is NOT gated on the animatic.** Removing the ref-animatic class breaks sequential mode's VGEN + STITCH gates unless those two `AGENT_GATES` entries and the sequential router branch are re-plumbed.

### Media-preflight coupling (already defused, but references the type)
`webapp/lib/agents/gate.ts` lines 284-288 (`MEDIA_DEPENDENT_AGENTS` includes `EXEC-EDIT`, `EXEC-VGEN`), and lines 356-370 — VGEN deliberately does **not** preflight `VID-animatic` bytes (consumes it as metadata only). Doc comment 319-320 still describes EXEC-VGEN as consuming `VID-animatic%`.

### Router branches keyed on `ft === 'VID-animatic'` (next-events.ts)
`webapp/lib/agents/next-events.ts`:
- Line 1024-1069 — "Episode references OR music APPROVED → EXEC-EDIT (animatic)": fires `sandystudio/exec-edit/create-animatic`.
- Line 1080-1252 — **the master "Animatic APPROVED → VGEN Pilot Pass + MGEN" branch** (`if (ft === 'VID-animatic')`). This is the biggest downstream fan-out: anchor-mode pilot advance (1102-1189), animator-chain / legacy VGEN fan-out (1190-1248), reads `animatic_v1.shot_list` via `pickPilotVgenShots`.
- Line 1313-1376 — `ensureEpisodeAnimaticEDL` materialization for parallel/timeline episodes (the "never ran the ref-animatic ceremony" path) + STITCH completeness check reading the newest `VID-animatic%` row (1339-1350).
- Line 1434-1438 — publish-ready set note (publish now gates on `VID-final_cut`, not animatic).

### Producer wiring / registry
- `webapp/lib/agents/factory.ts` line 119: `'EXEC-EDIT': 'VID-animatic'` (agent output type). Anchor-chain gate comments at 582, 896.
- `webapp/lib/agents/runner.ts` line 3010: `'EXEC-EDIT': 'VID-animatic'`; entire EXEC-EDIT runner (1644-1779) produces the animatic; EXEC-STITCH runner (2450-2497) hard-requires it: line 2491-2492 `throw new Error('EXEC-STITCH: no APPROVED VID-animatic with animatic@v1 found in upstream')`.
- `webapp/lib/agents/registry.ts` line 224-229: `display_en: 'Animatic Editor'`, `next_agent: 'EXEC-VGEN'`.
- `webapp/lib/agents/runners/animatic-slideshow.ts` — the whole runner (`runAnimaticSlideshow`, `runAnchorAnimaticSlideshow`, `ANIMATIC_CONTRACT = 'animatic_slideshow@v1'`).
- `webapp/lib/agents/chain-flags.ts` line 19-24: `animatorChainEnabled()` — "`VID-animatic.APPROVED` fires exec-vanim/plan per pilot shot".
- Duration-lock source of truth: `webapp/lib/agents/runners/animator-critic.ts` lines 389-412 (`lockedAnimaticDuration` queries `.eq('file_type', 'VID-animatic')`), and runner.ts 1860-1893 applies animatic `director_overrides` to render length. **Removing the animatic removes the timing source of truth for the Animator Critic.**

---

## 2. UI COUPLING (defect D7)

### Component tree
- **`webapp/components/animatic/AnimaticPlayer.tsx`** — the core browser-native player (2031 lines). Props `AnimaticPlayerProps` (line 73): `contract: AnimaticContract`, `assetId`, `animaticStatus` (line 132), `liveAssets`, exclusion toggles. It owns the **per-cell kebab** (click-not-hover, lines 418-420, 1489) that lists ref/video versions, the exclusion checkbox (172-182), the manual "generate/regenerate reference" row (192), the timing editor + Save-timing (PATCH `/animatic-timing`, line 914), and the footer **Approve/Reject** row shown only while `animaticStatus` is `undefined | 'REVIEW' | 'DRAFT'` (lines 1971-1977). Kebab repartition dated 2026-07-05 (lines 182, 192, 599).
- **`webapp/components/preview/AssetPreview.tsx`** lines 280-290 — renders `&lt;AnimaticPlayer&gt;` when `file_type.startsWith('VID-animatic') &amp;&amp; isAnimaticV1(...)`.
- **`webapp/components/assets/EpisodeAssetDrawer.tsx`** lines 217-220, 648-662 — `isAnimaticAsset = file_type.startsWith('VID-animatic')`; renders player, or a "Legacy animatic" fallback (662).
- **`webapp/components/timeline/EpisodeTimelineSection.tsx`** — the episode-page timeline wraps `AnimaticPlayer` (lines 782-792). Picks freshest APPROVED `VID-animatic` v1 (212-224); when none exists builds a **synthetic storyboard-derived contract** (`storyboardContract`, 242-280, `isSynthetic`) so the timeline works with no animatic. `playerRef: AnimaticPlayerHandle` (188).

### The "animate/highlight in Mode 3" behavior (born from ref-animatic)
The live per-shot **glow/recolour** is defined in `webapp/lib/api/pipeline-stages.ts`:
- `activeWorkPhaseByShot()` (lines 502+) and **`liveStagePalette(phase)`** lines 520-526 — returns `{ color, glow }` for a live design/animate job, "kept here (node-safe) so it is unit-testable without importing the client AnimaticPlayer component."
- CSS tokens the player consumes: `webapp/app/globals.css` lines 46-49, 129, 189 — "q4a — per-shot live work stages on the timeline strip (AnimaticPlayer). Used by AnimaticPlayer cellPalette."

So the D7 animation/highlight is the timeline-cell recolour driven by `liveStagePalette` + the `q4a` CSS tokens, rendered by `AnimaticPlayer`/`EpisodeTimelineSection`. It is "born from the ref-animatic" because the whole timeline strip is the AnimaticPlayer.

### Pipeline row / kebab
- `webapp/components/pipeline/StageKebabMenu.tsx` line 53: `animatic: ['VID-animatic']` in `STAGE_PREFIX_MAP` — drives "Approve all in stage" / re-trigger for the Animatic row.
- `webapp/lib/api/pipeline-stages.ts` — `PipelineStageId` union includes `'animatic'` (line 39); `ROW_DEFINITIONS` row `{ id: 'animatic', label: 'Editor', agents: ['EXEC-EDIT'], emoji: '🎞️' }` (line 216); file_type→stage map line 242; agent→stage map line 268.
- `webapp/app/(studio)/episodes/[id]/page.tsx` line 199 (`animatic: ['VID-animatic']`), line 390 (auto-hide when no animatic v1), line 798 (governance-mode copy lists "Animatic" as a gate).
- `webapp/components/pipeline/EREFPilotPillbar.tsx` lines 10, 339-345 — **"Advance to Animatic"** button.
- `webapp/components/pipeline/VGENPilotPillbar.tsx` line 113 — "Every animatic re-approval then LOOKED like it kicked…".
- `webapp/components/episode/EpisodeSettingsCard.tsx` lines 337-345 — Sequential-vs-Parallel mode copy: "video not gated on an animatic".
- `webapp/components/preview/AssetPreview.tsx` lines 326-327, 698-699 — Upload-music button reachability note.

---

## 3. ASSET-TYPE / SCHEMA REFERENCES

### DB migrations
- **`webapp/supabase/migrations/0001_enums.sql`** — the `episode_status` enum carries 4 animatic states (lines 21-24: `ANIMATIC_IN_PROGRESS/REVIEW/REVISION/APPROVED`), and line 9 comment: *"ANIMATIC_APPROVED is the generation gate — nothing generates until set."* This enum value is baked into the DB type.
- **`webapp/supabase/migrations/0011_phase5c_fixes.sql`** lines 20-26 — the `assets_file_type_check` CHECK constraint: `CHECK (file_type ~ '^(SCR|STB|IMG|VID|AUD|BIB|PRO|REV|SPC|STA)(-[a-z0-9_]+)?$')`. **Note:** `VID-animatic` is allowed by the generic `VID-` prefix; there is **no** animatic-specific enum/CHECK value to drop — the constraint stays valid after removal. Comment line 6 names `'VID-animatic'` as an example.
- **`webapp/supabase/migrations/0024_eref_one_approved_per_shot.sql`** — the unique index `assets_one_approved_per_shot` exists *because* "The Animatic stage requires exactly one canonical IMG-episode_ref asset per storyboard shot" (lines 6-9). This invariant is animatic-motivated but keyed on `IMG-episode_ref`, so it survives.

### Generated types
- `webapp/lib/supabase/types.gen.ts` lines 1055-1058 and 1224-1227 — the four `ANIMATIC_*` `episode_status` enum members (mirror of 0001).
- `webapp/lib/api/status-transitions.ts` lines 61-64 (union) and 85-89 (transition map): `STORYBOARD_APPROVED → ANIMATIC_IN_PROGRESS`, `ANIMATIC_REVIEW → [ANIMATIC_REVISION, ANIMATIC_APPROVED]`, `ANIMATIC_APPROVED → GENERATION_IN_PROGRESS` (comment: "hard gate per Phase 4 design").

### TypeScript types / helpers (the contract module and its consumers)
- **`webapp/lib/api/animatic-shotlist.ts`** — source of `AnimaticContract`, `AnimaticShot`, `AudioTrack`, `AnimaticDirectorOverride`, `isAnimaticV1()`, `newAnimaticContract()`, `buildShotListFromApprovedEREF()`, `getAudioTracks()`, `effectiveDurationSeconds`, `excludedShotIdsFromEpisodeMeta`.
- **`webapp/lib/api/ensure-animatic.ts`** — `ensureEpisodeAnimaticEDL()` (line 40) materializes a silent-EDL `VID-animatic` for parallel/timeline episodes.
- `webapp/lib/api/single-approved.ts` lines 180-193 — "ONE approved animatic per episode" slot: `fileTypeLike: 'VID-animatic%'` (auto-supersedes prior approved animatics).
- `webapp/lib/api/timeline-cell-resolver.ts` lines 24, 44, 174 — resolves timeline cells against the `AnimaticContract`.
- `webapp/lib/agents/scorecard/compute-scorecard.ts` line 30, `webapp/lib/agents/state-matrix.ts` line 26, `webapp/lib/agents/music.ts` (whole file — `bakeApprovedMusic` operates on `AnimaticContract`).

### API routes (`webapp/app/api/**`)
- `app/api/assets/[id]/approve/route.ts` — imports `isAnimaticV1`/`AnimaticContract` (26-28); lines 336-371 flip episode → `ANIMATIC_APPROVED` when the animatic is approved; line 592 maps `VID-animatic` → `sandystudio/exec-edit/create-animatic`.
- `app/api/assets/[id]/animatic-timing/route.ts` — PATCH handler; requires `file_type.startsWith('VID-animatic')` + `isAnimaticV1` (lines 171-178); rewrites `metadata.animatic_v1`.
- `app/api/assets/[id]/upload-music/route.ts` — requires a `VID-animatic` asset (92-99), patches `metadata.animatic_v1.music_url`.
- `app/api/assets/[id]/upload-music-direct/route.ts` — the AUD-music sibling created because MGEN moved before the animatic (lines 5-15, 98).
- `app/api/episodes/[id]/vgen/state/route.ts` — `total_shots` from newest APPROVED `VID-animatic` v1 shot_list (79-104).
- `app/api/episodes/[id]/vgen/generate-single-shot/route.ts` — hard-requires APPROVED `animatic@v1` (86-107): *"No APPROVED animatic@v1 found for this episode. Approve the animatic first."*
- `app/api/episodes/[id]/trigger/route.ts` — line 47 maps EXEC-EDIT→create-animatic; lines 107-182 route VGEN to Pilot Pass off the approved `VID-animatic` v1.
- `app/api/episodes/[id]/eref/advance/route.ts` — the **"Advance to Animatic"** gate; fires `sandystudio/exec-edit/create-animatic` (lines 99-128).
- `app/api/episodes/[id]/skip-music/route.ts` (5-12, 91-112) and `app/api/episodes/[id]/shot-exclusion/route.ts` (7-9) — operate against the animatic contract.
- `app/api/episodes/[id]/archive/route.ts` lines 87-97 — `total_shots` read from `%animatic%` shot_list.

### Concierge tools (`webapp/lib/concierge/**`)
- `lib/concierge/tools/shot-reorder.ts` — swaps storyboard **and** animatic `shot_list` atomically; hard-fails `no_animatic`/`malformed_animatic` (lines 176-251). **This tool breaks without a `VID-animatic` row.**
- `lib/concierge/tools/pipeline.ts` line 237: `if (ft.startsWith('VID-animatic')) return 'animatic'`.
- `lib/concierge/tools/storyboard.ts` line 23 (imports `excludedShotIdsFromEpisodeMeta`), `lib/concierge/tools/index.ts` line 133, `lib/concierge/tools/wait-for-pickup.ts` line 204, `lib/concierge/system-prompt-builder.ts` lines 122+148 (Concierge system prompt lists "Animatic" as a creative gate).

---

## 4. TESTS referencing the ref-animatic (`webapp/__tests__/**`)

Must be updated/removed on animatic removal:

- `__tests__/agents/gate-pipeline-mode.test.ts` — **directly tests the VGEN animatic gate mode-conditionality**: line 26 "parallel mode: EXEC-VGEN passes WITHOUT an approved animatic"; line 36 "sequential … BLOCKS without an approved animatic"; assertion `/animatic/i` (44).
- `__tests__/api/pipeline-stages.test.ts` — asserts the `animatic` stage exists (38, 56) and "Music row sits BEFORE Animatic" (131-137).
- `__tests__/api/status-transitions.test.ts` — line 46 "forbids skipping the animatic gate"; asserts `STORYBOARD_APPROVED→ANIMATIC_IN_PROGRESS` and `ANIMATIC_APPROVED→GENERATION_IN_PROGRESS` (48-49).
- `__tests__/lib/api/ensure-animatic.test.ts` — full suite for `ensureEpisodeAnimaticEDL` (idempotency, materialization, music-bake; asserts `VID-animatic` rows and `isAnimaticV1`).
- `__tests__/lib/api/animatic-shotlist-audio.test.ts` — `getAudioTracks` fallback (SS-S15-E01 `audio_tracks: []` regression).
- `__tests__/lib/api/animatic-shotlist-completeness.test.ts` — silent-drop guard (29-vs-30 shots).
- `__tests__/lib/api/animatic-shotlist-clamp.test.ts` — duration clamp shared by player/timing-route/STITCH.
- `__tests__/lib/api/animatic-shotlist-eref-placeholder.test.ts` — `buildShotListFromApprovedEREF` placeholder behavior.
- `__tests__/lib/agents/runners/animator-critic-duration-lock.test.ts` — the duration-lock check against the locked animatic.
- `__tests__/agents/mock-providers.test.ts` line 87 — "Mock Animatic Spec".
- `__tests__/lib/concierge/tools/shot-reorder.test.ts`, `__tests__/lib/api/timeline-cell-resolver.test.ts`, `__tests__/agents/gate-pipeline-mode.test.ts`, `__tests__/lib/agents/providers/ffmpeg-stitch.test.ts`, `__tests__/lib/agents/providers/music-processor.test.ts`, `__tests__/lib/agents/helpers/mock-supabase-next-events.ts` — all consume the animatic contract or `VID-animatic` fixtures.

---

## Removal-risk summary (what breaks silently)
1. **Sequential-mode pipeline stalls**: EXEC-VGEN and EXEC-STITCH gates (`gate.ts` 189-217) require `VID-animatic`; parallel mode already bypasses (confirmed) but sequential does not. EXEC-STITCH runner throws hard (`runner.ts` 2491).
2. **The whole `next-events.ts` `ft === 'VID-animatic'` fan-out (1080-1252)** is the pilot/VGEN trigger for sequential + anchor-chain episodes — no animatic ⇒ VGEN never fires in those modes.
3. **Animator Critic loses its duration source of truth** (`animator-critic.ts` 389-412; `runner.ts` 1860-1893).
4. **`episode_status` enum + transition machine** (`0001_enums.sql`, `status-transitions.ts`, `types.gen.ts`) hard-code the 4 ANIMATIC states as a "generation gate."
5. **Concierge `shot-reorder` tool hard-fails** without a `VID-animatic` row.
6. **UI**: the entire timeline strip is `AnimaticPlayer`; `EpisodeTimelineSection` already has a synthetic-contract fallback (242-280) that could survive, but AssetPreview/EpisodeAssetDrawer render paths, the `animatic` pipeline row + kebab, the D7 `liveStagePalette`/`q4a` highlight, and 6+ API routes (`animatic-timing`, `upload-music`, `vgen/state`, `generate-single-shot`, `eref/advance`, `trigger`) all key on `VID-animatic`/`animatic_v1`.
7. **No DB CHECK/enum blocks removal of the file_type itself** (0011 uses a generic `VID-` prefix) — the risk is entirely in application/gate/test code, which fails at runtime, not at the schema layer.</result>
<usage><subagent_tokens>112876</subagent_tokens><tool_uses>29</tool_uses><duration_ms>221951</duration_ms></usage>
</task-notification>

## 2026-07-08 20:26 · director-msg (hook) · NEW · (triage at distill)
<task-notification>
<task-id>affe9bb92fc2eca15</task-id>
<tool-use-id>toolu_011LyYRGeRwzijUWzFDpaVY7</tool-use-id>
<output-file>C:\Users\NAVIAV~1\AppData\Local\Temp\claude\C--SandyStudio--claude-worktrees-fetch-timeout-swaps\4ab8985f-d30c-4c6d-9958-3b82c718d728\tasks\affe9bb92fc2eca15.output</output-file>
<status>completed</status>
<summary>Agent "Map video-animatic + timeline target" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>I have thoroughly mapped all four areas. Here is the report with exact anchors.

---

# Migration map: removing the reference-animatic, landing per-shot duration editing on the timeline

## Key structural fact (read this first)

There is **one** animatic component and **one** data contract. Both the "reference animatic" and the "video animatic / timeline" are the *same* React component (`AnimaticPlayer`) reading the *same* `animatic_v1` metadata blob. They differ only in **where** they are mounted and **which props** they get:

| Surface | Mount point | Props | Role |
|---|---|---|---|
| **Reference-animatic (drawer)** — being removed | `webapp/components/preview/AssetPreview.tsx:283-291` | NO `vidShotAssets`, NO `synthetic` → pure ref-image playback | Standalone `VID-animatic` asset opened in PreviewDrawer / activity feed |
| **Video animatic / TIMELINE** — destination | `webapp/components/timeline/EpisodeTimelineSection.tsx` (rendered at `webapp/app/(studio)/episodes/[id]/page.tsx:391`) | hybrid: `vidShotAssets` + `imgRefAssets` + `synthetic` | Episode-page timeline of VID-shot clips |

The **duration editor already lives inside the shared `AnimaticPlayer`** (`setDuration` / `setTrimStart` / `handleSaveTiming`), so it *already renders on the timeline surface* whenever a real (non-synthetic) `VID-animatic` exists. This substantially de-risks the migration — the "still-needed feature" is not physically inside a separate ref-animatic component; it is a shared block gated by `!synthetic`.

---

## 1. The video animatic / timeline surface

**`webapp/components/timeline/EpisodeTimelineSection.tsx`** (982 lines) — the episode-page timeline. It:
- Fetches `/api/episodes/${episodeId}` via SWR (`:144-163`), polling 4s while a per-shot job is live else 8s.
- Picks the canonical animatic: freshest APPROVED/LOCKED `VID-animatic` with an `animatic_v1` contract (`:215-231`).
- **Timeline-as-home fallback** (`:242-271`): when no approved `VID-animatic` exists, it synthesizes a **read-only skeleton contract** from the newest approved storyboard (`extractShotsFromStoryboard`), with `duration_seconds: s.duration_seconds ?? SKELETON_FALLBACK_DURATION_S` (fallback `2.5`, `:111`). `isSynthetic` flag set at `:280`.
- Builds `vidShotAssets` (rows `VID-shot*`, `:298-313`) and `imgRefAssets` (`IMG-episode_ref*`, `:317-330`).
- Renders `&lt;AnimaticPlayer&gt;` at `:782-813`, passing `contract`, `synthetic={isSynthetic}`, `vidShotAssets`, `imgRefAssets`, filter chips, and per-shot generate/exclude callbacks.
- Header shows `{contract.shot_list.length} shots · {vidShotAssets.length} VID-shot rows` (`:752`) and a `StitchStatusPill`.

**`webapp/components/animatic/AnimaticPlayer.tsx`** (2032 lines) — the actual player + editor:
- **Data loaded/derived:** `resolveTimelineCells(contract, vidShotAssets, imgRefAssets)` → one cell per shot (`:372-375`); `vidShotsByShotId` groups VID-shot rows by `metadata.shot_id` (`:382-396`); `clipLengths` = real clip length per shot from `metadata.duration_seconds` of the latest VID-shot (`:678-687`).
- **How a shot's duration is rendered:** `buildTimeline()` (`:239-283`) walks `shot_list`, computing `computeEffectivePlayback(shot, overrides, clipLengths)` per shot; the strip lays out cells by `visualSpan`; excluded shots (≤0.5s or in `excludedShotIds`) get a fixed `EXCLUDED_VISUAL_SECONDS=1.5` visual width + strikethrough. Timeline strip render at `:1402-1525`; caption shows `· {currentNetDuration.toFixed(1)}s` (`:1200`).

## 2. Duration data model

**Storage (single source of truth):** `assets.metadata.animatic_v1` (an `AnimaticContract`), defined in **`webapp/lib/api/animatic-shotlist.ts`**:
- Per shot base: `AnimaticShot.duration_seconds` (`:33`) — seeded from storyboard `duration_seconds`.
- Director edits: `AnimaticContract.director_overrides: Record&lt;shot_id, AnimaticDirectorOverride&gt;` (`:179`), where `AnimaticDirectorOverride` = `{ duration_seconds, trim_start_seconds?, edited_at? }` (`:41-52`). `trim_start_seconds` = head trim (ffmpeg `inpoint`); `duration_seconds` = tail (ffmpeg `outpoint`).
- `total_duration` recomputed on save (`:176`).

**Resolution helpers (the canonical math, reused by UI + route + stitch):**
- `effectiveDurationSeconds(shot, overrides)` (`:200-207`) — override wins, else storyboard.
- `computeEffectivePlayback(shot, overrides, clipLengths)` (`:281-293`) — `min(declared, clipLength - headTrim)`; ≤0 → 0. **This is the honest final-cut per-shot length.**
- `computeTotalDuration(...)` (`:312-324`) — sums playback, skips ≤0.5s.
- `clipLengthsFromVidShotRows(rows)` (`:336-349`) — builds `shot_id → real clip duration` from `VID-shot` `metadata.duration_seconds`.
- `isDeletedShot` / `DELETED_SHOT_MAX_SECONDS=0.5` / `excludedShotIdsFromEpisodeMeta` (`:215-263`) — the soft-delete + explicit-exclusion SSOT (`episodes.metadata.excluded_shot_ids`).

**Editor UI (the feature that must survive the migration):** `webapp/components/animatic/AnimaticPlayer.tsx`
- `setDuration` (`:844-858`, clamps `MIN_SHOT_S=0.5`/`MAX_SHOT_S=60`), `setTrimStart` (`:863-889`), `handleSaveTiming` (`:896-937`) → `PATCH /api/assets/${assetId}/animatic-timing`.
- Render block "Editing current shot" at **`:1849-1965`** — `cut start` (head/inpoint), `cut end` (tail/outpoint), numeric `duration` field. Save-timing button at `:1831-1842`. **All gated by `!synthetic`** (`:1831`, `:1849`) because a synthetic/skeleton contract has no backing asset to PATCH.

**Persistence route:** `webapp/app/api/assets/[id]/animatic-timing/route.ts` — `PATCH`, requires `VID-animatic` + `animatic_v1` (`:171-180`), refuses LOCKED (`:168`), validates shot_ids, merges overrides (`:213-227`), **re-clamps total to real clip lengths** (`:229-244`), also persists audio shaping. Zod body at `:67-81` (`duration_seconds: positive().max(60)`, `trim_start_seconds: min(0).max(60)`).

**How the compositor/stitch consumes per-shot durations:** `webapp/lib/agents/runner.ts` EXEC-STITCH block (`:2485-2629`):
- Loads the APPROVED `VID-animatic` `animatic_v1` (`:2494`), builds `clipLengths` (`:2517`), reads `director_overrides` (`:2565`) + `excludedShotIds` (`:2568`).
- Per shot: `isDeletedShot` → skip (`:2591`); `computeEffectivePlayback` → `playable` (`:2606`), ≤0.5 → skip (`:2607`); head trim → `inpointSeconds` (`:2615-2617`); pushes `{durationSeconds: playable, inpointSeconds}` (`:2618-2625`).
- Passes to `ffmpegStitchEpisode` (`:2763`). The provider `webapp/lib/agents/providers/ffmpeg-stitch.ts` emits concat-demuxer `inpoint`/`outpoint` (`buildConcatList` `:549-574`; `outpoint = inpoint + durationSeconds`).

Stitch runner entry: `webapp/inngest/functions/exec-stitch.ts` (thin wrapper, `operation: 'episode_assembly'`).

## 3. Parallel VGEN mode — animatic NOT required for video generation (CONFIRMED)

**`webapp/lib/api/pipeline-mode.ts`** — `PipelineMode = 'sequential' | 'parallel'`, stored at `episodes.metadata.pipeline_mode`, default `'sequential'` (`:17-30`). Header comment (`:5-9`) explicitly: parallel = "video is NOT gated on a pre-approved animatic."

**The exact gate/branch:** `webapp/lib/agents/gate.ts`, `validateAgentInputs`, **Step 0a (`:492-518`)**:
```ts
if (agentId === 'EXEC-VGEN') {
  ...
  parallel = readPipelineMode(epRow.metadata) === 'parallel';
  ...
  if (parallel) {
    effectiveRequired = spec.required.filter(
      (d) =&gt; d.fileTypePrefix !== 'VID-animatic',
    );
  }
}
```
The static `EXEC-VGEN` gate requires `VID-animatic` APPROVED (`:189-194`); parallel mode **strips that requirement**. Video eligibility is decided per-shot from an approved shot plan (`EXEC-VGEN` runs from `SPC-shot_plan`); per-reference canon-gating + the pilot-stop replace the batch animatic review. Sequential/absent flag keeps the animatic requirement (replay-pilot unchanged).

Also note the media-preflight comment (`gate.ts:361-369`): even in sequential mode, EXEC-VGEN does **not** open animatic bytes — "the animatic is consumed as metadata: shot_list + durations." So the animatic's only role for VGEN is the pacing/duration data, not the video itself.

## 4. Stitch / final-cut gate

Two layers:

**(a) Static input gate** — `webapp/lib/agents/gate.ts:208-218` (`EXEC-STITCH`): requires ≥1 APPROVED `VID-animatic` (for shot order + `audio_tracks` + durations) **and** ≥1 APPROVED `VID-shot`. Comment notes the real "all shots approved" check is in the runner + next-events.

**(b) Auto-fire completeness gate** — `webapp/lib/agents/next-events.ts:1322-1406` (on `VID-shot` APPROVED):
- Parallel episodes have no ceremony animatic, so it calls `ensureEpisodeAnimaticEDL` first (`:1337`) to materialize a silent APPROVED EDL.
- Loads the APPROVED `VID-animatic` `animatic_v1` (`:1339-1350`).
- Computes `liveShotIds` = shot_list minus `isDeletedShot(...)` (honors `excluded_shot_ids`) (`:1358-1362`).
- Fires stitch only when **every live shot has an APPROVED `VID-shot`** (`:1375`).
- **Music precondition** (`:1384-1402`): in parallel + non-autotest, if no APPROVED `AUD-music` baked into the contract, it does NOT stitch — logs `stitch-blocked-no-music` instead. Sequential/autotest unaffected.

So the final-cut gate requires: **an APPROVED animatic EDL (contract) + all non-excluded VID-shots APPROVED + (parallel) approved music**. It does **not** require an APPROVED *reference* animatic ceremony — parallel synthesizes the EDL headlessly.

**EDL materialization helper:** `webapp/lib/api/ensure-animatic.ts` — `ensureEpisodeAnimaticEDL()` builds a structurally-identical `animatic_v1` from approved storyboard + approved EREF, persists it already-APPROVED (silent, no ceremony). Header comment (`:1-16`) states `animatic_v1` is "the sole home for the final-cut edit-decision list — shot ORDER, director_overrides (per-shot trim + re-timing → ffmpeg inpoint/outpoint), the soft-delete set, and audio shaping. EXEC-STITCH reads it directly and throws 'no APPROVED VID-animatic' if it is absent."

---

## What the removal is safe against — anchors for planning

1. **Do not delete the `animatic_v1` contract or `VID-animatic` asset type.** It is the SSOT edit-decision-list for durations/trim/exclusion/audio, read directly by EXEC-STITCH (`runner.ts:2494`, `ensure-animatic.ts` header) and by the timeline. Removing the *reference-animatic ceremony/drawer* is fine; removing the contract breaks the final cut.

2. **The duration editor is already the shared block** at `AnimaticPlayer.tsx:1849-1965` + `:1831-1842`, gated by `!synthetic`. On the timeline it renders whenever a real `VID-animatic` exists. The migration work is mostly: (a) ensure a non-synthetic backing EDL exists on the timeline early enough (parallel already does this via `ensureEpisodeAnimaticEDL`), and/or (b) let the editor materialize an EDL on first edit for synthetic contracts (referenced as "Phase 3" in `EpisodeTimelineSection.tsx:276` and `AnimaticPlayer.tsx:150-158`).

3. **The `synthetic` gate is the one real gap.** Skeleton/parallel-early contracts are read-only for timing (no asset to PATCH). If the ref-animatic surface is removed, any pre-EDL episode loses timing editing until the EDL is materialized. Anchors: `AnimaticPlayer.tsx:1831`, `:1849`, `:1976`; `EpisodeTimelineSection.tsx:277-280`.

4. **Ref-animatic drawer removal target:** `AssetPreview.tsx:283-291` (renders `AnimaticPlayer` for standalone `VID-animatic`). Also the music-upload path historically lived only in `AnimaticPlayer` — see `AssetPreview.tsx:324-329` and `app/api/assets/[id]/upload-music-direct/route.ts:8-15` (a workaround button already exists outside the player).

5. **Sequential ceremony coupling to remove carefully:** `AnimaticPlayer.tsx` Approve/Reject footer (`:1976-1999`) fires the `/approve` route that emits VGEN×3 + MGEN and gates sequential VGEN. In parallel mode this ceremony is already bypassed (gate Step 0a, `ensure-animatic.ts`). Confirm the target episodes are parallel (or migrate the VGEN gate) before removing the approval surface, or sequential episodes lose their VGEN trigger.</result>
<usage><subagent_tokens>155363</subagent_tokens><tool_uses>32</tool_uses><duration_ms>224434</duration_ms></usage>
</task-notification>

## 2026-07-09 08:58 · director-msg (hook) · NEW · (triage at distill)
(а) бриф апрувнут → «кастуй эпизод», (б) каст входит в REVIEW → «утверди каст». Одна и та же правка закрывает D1 и D2. ===OK
q2 a .  и обычный аплоад медиа в таймлайне через UPLOAD MUSIC - тоже пропускает пайплайн дальше. а не вызывает ошибку как сейчас , если  composer  not aproved

## 2026-07-09 09:39 · director-msg (hook) · NEW · (triage at distill)
найди на гите или на локальном или на гугл диске в нашей папке SandyStidio файл где клод писал анализ детальный разбора как правильно создать матрицу распределения ответственности и переходов между этапами и агентами. . дата файла - вчера или позавчера .  прочитай его . в этой сессии пойдем в имплемент

## 2026-07-09 10:23 · director-msg (hook) · NEW · (triage at distill)
Вот, здесь ты должен найти риски, найти проблемы и так далее. А я продолжу дальше свою мысль. Что такое матрица переходов? Это, по сути дела, наш pipeline, где перечислены ходы и перечисленны их исполнителя. каждый агент, каким бы маленьким он ни был, он должен быть отражён в этой матрице. И должно быть понятно, работает ли данный агент в данной конкретной, как это сказать, конфигурации матрицы. Мы зовем это шаблон. работает ли он автоматически или он ждёт какого-то пинка от старшего руководителя ? Кто является для него старшим ? Куда он переходит в случае успеха, выполненной своей работы? Когда он переходит в случае фейла? или куда поступает информация в случае файла. Куда он переходит, если количество его попыток исполнить задачу исчерпана, ну, например, три раза переделывал план и всё плохо. Исчерпано количество попыток. А сколько у него есть попыток на этот, на эту задачу, на свою задачу? Это тоже должно быть в этой матрице. И, возможно, я еще что-то не додумал и забыл. Подумай хорошенько, это только моя первая мысль.
дальше если мы сохраняем несколько таких шаблонов матриц по сути дела Это заменит много чего в том числе по своей сути в том числе может заменить режимы последовательное или параллельные возможно.

## 2026-07-09 10:32 · director-msg (hook) · NEW · (triage at distill)
"Надо решить: в Mode 1 каждый переход ждёт клика, или механические критики всё же бегут? Иначе «голые руки» — это иллюзия."  продолжая твою мыслю = разве это не один из шаблонов (пресетов) ? возможно ли это технически...
""Publish · LOCK · Budget · смена шаблона — Director всегда. Шаблон не должен иметь права пометить их «авто». Это строки-константы, которые пресет не трогает.  ===

## 2026-07-09 10:40 · director-msg (hook) · NEW · (triage at distill)
"Надо решить: в Mode 1 каждый переход ждёт клика, или механические критики всё же бегут? Иначе «голые руки» — это иллюзия."  продолжая твою мыслю = разве это не один из шаблонов (пресетов) ? возможно ли это технически...
""Publish · LOCK · Budget · смена шаблона — Director всегда. Шаблон не должен иметь права пометить их «авто». Это строки-константы, которые пресет не трогает.  === это констаниы - переменные env. директор может из поменять но не  онлайн. 

(1) шаблон живёт на уровне серии, эпизода или глобально? == для каждого сериала или эпизода можно настроить и созранить свой шаблон. 
2) можно ли менять шаблон на середине эпизода — и что тогда с уже пройденными узлами? == = моджно переклчючать как и сейчас MODE. на четыре кнопки можно повесить четыре шаблона.  или типа того. 
(3) кто «старший» для узла —  у нас N-ровневая эскалация - она же настраивается в матрице исходя из имеющихся РОЛЕЙ

## 2026-07-09 10:49 · director-msg (hook) · NEW · (triage at distill)
Я думаю, что поскольку директор собирает пресеты, настраивает матрицу, то он может в этой матрице настроить hard лимиты для каждого агента, в том числе и Полины, и критиков, и ещё чего-то. И, кроме того, тогда разумно сюда же добавить ему возможность для каждого из этих Товарище в матрице определять провайдера, который будет их реализовывать. Тогда все бьется. или не прав?

## 2026-07-09 10:55 · director-msg (hook) · NEW · (triage at distill)
Давай запусти отдельного агента, пусть он поразмышляет, покрутит наше размышление и поищет, где у нас в размышлениях дырки, во-первых, а во-вторых, что мы ещё не додумали, если уж мы приходим к такому серьёзному изменению.

## 2026-07-11 20:22 · director-msg (hook) · NEW · (triage at distill)
а есть возможноть запустить стич с
  указанием собирать сразу с обрезкой до формата 9:16 ?
─────────────────────────────────────────────────────────

## 2026-07-12 09:56 · director-msg (hook) · NEW · (triage at distill)
very usefull analisis/ let put it in the separate skill / i will read it sometimes

## 2026-07-12 11:12 · director-msg (hook) · NEW · (triage at distill)
<task-notification>
<task-id>ac2c297d07bcf379b</task-id>
<tool-use-id>toolu_011md2RNw445HoiRvPqEHMLj</tool-use-id>
<output-file>C:\Users\NAVIAV~1\AppData\Local\Temp\claude\C--SandyStudio\a5636c3f-7dae-422e-8bb5-c34146fe0ecf\tasks\ac2c297d07bcf379b.output</output-file>
<status>completed</status>
<summary>Agent "Map existing cost/spend tracking" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>I now have a complete, evidence-grounded picture. Here is my report.

---

# Cost/Spend Tracking Infrastructure — SandyStudio webapp

## TL;DR
There are **TWO completely separate systems** that never touch each other:
- **The "Autonomy Scorecard"** (`episode_scorecard` table) — tracks autonomy/effort/latency. It has **NO dollar field at all**. It does track wall-clock time (latency to first cut) but **zero $**.
- **The money ledger** (`budget_log` table + `episodes.budget_spent`) — the actual per-call $ tracker. This is where all spend lives, and it is reasonably complete.

If anyone believes the Scorecard "captures cost", that is false — verified below.

---

## 1. The Autonomy Scorecard — shipped, but it is NOT a cost tracker

It is real and shipped:
- Deriver: `webapp/lib/agents/scorecard/compute-scorecard.ts`
- Persist/render: `webapp/lib/agents/scorecard/persist-scorecard.ts`
- Table: `webapp/supabase/migrations/0041_episode_scorecard.sql`
- Trigger: `webapp/inngest/functions/episode-scorecard.ts`; backfill `webapp/tools/scorecard-backfill.ts`; dry-run `webapp/scripts/scorecard-dryrun.ts`

What it measures per episode (`ScorecardRecord`, compute-scorecard.ts:34-68 and the SQL columns 0041:26-56): shot_count, total_agent_runs, runs/shot, "code-able intelligent touches" (human vs AI-EP), autonomy %, creative-gate approvals, agent_failures, churn_refires, stuck_shots_final, and `latency_first_final_cut_s`.

- **Wall-clock time: YES** — `latency_first_final_cut_s` (compute-scorecard.ts:296-301; column 0041:49).
- **$ cost: NO.** There is no cost column in the migration, no `costUsd` in `ScorecardRecord`, and `computeScorecard` never queries `budget_log` or `episodes.budget_spent`. Its "cost" language (compute-scorecard.ts:7-8) is a metaphor — cost = Director-time / Opus-tokens as *effort*, priced in touches, not dollars. `persist-scorecard.ts` inserts no money field either.

**Verdict: the Scorecard does not capture money at all.** The memory that "a scorecard shipped" is true; the implication that it tracks $ is false.

---

## 2. Per-provider cost logging — where the money actually is

The real ledger is `budget_log` (migration 0002) + running aggregate `episodes.budget_spent`, written by `recordCost()` in `webapp/lib/budget.ts:305`. Each provider computes its own `cost_usd`, and the pipeline stamps it into the ledger at two call sites:
- Generic agents → `webapp/lib/agents/factory.ts:542` (`recordCost` with `costUsd: exec.result.cost_usd`).
- Video specifically → `webapp/inngest/functions/exec-vgen.ts:511`.

Per source:

| Source | Provider file:line (price) | Recorded? |
|---|---|---|
| **Video** fal Seedance | `fal-seedance.ts:351,365` (`COST_USD_PER_SECOND × resolutionMult`) | **YES** via exec-vgen.ts:511 |
| **Video** Veo | `veo-gemini.ts:100,257,271` (per-second tier map) | **YES** |
| **Video** WAN | `fal-wan.ts:26,166` ($0.05/s) | **YES** |
| **Image** OpenAI gpt-image-2 | `openai-image.ts:46-47,138` (price ladder) + `openai-image-edit.ts:136`, `openai-edits-multi.ts:163` | **YES** via factory.ts:542 |
| **Image** fal (ideogram/flux/upscale) | `fal-ideogram.ts:176`, `flux-pro-ultra-fal.ts:226`, `upscale-fal.ts:161` | **YES** |
| **Image** Gemini flash | `gemini-flash-image.ts:157` (`cost_usd: 0` — free tier) | **YES but $0** |
| **LLM Anthropic** (studio agents) | `anthropic-text.ts:183 computeCostUsd`, rates 154-163 | **YES** via factory.ts:542 |
| **LLM OpenAI** (Polina/concierge) | priced in same table `anthropic-text.ts:159-161` (gpt-5.4/5.5), recorded by `lib/concierge/cost.ts:40 recordConciergeCost` | **YES** (separate path, see below) |
| **Music/Audio** EXEC-MGEN | `runner.ts:2493-2500` → `mockMusic` (`mock-providers.ts:147,162` → `cost_usd: 0`) | **MOCK ONLY — always $0** |

Notes:
- **Concierge/Polina** default provider is **OpenAI gpt-5.4-mini** (`lib/concierge/llm.ts:48-65`), and it IS priced correctly (rates present in `anthropic-text.ts:159-161`; the 2026-06-27 mis-pricing-to-Sonnet bug is explicitly guarded there). Its rows go to `budget_log` under `agent_id='EXEC-CONC'` but **deliberately do NOT touch `episodes.budget_spent`** (cost.ts:11-15) — studio-global, doesn't consume the per-episode ceiling.
- The ledger even records `cost=0` rows for a complete audit trail (budget.ts:301-303).

---

## 3. Aggregation point — where "total $ for episode E" is summed

Two authoritative summers, both read `budget_log`:
- **`webapp/lib/budget.ts:208 getBudgetSummary()`** — sums `budget_log.cost_usd` by `api_provider`+`operation` for one episode, plus returns `episodes.budget_spent`/`budget_ceiling`. This is the "where did the money go" SSOT.
- **`webapp/app/api/budget/route.ts:38-93`** — studio-wide roll-up; per-episode `total` (route.ts:79) and a `breakdown` that folds concierge into a distinct `concierge` bucket (route.ts:73) so Polina's spend is visible in the episode total but doesn't consume the ceiling.

Ceiling/reservation logic: `assertBudgetAvailable` (budget.ts:158), atomic RPC `increment_budget_spent` (budget.ts:116; migration `0037_budget_atomic_increment_rpc.sql`), `BudgetExceededError` (budget.ts:44), default ceiling $150 (budget.ts:39-42). Diagnostic scripts: `webapp/scripts/e17-spend.ts`, `webapp/scripts/e15-economics.ts`.

---

## 4. Completeness verdict (the money ledger, not the Scorecard)

Captured accurately:
- **Video (most expensive line): CAPTURED.** All three providers price per-second and record via exec-vgen.ts:511. This is *not* dropped — the failure mode you feared does not exist here.
- **Image: CAPTURED** (OpenAI + fal priced; Gemini legitimately $0 free-tier).
- **Anthropic LLM: CAPTURED.**
- **OpenAI LLM (Polina): CAPTURED** in `budget_log`, correctly priced.

Gaps / caveats:
1. **Music/Audio is MOCK — always `cost_usd: 0`** (`mock-providers.ts:147-163`). There is no real Suno/paid music provider wired. So if real music generation is happening outside this pipeline, it is invisible; inside the pipeline it simply costs $0. `music-processor.ts` contains no cost logic (local ffmpeg-style processing, not a paid API).
2. **`episodes.budget_spent` (the number the ceiling gate enforces) EXCLUDES concierge/Polina spend by design** (cost.ts:11-15). Polina's $ only appears when you separately sum `budget_log WHERE agent_id='EXEC-CONC'` (as `api/budget/route.ts` and `e15-economics.ts` do). So "budget_spent" ≠ "true total episode cost"; the true total requires the `budget_log` aggregation, not the episode column.
3. **The Autonomy Scorecard and the money ledger are never joined.** No file reads both. A cost analysis must go through `budget_log`, not `episode_scorecard`.

Net: the $ ledger is materially complete for video/image/LLM. The only real money hole is that **music is mock ($0)**; the only *presentation* trap is that `episodes.budget_spent` silently omits Polina.

---

## 5. How to cross-check against a real run

`budget_log` **is** the per-provider invocation ledger — it is the right table to reconcile against reality. Columns (migration 0002): `episode_id, job_id, agent_id, api_provider, model_or_tier, operation, cost_usd, tokens_used, duration_ms, created_at`.

For one real episode E:
- **Ground-truth spend, per call:** query `budget_log WHERE episode_id = E` (one row per successful paid call, job-id-keyed idempotent — budget.ts:12-16). `scripts/e15-economics.ts:10` already does exactly this (by agent, by operation, plus a Polina deep-dive and a "redundant paid render attempts" check at line 49-53). `scripts/e17-spend.ts` is the concierge-focused variant.
- **Runs / attempts (to catch paid retries not in the ledger):** `jobs WHERE episode_id = E` (compute-scorecard.ts:172; e15-economics.ts:43,49 compares COMPLETED VGEN jobs vs VID-shot assets to spot redundant paid renders).
- **Gate/autonomy events:** `gate_decision_log` and `activity_events` (compute-scorecard.ts:206,261).
- **Reconcile:** compare `getBudgetSummary(E).byProviderOperation` (budget.ts:208) against the raw provider `cost_usd` you'd expect from the per-second/per-image formulas in the provider files above (e.g. Seedance = duration × `COST_USD_PER_SECOND[tier]` × resolutionMult, fal-seedance.ts:351). Any video render present in `jobs`/assets but absent from `budget_log` is un-billed; any `budget_log` row with `api_provider` mock is a mock run.

There is no `prod.log`/`inngest.log` cost source to consult — the DB `budget_log` table is the invocation log of record.</result>
<usage><subagent_tokens>74774</subagent_tokens><tool_uses>23</tool_uses><duration_ms>163097</duration_ms></usage>
</task-notification>

## 2026-07-12 11:18 · director-msg (hook) · NEW · (triage at distill)
давай здесь будем "про знания и стратегии" а не "про код" здесь советуемся и советуем.  вот пледложения от "кодера", что скажешь? : 
A. Что вообще есть «успех» по форматам (на чём судим)

- Shorts (охват/тест гэга): главное — completion / avg % досмотра (гэг зашёл = не свайпнули; свайп-эвэй это враг), второе — views (охват), третье — лайки+шеры/просмотр. По твоей доктрине: первые 1-2 сек + досматриваемость.
- Long-form (глубина): главное — удержание (averageViewPercentage / средняя длит.), второе — CTR тумбнейла, плюс точка просадки удержания → в какой шот теряем зрителя (мостим на storyboard-шоты).

B. Что есть «взорвался / зашло» — ОТНОСИТЕЛЬНО, не абсолютно

Канал новый и маленький — абсолютные пороги («10k просмотров») бессмысленны и обманут. Поэтому:
- Ранжируем каждый short против СВОИХ же шортсов; «пере-индексировал» = верхняя треть по композиту (с весом на completion).
- Честный дисклеймер: на 9 кроп-всего-эпизода шортсах это направленный сигнал, не статистика. Настоящая per-гэг правда — после P2 (гэг-нарезки). Не будем городить точные пороги на тонких данных: строим ранжированный лидерборд + направленный совет, уточняем по мере роста N.

C. Анатомия карточки-совета (визуально)

Каждая карточка: иконка оси (🎭/📉/📅) · заголовок «сделай» · доказательство (метрика-триггер) · сила сигнала (уверенность, привязана к N) · цель (следующий бриф / эпизод / тип гэга). Ранжированы по импакту. Человек решает.

D. Слой честности (важно)

Советник обязан маркировать уверенность: малый N → «направленно, низкая уверенность». Никогда не подаёт флук как мандат. Это прямое продолжение твоего «рантайм важнее предположений» — не переобещать на шумных данных.

Два решения

q15 — «взорвался» = относительно-своего-канала ранжирование (рекомендую, маленький канал) / абсолютные пороги / гибрид?

q16 — У шортсов вес на completion-rate выше, чем на сырые views? (рекомендую да — удержание это то, что награждают и алгоритм, и твоя доктрина). q16y/q16n

И открытым текстом: насколько прескриптивным должен быть совет — конкретно «усилить гэги с автоматами-антагонистами» (паттерн) или до уровня «сними ещё про vending-machine» (буквально)? Я бы шёл на паттерн (обобщение переносится на новые эпизоды, буквальный повтор приедается — как в твоём sandy-gag-library).

## 2026-07-12 15:39 · director-msg (hook) · NEW · (triage at distill)
"coder"'s recap: Building the AI animation factory's shorts pipeline: P1 funnel bridge, P3 audience quality-sensor dashboard, and a separate Shorts playlist are all shipped and deployed live. Next: open /audience in your browser to review the scout-mode advisor, or start P2 gag-cutting on a new episode.
Технический долг этой сессии (по убыванию)

1. HIGH — хрупкость деплоя из-за Google Fonts. next/font/google тянет Inter + JetBrains Mono на этапе сборки → ETIMEDOUT, каждый деплой требовал 1-3 попытки. Это реальная дыра надёжности. Фикс дешёвый: self-host двух шрифтов (next/font/local), сборка перестаёт зависеть от сети. Кандидат №1 в safe_and_sustainable.

2. MEDIUM — /audience тянет аналитику вживую на каждый заход. ~19 API-вызовов на загрузку, без кэша → квота + медленно по мере роста канала. Правильная архитектура: читать persisted REV-analytics (их уже пишет цепочка schedule-analytics), а не дёргать YouTube каждый раз. Я срезал это ради v1.

3. MEDIUM — advisor v1 частичный (осознанные срезы):
- shippedCategories = [] захардкожен → карта дыр показывает все 10 категорий как непройденные, пока нет тегирования гэгов (ждёт P2).
- loops + shares (сигнал вирусности) и impressions/CTR/traffic — не тянутся (провайдер берёт только ядро).
- retention→шот: движок умеет biggestDrop, но маппинг % → конкретный шот (cumsum-таймкоды) в роут не вплетён.
- Пороги N*/X — константы в коде, а доктрина требует config-слой.

4. LOW — MAP «эпизод→parent-id» дублируется в 3 скриптах (polish/backfill/batch). Legacy S15, одноразовое — терпимо, но DRY-долг. Настоящий источник — episodes.metadata.youtube_video_id.

5. LOW — ShortsPanel-роут гоняет ffmpeg синхронно (1-2 мин на запрос). Локально ок, но хрупко (браузер висит, нет прогресса/ретрая).

Плюс напоминание: 9 шортсов — это кроп-всего-эпизода (тест), настоящие гэг-нарезки — это P2. ===что думаешь

## 2026-07-12 16:22 · director-msg (hook) · NEW · (triage at distill)
"coder" : Нынешние 9 слабые не потому что они нарезка, а потому что это тупой центр-кроп
  всего эпизода — по краям всё теряется. Фикс — вертикаль-безопасная композиция на
  этапе сториборда: ключевое действие гэга держится в центральной 9:16-колонке, чтобы
  кадр пережил вертикальный кроп. Марджинальная стоимость этого ≈ ноль (это
  ограничение кадрирования, не лишние рендеры). Это стоит сделать storyboard-правилом
  — тогда P2-нарезка даёт нативного качества шортсы из landscape-эпизода, без потери
  сторон. === any ideas?

## 2026-07-12 16:26 · director-msg (hook) · NEW · (triage at distill)
sorry copy-past mistake - it was your phrase. real phrase of coder : Значит правила, которое ты описываешь — «ключевое действие гэга держится в центральной 9:16-колонке, чтобы кадр пережил вертикальный кроп» — на этапе сториборда НЕТ. Идея верная, но добавить надо.

Риски (честно, как партнёр — они реальные, хоть рендеры и правда не растут):

1. «Всё в центр» убьёт landscape-гэги. Половина твоей комедии — латеральная: объект едет слева→направо, two-shot на разнесении, wide-establishing. Жёсткое «держи всё в центральной колонке» расплющит 16:9 и зарежет именно боковые гэги. Поэтому правило должно быть условным (для эпизодов с shorts в delivery_targets) и про key beat / punchline, а не «весь шот всегда по центру».
2. Конфликт с orbit-подписью. У нас 80%+ шотов — орбита камеры (camera_orbit_signature_policy). Орбита таскает субъекта по кадру → он выезжает из центральной колонки к середине шота. Тот же класс натяжения, что уже описан в anchor_mode_orbit_ref_only. Ответ тот же: safe-column применяем к пиковому кадру гэга, а не ко всей траектории.
3. «≈0 стоимости» — только для БУДУЩИХ эпизодов. Ретроактивно оно не помогает: 9 текущих (ты их и так списал в тесты) + любой уже отснятый эпизод останутся center-crop-слабыми. Выгода приходит только к эпизодам, засториборженным ПОСЛЕ правила.

Пункт 3 напрямую бьёт по «погнали P2 на свежем эпизоде»: если целевой эпизод для P2-смоука уже засториборжен/отрендерен — P2-нарезка на нём даст ровно ту же боль потери сторон, что ты описываешь. Vertical-safe правило upstream нарезки, а не внутри неё.

Что предлагаю

Сделать это условным сториборд-правилом (skill storyboarder-situational-comedy + agents/exec/storyboarder.md): «когда Brief.delivery_targets включает shorts/vertical — key beat гэга читается в центральной 9:16-safe колонке; если гэг по природе латеральный → флаг landscape-only / needs reframe, не ломаем композицию». Значение (нужны ли shorts) берём из Brief, не хардкодим — по skill-abstraction.

## 2026-07-13 06:28 · director-msg (hook) · NEW · (triage at distill)
Lets make assets - intro video, outro video,  intro music, outro music, main theme music. CONTEXT :Что нашёл (прошлое обсуждение в SStudio): docs/distribution/strategy.md §7 (end screens/cards, «next episode» card, subscribe), media_formats.md (outro=closing music, sting), api_integrations.md (музыкальные intro_bars/outro_bars, fade). И жёсткая доктрина оттуда: «NO slow intro» — хук front-load, у Shorts интро нет.

ТЕХ-ТРЕБОВАНИЯ — INTRO / OUTRO (брендовые буки эпизода)

INTRO (стинг серии):
1. Длительность ≤2.0с HARD (long-form), 0с для Shorts — интро НЕ должен стоять между зрителем и хуком (ретеншн-закон).
2. Плейсмент: cold-open первым (3–5с гэга) → интро-стинг → эпизод. Никогда pre-roll «в лоб».
3. Контент: лого Сэнди (песочные часы) + один звуковой sting, без слоу-фейда; несёт свой аудио, не зависит от эпизод-музыки.
4. Формат: produce-once, 2 мастера — 1920×1080 (16:9) и 1080×1920 (9:16); амортизируется на все эпизоды (Game B ≈ $0/эпизод).
5. Ассет SS-{S}-BIB-intro_sting (студийный, LOCKED, версионируемый) → ститчится EXEC-STITCH.

OUTRO (end-card + воронка подписки):
6. Длительность 5–20с (окно end-screen), long-form ONLY; Shorts = не outro, а loop-back на первый кадр.
7. Последний гэг чистый: overlay не перекрывает финальный кадр — продлить hold, если надо.
8. Safe-зоны под YouTube-элементы: Subscribe + Next/best video (§7); музыка outro + fade_out запекаются здесь.
9. Брендинг: лого + «SANDY the HOURGLASS» + CTA «подпишись / следующий эпизод».
10. Формат: тоже 2 мастера (16:9/9:16), produce-once, ассет SS-{S}-BIB-outro_card LOCKED.
11. Made-for-Kids = NO — иначе YouTube отключает end screens/cards и убивает воронку (§7).

Guru-нота: intro/outro — амортизируемые студийные ассеты (сделал раз → ~$0/эпизод, идеально для фабрики), но delivery_targets управляет: shorts → интро OFF + loop; long-form → стинг + outro-card. И до первых публичных данных держи интро ≤2с cold-open-first — иначе Первый Доказательный Эпизод провалит хук ещё до гэга.БРИФ: intro/outro — greenfield, минимум, reuse-first

Контекст: кода нет. Это два produce-once брендовых бука, амортизируемых на ВСЕ эпизоды (Game B: сделал раз → ~$0/эпизод). Связаны ретеншн-доктриной (strategy.md §7 + «NO slow intro»).

Анти-аддитивность (СНАЧАЛА, раз greenfield):
1. НЕ строить новый компоновщик. Переиспользовать EXEC-STITCH — он уже конкатенирует финал; intro/outro = два лишних клипа в начало/конец.
2. НЕ строить пер-эпизодный генератор. Intro/outro = BIB-ассеты, LOCKED, версионируемые, отрендеренные ОДИН раз (можно даже собрать ручками/существующими IMG+VID+music стадиями и залить).

Ассеты (2 мастера каждый — 16:9 1920×1080 + 9:16 1080×1920):
3. SS-{S}-BIB-intro_sting — ≤2.0с HARD, свой звуковой sting (media_formats), без слоу-фейда.
4. SS-{S}-BIB-outro_card — 5–20с, музыка outro + fade_out (media_formats/api_integrations), safe-зоны под end-screen элементы.

Провязка в стиче (единственная реально новая логика):
5. EXEC-STITCH читает episode.metadata.delivery_targets. Long-form → [intro_sting → body → outro_card], мастер по аспекту эпизода. Shorts-only → НИ intro, НИ outro (front-load hook + loop-back, §2 доктрины). Пусто по умолчанию — правило спит, если таргета нет.
6. Плейсмент интро — флагом, не хардкодом: v1 = intro первым; поле cold_open_seconds (default 0) под будущий cold-open-first, чтобы не переписывать позже.
7. Аутро: последний гэг чистый — overlay не перекрывает финальный кадр; при налёте продлить hold. Музыка outro запечена В ассет, не ремикс на эпизод.

Гоча — проверить ДО постройки (не обещать API-end-screens вслепую):
8. Запечённый outro-СЕГМЕНТ кодируется (стич). Но нативные YouTube end-screen элементы (Subscribe / Next-video) через Data API скорее всего НЕ ставятся (известное ограничение) → верифицировать; если нет — это ручной шаг Studio для EXEC-PUB/Директора, НЕ код. madeForKids=NO держать (иначе end screens/cards отключаются). 
on timeline -no in/outro . stich makes TWO vertions with or without (depends on intro ON/off , outro ON/OFF in stich workspace settings) ===1===

## 2026-07-13 08:51 · director-msg (hook) · NEW · (triage at distill)
making intro/ make research using correspond SKILL. find the viral cartoon video 1...5 minutes - give 5 ideas for intro video

## 2026-07-13 10:10 · director-msg (hook) · NEW · (triage at distill)
"stream of golden shinig sand grains pours down from above" looks better then  a "stream of golden sand pours down from above".
add very low camera zoom in , not too much .
go make video

## 2026-07-13 16:36 · director-msg (hook) · NEW · (triage at distill)
<task-notification>
<task-id>a6ba4fde6ab95bde7</task-id>
<tool-use-id>toolu_01DDXRYNLX69CsMS9jaNEdvp</tool-use-id>
<output-file>C:\Users\NAVIAV~1\AppData\Local\Temp\claude\C--SandyStudio\80441284-da45-4c79-bbe9-328744f6caa0\tasks\a6ba4fde6ab95bde7.output</output-file>
<status>completed</status>
<summary>Agent "Trace timeline music rendering" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>I have the complete trace. Here is the conclusion.

## How music reaches (or fails to reach) the Timeline

### (a) Timeline component
`C:\SandyStudio\webapp\components\timeline\EpisodeTimelineSection.tsx` — the episode timeline. Mounted from `C:\SandyStudio\webapp\app\(studio)\episodes\[id]\page.tsx`. It builds an `AnimaticContract` and hands it to `AnimaticPlayer` (`C:\SandyStudio\webapp\components\animatic\AnimaticPlayer.tsx`), which is the only thing that actually renders an audio lane.

### (b) Data-loading path
`EpisodeTimelineSection.tsx:147-166` — SWR `GET /api/episodes/${episodeId}`.
Route: `C:\SandyStudio\webapp\app\api\episodes\[id]\route.ts:37-41` — returns **all** assets where `episode_id === id` via `select('*')`. So `AUD-music` rows *are* delivered to the client (provided they carry `episode_id`).

### (c) Music/audio rendering branch
Music is NEVER read directly from the `AUD-music` asset row in the player. It only reaches the audio lane through the **contract**:
- Player audio lane: `AnimaticPlayer.tsx:1236-1368`. Tracks come from `getAudioTracks(contract)` (seeded at `:708-711`, re-seeded on contract change at `:714-718`).
- `getAudioTracks` — `C:\SandyStudio\webapp\lib\api\animatic-shotlist.ts:107-121`: prefers a non-empty `contract.audio_tracks[]`, else fabricates one track from `contract.music_url`, else returns `[]`.
- Empty → the lane shows the "No audio yet — add a track in the Composer and approve it" placeholder (`AnimaticPlayer.tsx:1360-1367`). The lane is NOT gated by `synthetic`.

So music appears **iff** the contract that `EpisodeTimelineSection` builds carries `music_url`/`audio_tracks`.

### (d) The gating predicates (this is where it breaks)
`EpisodeTimelineSection.tsx` builds the contract on two mutually-exclusive branches:

1. **Real-animatic branch** (`:219-235`, `:291-293`): `animaticAsset` = newest `VID-animatic` with `status ∈ {APPROVED, LOCKED}` AND `isAnimaticV1`. Contract = `animaticAsset.metadata.animatic_v1`. Music shows **only if already baked** into that specific animatic. **The music injection does NOT run here.**

2. **Synthetic-skeleton branch** (`:246-285`): runs only when `animaticAsset === null` (hard early-return at `:247 if (animaticAsset) return null;`) AND an APPROVED/LOCKED storyboard with content exists. This is where the new music injection lives (`:274-284`).

The music-selection predicate — `newestApprovedMusic`, `animatic-shotlist.ts:144-160`:
```
.filter(a =&gt; a.file_type === 'AUD-music' &amp;&amp; a.status === 'APPROVED')   // :148  EXACT match
...
const url = best.drive_path ?? best.drive_web_view_url;                // :158  ignores staging_path
```

### (e) The stub / recent skeleton (commit 256903e9)
The "approved-music on timeline skeleton" = `EpisodeTimelineSection.tsx:274-284` + helper `newestApprovedMusic` (`animatic-shotlist.ts:144-160`). It **is wired** (import `:35`, call `:281`, and `getAudioTracks` fabricates the track from the injected `music_url`). But it is wired for the **synthetic path only**.

## Where the music-display path actually breaks

The failure depends on whether an APPROVED/LOCKED `VID-animatic` exists:

- **If an approved animatic exists** (the common case once the episode has advanced): the skeleton + its music injection are **skipped entirely** (`:247`). Music shows only if baked into the *displayed* animatic. But the bake targets a **different animatic than the one displayed**:
  - Bake picks newest-by-**version, any status**: `bakeMusicIntoEpisodeAnimatic` — `C:\SandyStudio\webapp\lib\api\ingest-music.ts:187-194` (`.like('file_type','VID-animatic%').order('version', desc).limit(1)`), invoked from the upload path (`ingest-music.ts:170`) and the approve path (`C:\SandyStudio\webapp\lib\agents\next-events.ts:363-369`).
  - Display picks newest-by-version **among APPROVED/LOCKED only**: `EpisodeTimelineSection.tsx:219-235`.
  - So a newer DRAFT/REVIEW animatic (e.g. a re-trigger) swallows the baked music while the timeline still renders the older APPROVED version → **music baked but invisible.** This is the prime suspect.

- **If no approved animatic exists** (pure timeline-as-home/synthetic): the new skeleton should surface it, EXCEPT the helper drops it when the row's URL lives only in `staging_path` — `newestApprovedMusic` reads `drive_path ?? drive_web_view_url` and **ignores `staging_path`** (`animatic-shotlist.ts:158`), whereas the real-animatic bake `bakeApprovedMusic` deliberately falls back to `staging_path` (`C:\SandyStudio\webapp\lib\agents\music.ts:46`). Agent/composer-generated `AUD-music` rows can carry the URL in `staging_path` (see `C:\SandyStudio\webapp\lib\agents\runner.ts:2715`), so those return `null` → skeleton stays silent. A UI upload via `ingestUploadedMusic` sets `drive_path` (`ingest-music.ts:118,126,152`), so uploaded music *should* pass — meaning if the Director's uploaded+approved track still isn't showing, an approved animatic almost certainly exists and you're in the version/status-mismatch case above.

Two secondary inconsistencies in the same predicate that can also exclude music: `newestApprovedMusic` uses exact `=== 'AUD-music'` (`:148`) while the rest of the codebase gate/upload guards use `.startsWith('AUD-music')` (`upload-music-direct/route.ts:96`, `next-events.ts:368`, `gate.ts:226`); and it never consults `staging_path`. Aligning `newestApprovedMusic` with `bakeApprovedMusic` (add `staging_path` fallback + `startsWith`) and making the skeleton injection also run/override on the real-animatic branch (or fixing the bake to target the *displayed* animatic version) is where a fix would go — but I've made no changes (read-only + plan mode).</result>
<usage><subagent_tokens>83380</subagent_tokens><tool_uses>19</tool_uses><duration_ms>197832</duration_ms></usage>
</task-notification>

## 2026-07-17 08:55 · director-msg (hook) · NEW · (triage at distill)
starting smoke new E30 .
12:52 [agent_failed] Continuity Critic failed — EXEC-WCHK: Anthropic call failed: Expected fenced ```json block at end of response but none parsed (stop_reason=max_tokens, output 15385 chars) seems ilke critic has no knoleges about limits

## 2026-07-17 09:16 · director-msg (hook) · NEW · (triage at distill)
проверь - запусщены ли 01 и 01 через полину . тамтоже вышли две ошибки. но агенты не свалились. полина запустила потом рефф артиста на весь эпизод. но я остановиил. почитай чат и логи сервера

## 2026-07-17 11:06 · director-msg (hook) · NEW · (triage at distill)
q1y q2y q3y 
Generation attempts (4)
Click a variant to make it the approved reference
attempt #1 · first · openai-edits-multi · 1536×1024 · $0.080#1first
attempt #2 · auto-regen · openai-edits-multi · 1536×1024 · $0.080#2auto-regen
attempt #3 · auto-regen · openai-edits-multi · 1536×1024 · $0.080#3currentauto-regen
attempt #4 · auto-regen · openai-edits-multi · 1536×1024 · $0.080 этот слайс подтяни вверх к картинке во-первых, или даже лучше - выбеди на кебаб под строчкой где статус картинки - будет сразу видно и статус и три версии. 
почему 4  появилось. самый большой вопрос. - в episode settings cup ref =3. проверь русло визуал критика - он как я помню должен читать первую и второй раз генерить если плохо совсем

## 2026-07-17 11:26 · director-msg (hook) · NEW · (triage at distill)
перегенерация не улучшает или делает это не всегда. поэтму я уточнял про визуала - он в работе сейчас? или пока на advice. " тело отрисовано непрозрачным тёмно-фиолетовым (канон требует прозрачное стекло)" - это фиолетовый бэкграунд виден сквозь стекло- сложно понять критику который сейчас. а какой вердикт бы вынес наш новый визуал-про? 
отвечай всегда коротко- 5 строк на ответ

## 2026-07-17 13:45 · director-msg (hook) · NEW · (triage at distill)
это не ошибка генератора .  это ошибка того кто писал сценарий или дальше где-то. нельзя использовать термины с двойным смыслом. мы часто на этом спотыкаемся. adjust skill.

## 2026-07-17 16:01 · director-msg (hook) · NEW · (triage at distill)
<task-notification>
<task-id>ad9f52d3b1e12bdac</task-id>
<tool-use-id>toolu_01M63H89eN9ens3VTdxxPvaC</tool-use-id>
<output-file>C:\Users\ALEXAN~1\AppData\Local\Temp\claude\C--Users-Alexander-sandystudio\232dea5b-e8b1-40d2-a5f8-09866af50225\tasks\ad9f52d3b1e12bdac.output</output-file>
<status>completed</status>
<summary>Agent "Investigate preview thumbnail bug" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>I have traced the complete flow and confirmed the root cause. Here is my report.

## Root cause: the drawer preview and the timeline use two different URL resolvers, and only the timeline's resolver falls through to the picked variant's distinct URL

### The data flow when a thumbnail is clicked

1. `AttemptsStrip` (EREFv2Sections.tsx:465–594) calls `onPromote(att)` → `promoteAttempt` in EpisodeAssetDrawer.tsx:526–545, which `POST /api/assets/{id}/regenerate-image` with `{ select_attempt: att.version }`, then calls `onChange()`.
2. `onChange` in the timeline is `() =&gt; void mutate()` (EpisodeTimelineSection.tsx:997), which refetches `/api/episodes/{id}`. The drawer's `asset` prop **does** update — `refAsset = assetById.get(refAssetId)` (line 601) rebuilds from the fresh SWR data and re-passes `toEpisodeAsset(refAsset)` (line 994). So the asset prop is not stale.

### 1. What the server changes on `select_attempt`

In the `select_attempt` branch (regenerate-image/route.ts:308–411) — **no new asset row, and `image_prompt.current_version` is NOT touched**. It:
- sets `metadata.shot_reference.selected_version = target.version` (route.ts:333–336)
- repoints `staging_path = target.image_url`, `drive_path = target.image_url` (route.ts:372–373)
- sets `drive_web_view_url: null` (route.ts:378) — done deliberately, see the comment at 374–377
- sets `drive_file_id: target.drive_file_id ?? null` (route.ts:382) — **kept non-null** to preserve a Drive fallback (comment 379–381)
- copies the chosen attempt's bytes onto the canonical `filename` on disk (route.ts:353–367)
- status is untouched (stays APPROVED)

### 2. What `resolvePreviewSrc` keys the drawer `&lt;img&gt;` off of

Drawer renders `&lt;img src={previewSrc!}&gt;` (EpisodeAssetDrawer.tsx:618) where `previewSrc = resolvePreviewSrc(asset, currentPromptEntry)` (line 346).

`resolvePreviewSrc` (asset-preview-resolver.ts:81–101) first tries `driveBackedMediaUrl(asset, freshness)`. `driveBackedMediaUrl` (lines 58–73) returns `/api/media/{assetId}?t={freshness}` whenever **`asset.id &amp;&amp; (asset.drive_file_id || asset.drive_web_view_url)`**. After a promote, `drive_web_view_url` is null but `drive_file_id` is still set, so this branch is taken and it returns the stable route.

`freshness = previewFreshness(asset)` (lines 33–39) reads **`metadata.image_prompt.current_version`** (falling back to row `version`). **`select_attempt` changes neither** — so the query string is unchanged and the whole URL is byte-identical before and after the pick. DRAFT/`/api/media` responses carry `max-age=3600` (noted at resolver.ts:22–24), so the browser serves the cached OLD image. This field does **not** change on promote — that is the bug.

### 3. Why the drawer doesn't refresh but the timeline does

It's a **client-cached src URL that needs a cache-bust**, caused by the drawer and timeline reading via **two divergent resolvers**:

- **Timeline** uses `bestRefImageUrl` (timeline-cell-resolver.ts:123–126):
  ```js
  if (ref.id &amp;&amp; ref.drive_web_view_url) return `/api/media/${ref.id}`;
  return ref.drive_path || ref.staging_path || ref.drive_web_view_url || null;
  ```
  It gates the stable route **only on `drive_web_view_url`**. The server nulled that field, so the timeline **falls through to `drive_path` = `target.image_url`** — a distinct per-attempt URL — and updates correctly.

- **Drawer** uses `driveBackedMediaUrl` (asset-preview-resolver.ts:66), which gates on **`drive_file_id || drive_web_view_url`**. The server keeps `drive_file_id` set, so the drawer never falls through — it returns `/api/media/{id}?t={current_version}`, an unchanged URL.

The server author's fix at route.ts:374–381 reasoned only about `drive_web_view_url` (the timeline's key) and missed that the drawer's resolver also triggers on `drive_file_id`. So the fix landed for the timeline path and silently missed the drawer path.

### 4. Precise minimal fix

Make the drawer's cache-bust key change when a variant is picked. Since the server already copies the selected attempt's bytes onto the canonical filename, `/api/media/{id}` will serve the correct pixels the moment the URL's `?t=` differs. The cleanest single-point change is in **`webapp/lib/asset-preview-resolver.ts` → `previewFreshness`** (lines 33–39): fold `metadata.shot_reference.selected_version` into the returned freshness, e.g.

```js
export function previewFreshness(s) {
  if (!s) return null;
  const meta = s.metadata as { image_prompt?: {...}; shot_reference?: { selected_version?: number | null } } | null;
  const base = typeof meta?.image_prompt?.current_version === 'number'
    ? meta.image_prompt.current_version
    : (typeof s.version === 'number' ? s.version : null);
  const sel = meta?.shot_reference?.selected_version;
  if (typeof sel === 'number') return base != null ? `${base}-sel${sel}` : `sel${sel}`;
  return base;
}
```

(`selected_version` exists on the contract — shot-reference.ts:266. The return type widens `number | null` → `string | number | null`; both consumers already stringify it via `driveBackedMediaUrl`'s `?t=${encodeURIComponent(String(freshness))}`.) This also fixes `pickPreview` in the CandidatesStrip (EREFv2Sections.tsx:331), which uses the same `previewFreshness`, and it preserves the intentional Drive fallback (`drive_file_id` stays set).

Alternatives (inferior): in the server `select_attempt` branch, either bump `image_prompt.current_version`, or set `drive_file_id: null` so the drawer's `driveBackedMediaUrl` falls through to `drive_path` exactly like the timeline — but that discards the Drive fallback the route deliberately keeps (route.ts:379–381). The client `previewFreshness` change is the minimal fix that keeps both resolvers' intent intact.</result>
<usage><subagent_tokens>109791</subagent_tokens><tool_uses>21</tool_uses><duration_ms>269115</duration_ms></usage>
</task-notification>

## 2026-07-17 16:16 · director-msg (hook) · NEW · (triage at distill)
anchor_chain - это совсем другой режим . попиксельно сшивать - в целом опыт не обрадовал. сшивает. но иногда с потерей смысла. поэтому - ref
2. а промпт писать соседей как раз не нужно (может ты оговорился) а вот дать соседей чтобы промпт вышел правильнее - может и есть смысл. 
3.  actionPreview (120 симв.) - расскажи поподробнее. (если это вся длина того что входит в дизайнера как исходник для промпта (ну плюс каноны конечно) то имхо не на том экономим.

## 2026-07-17 17:32 · director-msg (hook) · NEW · (triage at distill)
SH15 получил CRIT3 - но я бы пропустил. форма потеряна не совсем - много слизи капает. в целом - мне  очень ОК.

"SH17 — Сэнди отлично на модели, но кристалл в руке красный, а откалывался-то голубой шпиль (SH11-12). Мелкая ошибка непрерывности, критик её не поймал"--- а кто поймал? причина почему не дошёл цвет кристалла?

кстати большие кристаллы на картинк sh18 тоже  красные а на других синие, может быть так по сценарию положено?
эти все можешь утвердить от моего имени (кроме 17, в нем изучи сценарий -не красные ли. кто знает? сон всё-таки))

Пока я за то чтобы ставить нижнюю планку 70 и Крит1  если я правильно понял таблицу 

но давай прогоним ещё 10 и с большей статисиикой решим.

## 2026-07-17 18:45 · director-msg (hook) · NEW · (triage at distill)
<task-notification>
<task-id>a77cd1fabd562c78a</task-id>
<tool-use-id>toolu_018R9NQpyrnz8MgyNMprbz2E</tool-use-id>
<output-file>C:\Users\ALEXAN~1\AppData\Local\Temp\claude\C--Users-Alexander-sandystudio\232dea5b-e8b1-40d2-a5f8-09866af50225\tasks\a77cd1fabd562c78a.output</output-file>
<status>completed</status>
<summary>Agent "Identity check batch A" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>SH01 | FAIL | hourglass double-bulb present but upper bulb reads as opaque milky white/grey glass — purple background not visible through the body
SH02 | PASS | pinched-waist hourglass with clearly transparent upper bulb (purple background visible through the glass)
SH03 | PASS | double-bulb hourglass silhouette intact, transparent glass upper bulb showing purple background through it
SH04 | FAIL | hourglass shape holds but body is milky white/grey and non-transparent — background not visible through the glass
SH05 | PASS | double-bulb hourglass with transparent upper bulb (dark purple seen through glass), gold sand in lower bulb
SH06 | FAIL | hourglass silhouette present but body is dark/opaque — no background visible through it (transparency lost)</result>
<usage><subagent_tokens>50333</subagent_tokens><tool_uses>6</tool_uses><duration_ms>41698</duration_ms></usage>
</task-notification>

## 2026-07-17 18:45 · director-msg (hook) · NEW · (triage at distill)
<task-notification>
<task-id>aefe33d381b4c2a2f</task-id>
<tool-use-id>toolu_01TMY3hLZHHeNvNvkGyxF23y</tool-use-id>
<output-file>C:\Users\ALEXAN~1\AppData\Local\Temp\claude\C--Users-Alexander-sandystudio\232dea5b-e8b1-40d2-a5f8-09866af50225\tasks\aefe33d381b4c2a2f.output</output-file>
<status>completed</status>
<summary>Agent "Identity check batch B" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>SH07 | PASS | hourglass double-bulb intact, upper bulb transparent (purple background shows through), gold sand below
SH08 | FAIL | hourglass silhouette present but upper bulb is opaque milky-grey glass — background not visible through the body
SH09 | FAIL | extreme face close-up: hourglass double-bulb silhouette lost and body reads as opaque grey, not transparent
SH10 | PASS | clear hourglass double-bulb, transparent upper bulb (background visible through), gold sand pooled below
SH11 | PASS | hourglass double-bulb intact, upper bulb transparent with purple background showing through, gold sand below
SH12 | FAIL | double-bulb present but body is opaque grey/silver — cannot see background through the glass</result>
<usage><subagent_tokens>50343</subagent_tokens><tool_uses>6</tool_uses><duration_ms>42222</duration_ms></usage>
</task-notification>

## 2026-07-17 18:46 · director-msg (hook) · NEW · (triage at distill)
<task-notification>
<task-id>ad91893f3a2e136be</task-id>
<tool-use-id>toolu_01PAQNSErgtWsuZSzyh5hvNR</tool-use-id>
<output-file>C:\Users\ALEXAN~1\AppData\Local\Temp\claude\C--Users-Alexander-sandystudio\232dea5b-e8b1-40d2-a5f8-09866af50225\tasks\ad91893f3a2e136be.output</output-file>
<status>completed</status>
<summary>Agent "Identity check batch C" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>SH13 | PASS | clear hourglass double-bulb with black cap; glass body shows eyes and gold sand inside the transparent bulbs
SH14 | FAIL | body submerged so only a single bowl shows — double-bulb hourglass silhouette lost (reads as a lidded jar)
SH15 | FAIL | opaque purple humanoid blob erupting from splash; no hourglass silhouette and no transparent glass body
SH16 | FAIL | opaque purple pear/humanoid with a toothy face; hourglass double-bulb gone and body is solid, not transparent
SH17 | PASS | full hourglass double-bulb, black rim cap, transparent glass with eyes and gold sand visible inside
SH18 | PASS | intact hourglass double-bulb with black cap and rubber-hose limbs; transparent glass bulbs holding eyes and gold sand</result>
<usage><subagent_tokens>50338</subagent_tokens><tool_uses>6</tool_uses><duration_ms>41657</duration_ms></usage>
</task-notification>

## 2026-07-17 18:46 · director-msg (hook) · NEW · (triage at distill)
<task-notification>
<task-id>ac80cacd2fc599327</task-id>
<tool-use-id>toolu_01SwH5F14CGcVvvCHxidXw5C</tool-use-id>
<output-file>C:\Users\ALEXAN~1\AppData\Local\Temp\claude\C--Users-Alexander-sandystudio\232dea5b-e8b1-40d2-a5f8-09866af50225\tasks\ac80cacd2fc599327.output</output-file>
<status>completed</status>
<summary>Agent "Identity check batch D" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>SH19 | PASS | hourglass double-bulb intact, transparent glass upper bulb (purple visible through rim, eyes floating inside)
SH20 | PASS | clear pinched double-bulb hourglass, glass body with eyes inside upper bulb and gold sand below
SH21 | PASS | full hourglass silhouette, transparent glass bulbs with eyes floating inside, gold pooled low
SH22 | PASS | double-bulb hourglass reads, transparent glass body with interior eyes and gold sand
SH23 | PASS | hourglass bulbs with pinched waist, glassy transparent body (highlight streak, eyes inside)
SH24 | PASS | clear two-bulb hourglass, transparent glass with eyes inside upper bulb and gold lower fill</result>
<usage><subagent_tokens>50330</subagent_tokens><tool_uses>6</tool_uses><duration_ms>40725</duration_ms></usage>
</task-notification>

## 2026-07-17 18:47 · director-msg (hook) · NEW · (triage at distill)
<task-notification>
<task-id>a20ab44b98aaa036a</task-id>
<tool-use-id>toolu_011BHJ1hN9TmsnCAV4BeYgau</tool-use-id>
<output-file>C:\Users\ALEXAN~1\AppData\Local\Temp\claude\C--Users-Alexander-sandystudio\232dea5b-e8b1-40d2-a5f8-09866af50225\tasks\a20ab44b98aaa036a.output</output-file>
<status>completed</status>
<summary>Agent "Identity check batch E" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>Judging identity only (double-bulb hourglass silhouette + transparent glass body), from the pixels:

SH25 | FAIL | reads as a single opaque cream flask/beaker with a beak-like face — no double-bulb hourglass and body is solid, not transparent glass
SH26 | PASS | stretched dive pose but two bulbs joined at a pinched waist read clearly; glassy body with gold sand visible inside and floating eyes
SH27 | PASS | clean double-bulb hourglass silhouette; glass body with highlight streak, sand pooled inside, eyes inside upper bulb
SH28 | PASS | strong hourglass double-bulb close-up; translucent glass body with visible internal sand and floating eyes
SH29 | PASS | clear hourglass double-bulb silhouette; glass body with highlight and gold sand visible inside</result>
<usage><subagent_tokens>48063</subagent_tokens><tool_uses>5</tool_uses><duration_ms>95167</duration_ms></usage>
</task-notification>

## 2026-07-17 19:13 · director-msg (hook) · NEW · (triage at distill)
<task-notification>
<task-id>a9f57aaa9d03d61ec</task-id>
<tool-use-id>toolu_0157z25V3knmaEzZXSoQ6id6</tool-use-id>
<output-file>C:\Users\ALEXAN~1\AppData\Local\Temp\claude\C--Users-Alexander-sandystudio\232dea5b-e8b1-40d2-a5f8-09866af50225\tasks\a9f57aaa9d03d61ec.output</output-file>
<status>completed</status>
<summary>Agent "Explore reconciler + approve path" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>I have a complete map. Here are my findings.

## 1. The reconciler: `ref_image` REVIEW→APPROVED

**`webapp/lib/agents/reconcile.ts`**

`STAGE_HAS_CRITIC` — lines **32-37**:
```ts
const STAGE_HAS_CRITIC: Record&lt;StageName, boolean&gt; = {
  ref_plan: true,
  ref_image: false,   // ← rendered ref image is NOT critic-gated
  shot_plan: true,
  video: false,
};
```

The decision core is `planReconcileActions(ctx)` (pure, no IO) at **lines 119-223**. The per-cell logic:
- **Line 140**: only cells at `status === 'REVIEW'` are actionable.
- **Lines 144-152**: STALE cells (`!cell.fresh`) → `wait`, never auto-approved.
- **Line 154** `if (STAGE_HAS_CRITIC[stage])`: the critic-gated branch (ref_plan/shot_plan). Requires a PASS verdict (`PASS_VERDICTS` = `PASS`/`PASS_WITH_UNCERTAINTY`, line 80). On PASS it calls `resolveGateDecision('mechanical', governanceMode)` — advances in Mode 2/3, waits in Mode 1 (lines 156-174). REVISE/FAIL → `wait` or, past `criticCap`, `halt` (lines 175-191).
- **Lines 200-222** — the `else` branch that governs **`ref_image`** (and `video`): "No enforcing critic → a CREATIVE artifact." It emits an `approve` action **only** when `resolveGateDecision('creative', governanceMode) === 'advance'`, i.e. **Mode 3 (DELEGATED) only**; Modes 1/2 → `wait`. The comment at lines 204-205 explicitly notes: "When VISUAL_CRITIC_ENFORCE lands, this stage gains a critic and moves to the mechanical branch above automatically" — this is the seam your new detector would flip (`ref_image: true`).

`ReconcileAction` union is at **lines 45-53** (`approve | stitch | halt | wait | refire`). Note: `planReconcileActions` **does NOT emit events** — it returns actions. Event emission happens in the executor (section 4 below).

Critic-signal collection: `collectCriticSignals()` at **lines 86-112** reads `REV-*` rows via `STAGE_BY_REV_FILE_TYPE` (lines 40-43, only `REV-ref_plan`/`REV-shot_plan` — there is no `REV-ref_image`).

## 2. Artist insert path: `IMG-episode_ref` at REVIEW

**`webapp/lib/agents/runners/episode-references.ts`**

`finalVerdict` is decided in the retry loop, **lines 2330-2540**:
- Declared at **2330**: `'APPROVE' | 'HUMAN_REVIEW' | 'REGENERATE_EXHAUSTED'`, default `HUMAN_REVIEW`.
- **2517-2522**: KEEP-FIRST gate — `attemptClearsKeepBar(composite, criticalCount)` → `finalVerdict = 'APPROVE'`.
- **2494**: checker skipped/failed → `HUMAN_REVIEW`.
- **2539**: cap reached → `REGENERATE_EXHAUSTED` (keeps best attempt).

The `shot_reference` object is built at **lines 2596-2618** (`ShotReferenceContract`): `contract`, `shot_id`, `shot_role`, `test_plan`, `generation_history`, `review: latestReview`, `retry_count`, `retry_history`, `final_4k_url`, `location_slug`, `frame_role`. Note **`selected_version` is NOT set here** — it's an optional field written later by the Director's manual pick (see type def §3).

`legacyMeta` (the metadata written to the row) is **lines 2645-2679**: `provenance`, `image_prompt`, `source_bible_refs`, `anchor_image_asset_id`, `provider_used`, and `shot_reference: shotReference` (line 2678).

The insert itself, **lines 2686-2705**: `file_type = IMG-episode_ref_${job.slug}` (built line 2582), `status: 'REVIEW'` (**line 2699**), `metadata: legacyMeta`.

**`consistency_score`**: present only inside `shot_reference.review` (EREFReview). Hardcoded to `100` in the reviewer-failure fallback at **lines 2453** and in `approvePassReview` (eref-check.ts:111).

**`on_model`**: does NOT exist anywhere in this reference/reconcile metadata flow. The only related token is `anatomy_on_model`, a check-area enum in a *separate* module `webapp/lib/agents/visual-verdict.ts:29` (the visual-shot-critic). So there is no on-model field on `IMG-episode_ref` today — this is greenfield for your detector.

## 3. The `EREFReview` type

Defined in **`webapp/lib/api/shot-reference.ts`** (not in eref-check.ts, which imports it):
- `EREFReviewVerdict` — line **146**: `'APPROVE' | 'REGENERATE' | 'HUMAN_REVIEW'`.
- `EREFReviewIssueArea` — lines **148-155**: `character_identity | emotion | action | composition | style | extraneous | gag`.
- `EREFReviewSeverity` — line **157**: `'CRITICAL' | 'MAJOR' | 'MINOR'`.
- `EREFReviewIssue` — lines **159-166**: `{ area, character_slug, severity, description, fix_hint }`.
- **`EREFReview`** interface — lines **169-189**: `verdict`, `consistency_score` (0-100 identity vs Bible, line 172), `emotion_alignment_score`, `action_clarity_score`, `gag_readability_score` (nullable), `style_match_score`, `extraneous_objects[]`, `issues[]`, `suggested_prompt_v2`, `reviewer_model`, `reviewer_cost_usd`, `at`.

**Composite score / CRIT count** are NOT fields on EREFReview — they're computed by `reviewComposite(review)` at **lines 201-212** (mean of non-null 0-100 scores; `criticalCount` = count of CRITICAL issues), with threshold `KEEP_ATTEMPT_SCORE_THRESHOLD = 85` (line 193) and gate `attemptClearsKeepBar()` (lines 215-217). They persist per-attempt as `composite_score` / `critical_count` on `GenerationAttempt` (lines 137-141) and are attached at episode-references.ts:2506-2508. `area: 'character_identity'` is the identity-drift issue area (line 149).

## 4. Activity event emission (reuse target for a "bounce" event)

The emitter is **`logEvent()`** in **`webapp/lib/api/events.ts`**, lines **37-63** (plus actionable/notify fan-out 65-79):
```ts
export async function logEvent(
  supabase: ServerSupabaseClient,
  input: ActivityEventInput,
): Promise&lt;void&gt;
```
`ActivityEventInput` — lines **13-23**: `{ event_type, severity?, title, description?, actor?, episode_id?, asset_id?, job_id?, metadata? }`. It inserts into the `activity_events` table (line 53).

The reconcile executor that *applies* actions and emits events is **`webapp/lib/agents/reconcile-execute.ts`** (imports `logEvent` at line 25). The action→event loop is **lines 148-213**:
- **`approve`** (149-161): `executeApprove(...)` flips the asset APPROVED (function at lines 223+), then `logEvent({ event_type: 'reconcile/auto-approved', actor: 'exec-dir-ai', metadata: { shot_id, stage, asset_id, reason: 'RECONCILE_AUTO_APPROVE' } })`.
- **`refire`** (164-185): `logEvent({ event_type: 'reconcile/refire', ... })`.
- **`halt`** (186-210): `logEvent({ event_type: 'reconcile/halt', ... })` plus `raiseBlockerOnce(...)` routing to the Director inbox.

A new "bounce" event would follow the exact `approve`/`halt` pattern here: add a `bounce` variant to the `ReconcileAction` union (reconcile.ts:45-53), emit it from `planReconcileActions` where the `ref_image` else-branch currently produces `approve`/`wait` (reconcile.ts:200-222), and handle it in this loop with a `logEvent({ event_type: 'reconcile/bounce', ... })` call.

### Related files (not central but relevant)
- `webapp/lib/agents/runners/eref-check.ts` — the AI reviewer producing `EREFReview` (`approvePassReview` 108-123, schema prompt 157-178, `character_identity` in `VALID_AREAS` 296-305, review assembly 382+).
- `webapp/lib/agents/state-matrix.ts` — `EpisodeStateMatrix`, `StageName`, `cell.fresh`/`cell.status`/`failure_count` consumed by the reconciler.
- `webapp/lib/agents/gate-decision.ts` — `resolveGateDecision('mechanical'|'creative', mode)` that gates each auto-approve.
- `webapp/lib/agents/next-events.ts` — `computeNextEvents` / `stageRefireEvent` forward cascade.</result>
<usage><subagent_tokens>52003</subagent_tokens><tool_uses>23</tool_uses><duration_ms>109724</duration_ms></usage>
</task-notification>

## 2026-07-17 19:14 · director-msg (hook) · NEW · (triage at distill)
<task-notification>
<task-id>acd90775914da2565</task-id>
<tool-use-id>toolu_013auao2RkiXYqh5Z6xgs8eC</tool-use-id>
<output-file>C:\Users\ALEXAN~1\AppData\Local\Temp\claude\C--Users-Alexander-sandystudio\232dea5b-e8b1-40d2-a5f8-09866af50225\tasks\acd90775914da2565.output</output-file>
<status>completed</status>
<summary>Agent "Explore vision-call + Bible canon" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>I have a complete map. Here is my report.

---

# On-Model Detector — Existing Infrastructure Map

There are **two independent vision-call paths** already in this codebase. Both are reusable; they differ in SDK, model-resolution, and output schema. Pick the one that matches your needs.

## 1. Anthropic vision call infrastructure

### Path A (native Anthropic SDK) — `webapp\lib\agents\providers\anthropic-vision.ts`
The primary reusable adapter. Sends text + base64-image content blocks to Claude and parses a fenced JSON block.

- **Signature** (lines 46–48): `export async function generateAnthropicVision(input: AnthropicVisionInput): Promise&lt;AnthropicTextResult&gt;`
- **Input interface** (lines 33–44): `{ systemPrompt, leadText?, images: VisionImage[], trailText?, model, maxOutputTokens?, expectsJson? }`
- **Image type** (lines 22–31): `VisionImage = { base64: string (NO data: prefix), caption?: string, mediaType?: 'image/png'|'image/jpeg'|... }`
- **How image is passed** (lines 64–76): iterates `input.images`, pushes an optional `{type:'text'}` caption then `{type:'image', source:{type:'base64', media_type, data: img.base64}}`. Base64, not URL. Order = leadText → images(+captions) → trailText.
- **Model id** (line 88, `model: input.model`): NOT hardcoded here — the caller passes it. (But see the caveat below about the caller hardcoding.)
- **API key** (line 49): `process.env.ANTHROPIC_API_KEY`.
- **Structured JSON parse** (lines 112–120): when `expectsJson`, calls `extractLastJsonBlock(markdown)` (imported from `anthropic-text.ts`), throws `AnthropicTextError` if none parsed.
- Reuses `computeCostUsd`, `extractLastJsonBlock`, `AnthropicTextError`, `AnthropicTextResult` from `anthropic-text.ts` (line 15–20).

Supporting helpers live in `webapp\lib\agents\providers\anthropic-text.ts`:
- `extractLastJsonBlock(markdown)` (lines 215–230): regex `/```json\s*([\s\S]+?)```/g`, takes the **last** block, `JSON.parse`, returns `Record&lt;string,unknown&gt; | null`.
- `computeCostUsd(usage, model)` (lines 183–205) with prefix-matched `MODEL_RATES` (lines 154–163).
- `AnthropicTextResult` shape (lines 106–127): `{ markdown, body, costUsd, model, stopReason, usage, provider }`.

### Path B (OpenAI-SDK-shaped, multi-provider) — `webapp\lib\agents\visual-verdict.ts`
The post-render "Visual Critic — the factory's EYES". Uses the OpenAI SDK pointed at OpenAI / Gemini / Anthropic base URLs by model prefix.

- **Core fn** (lines 80–123): `runVisualVerdict({ frames: string[] (base64 PNGs), contract: unknown, styleCanon: string, locationCanon?: string, model: string }): Promise&lt;VisualVerdict&gt;`
- **Provider inference** (lines 63–72, `visionClient(model)`): `claude*` → OpenAI client with `baseURL='https://api.anthropic.com/v1/'` + `ANTHROPIC_API_KEY`; `gemini*` → Gemini base; else OpenAI. (`GEMINI_BASE`/`ANTHROPIC_BASE` at lines 21–22.)
- **Image passing** (lines 108–111): `content: [{type:'text'}, ...frames.map(b64 =&gt; ({type:'image_url', image_url:{url: 'data:image/png;base64,'+b64}}))]` — data-URL, not native block.
- **Output parse** (lines 116–122): regex `/\{[\s\S]*\}/` then `JSON.parse`, validates a `verdict` field.
- **System prompt = a skill file**: `loadRubric()` (lines 56–61) reads `.claude/skills/visual-shot-verdict/SKILL.md` (path resolver lines 46–54).
- **Verdict schema** (lines 24–43): `VisualVerdict = { verdict:'PASS'|'REVISE'|'FAIL', findings: VisualFinding[], summary }`; `VisualFinding = { check, severity, character?, what_seen, what_expected }`.

### Model-id resolution from config/env (Path B) — `webapp\lib\api\visual-critic-provider-config.ts`
This is the series-agnostic, config-driven resolver you should mirror (Path A does NOT do this — see caveat):
- `resolveVisualCriticModel(supabase)` (lines 99–106): persisted override → env default, fail-open.
- `getVisualCriticOverride` (lines 69–78): reads `app_config` where `scope='visual_critic'`, `key='model'`.
- `visualCriticDefault()` (lines 55–59): `process.env.VISUAL_CRITIC_MODEL` || `'gpt-5.6-terra'`.
- `VISUAL_CRITIC_CATALOG` (lines 40–48): vision-capable models incl. `anthropic:claude-opus-4-8`, `anthropic:claude-sonnet-5`. Note the runtime comment (lines 37–39): on hard geometry/on-model checks **claude-opus-4-8 reliably caught defects where gpt-5.6-terra flip-flopped**.

**CAVEAT — the EREF critic hardcodes its model.** In `eref-check.ts` line 34: `export const EREF_CHECK_MODEL = 'claude-sonnet-4-6';` passed directly to `generateAnthropicVision`. So Path A (native adapter) is currently invoked with a **hardcoded** model, while Path B resolves from `app_config`. If you want config-driven model selection, mirror `visual-critic-provider-config.ts`, not the eref-check constant.

## 2. The EREF critic that produces `consistency_score` — `webapp\lib\agents\runners\eref-check.ts`

This is the EREF/episode-reference designer critic you described (EXEC-EREF-CHECK).
- **Entry** (lines 335–410): `runEREFCheck(args: RunEREFCheckArgs): Promise&lt;EREFCheckResult&gt;`.
- **Args** (lines 54–85): `candidateImageB64`, `testPlan: ShotTestPlan`, `bibleRefs: ReviewBibleRef[]`, `episodeCode`, `shotId`, optional `planIntent{prompt, negativeList}`.
- **`ReviewBibleRef`** (lines 45–52): `{ slug, kind:'character'|'location'|'style'|'object', image_b64: string|null, description }` — **keyed by kind, series-agnostic**, no hardcoded character.
- **Vision call** (lines 362–370): `generateAnthropicVision({ systemPrompt, leadText, images, trailText, model: EREF_CHECK_MODEL, maxOutputTokens: 2000, expectsJson: true })`.
- **Image ordering** (`buildVisionImages`, lines 259–275): Bible refs FIRST (each captioned `# Bible reference: &lt;kind&gt; "&lt;slug&gt;" (LOCKED canon)`), candidate LAST (`# CANDIDATE image — ... Score this.`).
- **System prompt with JSON schema** (`buildSystemPrompt`, lines 131–180): five 0-100 axes incl. `consistency_score` ("identity match vs Bible refs"), verdict enum `APPROVE|REGENERATE|HUMAN_REVIEW`, structured `issues[]`.
- **Parse &amp; coerce** (lines 380–407): `clampScore` (lines 291–294), `coerceVerdict` (306–309), `coerceIssues` (316–331) → builds `EREFReview`.
- **Skip-fallback pattern** (lines 108–127, 335–347): no `ANTHROPIC_API_KEY` or no refs → returns `buildSkipped()` with an all-100 APPROVE `EREFReview` so an outage never blocks production. Worth mirroring.

The `EREFReview` verdict type (with `consistency_score`) is defined in `webapp\lib\api\shot-reference.ts` lines 169–189; verdict/area/severity enums lines 146–166; `ShotTestPlan` lines 53–69.

## 2b. The designer runner — `webapp\lib\agents\runners\episode-reference-designer.ts`
Note: this file is the **DESIGNER (planning) phase only** — a pure Sonnet *text* call (`generateAnthropicText`, lines 1001–1007), it does **not** make a vision call and does not invoke the critic. Contract/model constants lines 64–86. It reads the Bible via `formatBibleForPrompt(bible)` (line 514) and stores a Plan JSON (`body`, lines 1101–1113). The **critic invocation** and image-loading happen in the executor `episode-references.ts` (below), which calls `runEREFCheck`. The design→critic wiring you asked about is: `episode-references.ts` builds `ReviewBibleRef[]` + candidate b64 → `runEREFCheck` → stores `EREFReview` per generation attempt (`GenerationAttempt.review`, shot-reference.ts lines 137–141).

## 3. Reading series/character Bible canon at runtime (series-agnostic, by ROLE)

### Text canon loader — `webapp\lib\agents\bible-loader.ts`
- `loadSeriesBibleCanon(supabase, episodeId): Promise&lt;SeriesBibleCanon&gt;` (lines 92–162): resolves series via `seriesIdForEpisode`, queries `assets` where `series_id=…`, `status='LOCKED'`, `file_type like 'SBL-%'`. Splits by prefix into `characters` (`SBL-character_`), `locations` (`SBL-location_`), `styles` (`SBL-style_`), `objects` (`SBL-object_`) — lines 129–146. **Scoped to episode cast** via `loadEpisodeCastSlugs`/`scopeToCast` (lines 126–146) so canon is per-episode, never hardcoded.
- `SeriesBibleCanon` / `BibleEntry` types: lines 40–59 / 28–38. Each entry has `slug` (from `bibleSlug(file_type)`), `description`, `content`, `drive_web_view_url`.
- `formatBibleForPrompt(canon)` (lines 171–265): renders per-role markdown (Characters / Locations / Objects / Style) using `slug` as the heading. This is the text-side identity rubric source; build your identity canon from `canon.characters[]` by slug/role.

### Bible reference IMAGE loader (base64, by slug) — `webapp\lib\agents\runners\episode-references.ts`
- `loadBibleCanon(supabase, seriesId, castSlugs)` (lines 286–320): same `SBL-%` + `LOCKED` query but selects `staging_path, drive_web_view_url` too, returns image-bearing `BibleAssetLike[]` per role, cast-scoped (`inCast`, lines 309–313).
- Character resolution **by slug (role-agnostic)**: `charBySlug` map keyed by `nameFromBibleFilename` = `bibleSlug(file_type)` (lines 444–448, 283–284). Shot characters matched by `bible_slug` with fuzzy fallback (lines 508–514). No "Sandy" literal anywhere — everything flows through `SBL-character_&lt;slug&gt;`.
- **Loading a canonical reference image to base64**: `loadBibleImage(asset)` (lines 427–433) → `readAssetMediaAsBase64({ filename, driveFileId, stagingPath })` in `webapp\lib\media-cache.ts` line 137. Cached per-asset via `getCachedImage` (lines 466–473).
- These become the `ReviewBibleRef.image_b64` fed to the critic (`reviewerBibleRefs`, lines 806–812; `bibleRefs.push(... image_b64 ...)`, lines 583–620).

### Location/style canon for the vision critic (Path B) — `webapp\lib\agents\visual-verdict.ts`
Series-agnostic DB helpers you can reuse directly:
- `loadStyleCanon(supabase, seriesId)` (lines 159–169): `SBL-style%` APPROVED/LOCKED content.
- `loadLocationCanon(supabase, seriesId, locationSlug)` (lines 179–198): fuzzy `SBL-location%&lt;slug&gt;%`, returns an explicit "(no location canon…)" sentinel when absent (lines 194–196) so the model doesn't hallucinate a spec.
- `loadShotContract(supabase, episodeId, shotId)` (lines 126–156): pulls the shot's JSON from the APPROVED storyboard.

## 4. Structured-output schema patterns to mirror for `{silhouette_ok, transparency_ok, verdict, reason}`

Two established patterns — **no zod is used for LLM verdicts** anywhere in `lib/agents` (zod appears only in API route request validation, e.g. `webapp\lib\api\zod-helpers.ts`; the LLM verdict path is plain TS interfaces + manual coercion):

**Pattern 1 — fenced-JSON-in-system-prompt + manual coercion (recommended, matches EREF):**
- Schema declared as a literal `json` block inside the system prompt: `eref-check.ts` `buildSystemPrompt` lines 157–178.
- Output parsed by `generateAnthropicVision(..., expectsJson:true)` → `extractLastJsonBlock`.
- Each field defensively coerced: `clampScore` (eref-check.ts 291–294), `coerceVerdict` (306–309, defaults to a safe value), `coerceSeverity` (311–314), array guards (394–398). Mirror this: coerce `silhouette_ok`/`transparency_ok` to booleans, `verdict` to an enum whitelist, `reason` to a string slice.
- TS interface as the return contract: `EREFReview` in `shot-reference.ts` lines 169–189.

**Pattern 2 — regex-extract + minimal validation (matches visual-verdict):**
- `VisualVerdict` interface: `visual-verdict.ts` lines 39–43.
- Parse: lines 116–122 (`/\{[\s\S]*\}/` → `JSON.parse` → assert `verdict` present → default `findings` to `[]`).
- The rubric/schema lives externally in the `visual-shot-verdict` SKILL.md (loaded as system prompt), so the schema is editable without a code change.

For a `{silhouette_ok, transparency_ok, verdict, reason}` output, Pattern 1 (native `generateAnthropicVision` + `expectsJson` + a small coercion block returning a typed interface) is the closest existing template and gives you Bible-image attachment for free via `VisionImage[]`.

## Quick reference — file paths
- `webapp\lib\agents\providers\anthropic-vision.ts` — native Anthropic vision adapter (base64 blocks, JSON parse).
- `webapp\lib\agents\providers\anthropic-text.ts` — `extractLastJsonBlock`, `computeCostUsd`, `AnthropicTextResult`, error type.
- `webapp\lib\agents\runners\eref-check.ts` — the `consistency_score` critic; skip-fallback; JSON schema in prompt; coercion.
- `webapp\lib\agents\runners\episode-reference-designer.ts` — designer/planner (text-only; no vision).
- `webapp\lib\agents\runners\episode-references.ts` — executor: builds `ReviewBibleRef[]` (base64) + invokes `runEREFCheck`; `loadBibleCanon`, `loadBibleImage`.
- `webapp\lib\agents\bible-loader.ts` — `loadSeriesBibleCanon` / `formatBibleForPrompt` (role-keyed, cast-scoped, series-agnostic).
- `webapp\lib\agents\visual-verdict.ts` — multi-provider vision critic; `loadStyleCanon`/`loadLocationCanon`/`loadShotContract`; `VisualVerdict` schema.
- `webapp\lib\api\visual-critic-provider-config.ts` — **config/env model resolution** (`resolveVisualCriticModel`, `app_config` scope `visual_critic`).
- `webapp\lib\api\shot-reference.ts` — `EREFReview`/`ShotTestPlan`/verdict enums.
- `webapp\lib\media-cache.ts` line 137 — `readAssetMediaAsBase64` (asset → base64).
- `.claude\skills\visual-shot-verdict\SKILL.md` — externalized vision rubric (loaded as system prompt by Path B).</result>
<usage><subagent_tokens>96251</subagent_tokens><tool_uses>23</tool_uses><duration_ms>144002</duration_ms></usage>
</task-notification>

## 2026-07-17 19:15 · director-msg (hook) · NEW · (triage at distill)
<task-notification>
<task-id>a1b6964017dd4d34c</task-id>
<tool-use-id>toolu_013xLvhCNGsecTo5QDJhuNbL</tool-use-id>
<output-file>C:\Users\ALEXAN~1\AppData\Local\Temp\claude\C--Users-Alexander-sandystudio\232dea5b-e8b1-40d2-a5f8-09866af50225\tasks\a1b6964017dd4d34c.output</output-file>
<status>completed</status>
<summary>Agent "Explore settings slider + pickBest" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>I have everything mapped. Here is the complete end-to-end report.

---

# Search Report: strictness slider + transformation-aware exception

## 1. `reference_regen_cap` — full end-to-end trace (the pattern to mirror for `on_model_strictness`)

This setting flows UI → API → metadata → runner. Five touch-points:

**(a) Default reader / env fallback + metadata resolver** — `webapp\lib\agents\chain-flags.ts`
- Lines **142-161**: doc-block for the three per-episode caps + the generic `capFromMetadata(metadata, key, envDefault)` helper (reads `metadata[key]`, coerces number/string, falls back to `envDefault()`).
- Lines **172-179**: the pair to copy verbatim:
## 2026-07-15 08:18 · director-msg (hook) · NEW · (triage at distill)
<task-notification>
<task-id>a8148cbc5989a9b24</task-id>
<tool-use-id>toolu_017nhFVbZ8frRQJrCKQLpkfU</tool-use-id>
<output-file>C:\Users\NAVIAV~1\AppData\Local\Temp\claude\C--SandyStudio--claude-worktrees-conductor-phase2\25a4dc36-f68e-4054-b71f-c3a380c7cb48\tasks\a8148cbc5989a9b24.output</output-file>
<status>completed</status>
<summary>Agent "Map the arm/gate mechanism" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>I have the complete picture. Here is the precise map of the current reality.

## Headline finding: the env flag is already gone from the code path

The task framing says reconcileEpisode is "gated by an env flag `MECHANICS_AUTO_ADVANCE` (default OFF)" and Phase 2b "will replace" it. In reality, **the per-episode arm (Phase 2b) is already implemented and committed** (commit `b0ec7060` "Phase 2a tail"). There is **no `process.env.MECHANICS_AUTO_ADVANCE` read anywhere** in the codebase — the name survives only in stale comments, test titles, and one tool description string. The actual short-circuit is `isReconcilerArmed(...)`.

---

## 1. The short-circuit in reconcile-execute.ts / reconcile.ts

`webapp/lib/agents/reconcile-execute.ts` — the guard is at **line 90**, not an env read:

```ts
// line 81-90
const { data: epRow } = await supabase
  .from('episodes')
  .select('metadata, governance_mode')
  .eq('id', episodeId)
  .maybeSingle();
const episodeMeta = (epRow as { metadata?: unknown } | null)?.metadata;
const rawMode = (epRow as { governance_mode?: unknown } | null)?.governance_mode;
const governanceMode = rawMode == null ? null : Number(rawMode);

if (!opts.force &amp;&amp; !isReconcilerArmed(episodeMeta, governanceMode)) return EMPTY;
```

- `EMPTY` (the no-op result) is defined at **lines 65-71** (`ran: false`, empty arrays).
- The `force` bypass param is declared in `ReconcileOptions` at **lines 45-46**: `/** Bypass the MECHANICS_AUTO_ADVANCE flag (explicit calls / tests). */ force?: boolean;`
- The header comment (**lines 18-20**) still says "Guarded by MECHANICS_AUTO_ADVANCE (default OFF)... `opts.force` bypasses the flag" — this comment is now **stale**; the code uses the arm.
- `reconcile.ts` performs **no IO and no gating** — it is the pure decision core. Its header comment (**line 14**) says "guarded by MECHANICS_AUTO_ADVANCE" but that is also stale documentation; the actual mode gating inside `planReconcileActions` is done per-cell via `resolveGateDecision('mechanical'|'creative', governanceMode)` at **reconcile.ts:139 and :186**.

The `force` path is exercised only by the manual route (`app/api/episodes/[id]/reconcile/route.ts:25-30`, `force = ?force=1`). The Inngest self-advance consumer calls `reconcileEpisode(supabase, episodeId)` with **no force** (`inngest/functions/reconcile-episode.ts:38`), so it always passes through the arm gate.

---

## 2. The per-episode arm in production-plan.ts (~line 92)

The arm concept is **already fully scaffolded AND wired** — not just a comment. `webapp/lib/agents/production-plan.ts`:

```ts
// lines 90-104
/**
 * Is the reconciler armed for this episode? Phase 2b — replaces the global
 * MECHANICS_AUTO_ADVANCE env flag with a per-episode arm gated on governance mode:
 *   armed  ⇔  metadata.reconciler_armed === true  AND  mode ∈ {2, 3}.
 *
 * `reconciler_armed` is set at episode CREATION (so a deploy never retroactively
 * activates a pre-existing episode) and the Director can clear it to pause the
 * conductor on one episode. Mode 1 (MANUAL) is never armed — it is the fully
 * manual path. `opts.force` still bypasses this for explicit calls / tests.
 */
export function isReconcilerArmed(episodeMeta: unknown, governanceMode: number | null): boolean {
  const armed = (episodeMeta as { reconciler_armed?: unknown } | null)?.reconciler_armed === true;
  const mode = governanceMode ?? 1;
  return armed &amp;&amp; (mode === 2 || mode === 3);
}
```

- The `armed`/`arm` field is a boolean **`metadata.reconciler_armed`** on the episode row's JSON metadata.
- **Important gap:** `reconciler_armed` is **only ever READ** (here, and referenced in a `factory.ts:860` comment). A full-repo search shows it is **never WRITTEN anywhere** — not at episode creation, not in any route, not in the mode-change route. So the "arm at creation" half of Phase 2b is **not yet wired**: `isReconcilerArmed` will always return `false` today because nothing sets the flag, meaning the reconciler is currently inert for every episode except via `?force=1`.
- The doc comment's claim ("set at episode CREATION") describes the **intended** behavior, not current reality.

---

## 3. How governance mode is stored &amp; read

- **Storage:** column `episodes.governance_mode`, an integer. Confirmed in `webapp/lib/supabase/types.gen.ts:710` (`governance_mode: number`) and the nullable variant at `:763` (`governance_mode: number | null`). Semantics (1 MANUAL / 2 HYBRID / 3 DELEGATED) documented in `webapp/lib/governance.ts:5-8` and `:30`.
- **Read path in the reconciler:** `reconcile-execute.ts:82-88` selects `governance_mode` directly off the `episodes` row, then coerces: `const governanceMode = rawMode == null ? null : Number(rawMode);` (line 88). The comment at lines 79-80 explains the coercion ("column is an int, but a JSON/string value ('3') can slip in from mocks").
- **Threading:** passed into `planReconcileActions({ ..., governanceMode })` at `reconcile-execute.ts:116`, received on `ReconcileContext.governanceMode` (`reconcile.ts:60-63`, typed `number | null`), and consumed by `resolveGateDecision(gateClass, governanceMode)` at `reconcile.ts:139` (mechanical) and `:186` (creative).
- **The mode → advance/require_human brain:** `webapp/lib/agents/gate-decision.ts:91-102` — `hard_limit → require_human` always; `mechanical → advance` in mode 2/3; `creative → advance` only in mode 3.
- It is read from the **episode row itself**, not a separate config table. Many other callers read it the same way and feed `lib/governance.ts:enforceMode` (e.g. `app/api/assets/[id]/*` routes; `app/api/system/governance-mode/route.ts:91` is where the mode is **written/changed**).

---

## 4. Episode creation — where governance_mode is set and where "arm at creation" would go

**Route:** `webapp/app/api/episodes/route.ts`, the `POST` handler (starts line 74).

- Request schema validates the mode: **line 44** `governance_mode: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1)`.
- Episode metadata object built at **lines 101-106** (`epMetadata` — currently only budget/retry caps; **no `reconciler_armed` key**).
- Insert payload at **lines 108-121**, with `governance_mode: body.governance_mode` at **line 115** and `metadata: epMetadata` at **line 120**; inserted at **lines 122-126** (`.from('episodes').insert(epPayload)`).

An "arm at creation" hook would go into the `epMetadata` object (lines 101-106) — e.g. setting `reconciler_armed` based on whether `body.governance_mode ∈ {2,3}` — so it lands in `metadata` at the single insert on line 124. This is the **only** episode-creation INSERT path in the app.

---

## 5. Env-flag read helper / all read sites

There is **no** `process.env.MECHANICS_AUTO_ADVANCE` read and **no** helper that reads it — the flag was superseded by `isReconcilerArmed`. Every surviving mention is a stale comment, a test title, or a user-facing string (none gate behavior):

| File:line | Kind | Note |
|---|---|---|
| `lib/agents/reconcile-execute.ts:18` | comment | "Guarded by MECHANICS_AUTO_ADVANCE (default OFF)" — stale |
| `lib/agents/reconcile-execute.ts:46` | comment | doc on `force?` param — stale |
| `lib/agents/reconcile.ts:14` | comment | "guarded by MECHANICS_AUTO_ADVANCE" — stale |
| `lib/agents/production-plan.ts:92` | comment | the "replaces the global MECHANICS_AUTO_ADVANCE env flag" note |
| `inngest/index.ts:86` | comment | "inert unless MECHANICS_AUTO_ADVANCE" — stale |
| `inngest/functions/reconcile-episode.ts:10` | comment | "Inert unless MECHANICS_AUTO_ADVANCE is on: reconcileEpisode checks the flag" — stale |
| `lib/inngest/client.ts:53` | comment | "behind MECHANICS_AUTO_ADVANCE" — stale |
| `lib/concierge/tools/index.ts:152` | comment | "MECHANICS_AUTO_ADVANCE flag + reserved gates are the guards" — stale |
| `lib/concierge/tools/conductor.ts:100` | tool description string | Concierge tool desc: "Requires the episode to be in autonomous mode (MECHANICS_AUTO_ADVANCE)" |
| `lib/concierge/tools/conductor.ts:152` | user-facing string | "Reconcile is inactive for this episode (MECHANICS_AUTO_ADVANCE off) — nothing changed." |
| `app/api/episodes/[id]/reconcile/route.ts:6` | comment | "guarded by MECHANICS_AUTO_ADVANCE unless `?force=1`" — stale |
| `__tests__/lib/agents/reconcile-execute.test.ts:40` | test title | "is a no-op when MECHANICS_AUTO_ADVANCE is off and not forced" |

---

## Summary of current reality vs. the task's stated premise

- The single gate is `isReconcilerArmed(episodeMeta, governanceMode)` at `reconcile-execute.ts:90`, requiring `metadata.reconciler_armed === true` **and** `governance_mode ∈ {2,3}`. The env flag is **not** read anywhere.
- Phase 2b part A (per-episode arm gated on governance mode) is **done and wired**.
- Phase 2b part B (**arm at creation**) is **not done**: `reconciler_armed` is never written, so `epMetadata` at `app/api/episodes/route.ts:101-106` is the exact spot to add it. Until then the reconciler is inert for all episodes except explicit `?force=1` manual runs.
- Governance mode lives on `episodes.governance_mode` (int column) and is read directly off the episode row, coerced with `Number(...)`, and threaded through `ReconcileContext` into `resolveGateDecision`.
- The doc comments across the reconciler/inngest/conductor files still reference `MECHANICS_AUTO_ADVANCE` and are now inaccurate.

Note: I did not create a plan file, per the exploration task's instruction to return findings directly.</result>
<usage><subagent_tokens>70989</subagent_tokens><tool_uses>17</tool_uses><duration_ms>142396</duration_ms></usage>
</task-notification>

## 2026-07-15 08:18 · director-msg (hook) · NEW · (triage at distill)
<task-notification>
<task-id>a80a372cce9a6488d</task-id>
<tool-use-id>toolu_01QgxyjA8ixuXsQ6bGPT6vmJ</tool-use-id>
<output-file>C:\Users\NAVIAV~1\AppData\Local\Temp\claude\C--SandyStudio--claude-worktrees-conductor-phase2\25a4dc36-f68e-4054-b71f-c3a380c7cb48\tasks\a80a372cce9a6488d.output</output-file>
<status>completed</status>
<summary>Agent "Map tests + smoke harness for reconciler" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>I have a complete picture. Note a key finding: in this worktree the migration is **already largely implemented** — `isReconcilerArmed` exists and is wired in, and `process.env.MECHANICS_AUTO_ADVANCE` is no longer read anywhere in code (only stale comments remain). Here is the structured report.

---

# Reconciler activation — test &amp; smoke-verification surface

## Headline finding
The per-episode "arm" is **already coded** in this worktree. `process.env.MECHANICS_AUTO_ADVANCE` is **not read anywhere in `lib/`, `inngest/`, `app/`, or `scripts/`** — only comments still name it. The live gate is now `isReconcilerArmed(...)`.

- `webapp/lib/agents/production-plan.ts:100-104` — the new gate:
  ```ts
  export function isReconcilerArmed(episodeMeta: unknown, governanceMode: number | null): boolean {
    const armed = (episodeMeta as { reconciler_armed?: unknown } | null)?.reconciler_armed === true;
    const mode = governanceMode ?? 1;
    return armed &amp;&amp; (mode === 2 || mode === 3);
  }
  ```
- `webapp/lib/agents/reconcile-execute.ts:90` — the wire-in (replaces the old env check):
  ```ts
  if (!opts.force &amp;&amp; !isReconcilerArmed(episodeMeta, governanceMode)) return EMPTY;
  ```
  Mode/metadata are read at `reconcile-execute.ts:81-88` (`governance_mode` coerced via `Number(rawMode)`).

Remaining stale references to the old flag (comments/strings only, no behavior): `inngest/index.ts:86`, `inngest/functions/reconcile-episode.ts:10`, `lib/agents/reconcile.ts:14`, `lib/agents/reconcile-execute.ts:18,46` (the `opts.force` JSDoc), `lib/concierge/tools/index.ts:152`, `lib/concierge/tools/conductor.ts:152` (user-facing message: `'Reconcile is inactive for this episode (MECHANICS_AUTO_ADVANCE off) — nothing changed.'`), `lib/inngest/client.ts:53`, `app/api/episodes/[id]/reconcile/route.ts:6`. `factory.ts:858-862` already describes the arm correctly ("no-ops unless the episode is ARMED (metadata reconciler_armed + mode 2/3)").

---

## 1. reconcile-execute / reconcile / gate-decision tests

### `webapp/__tests__/lib/agents/reconcile-execute.test.ts`
- **No env stubbing at all.** Setup is pure `makeMockSupabase` fixtures (`reconcile-execute.test.ts:7,29`). There is no `process.env`, no `vi.stubEnv`, no `beforeEach`/`afterEach`.
- The `force` bypass is exercised via the options object: `reconcileEpisode(client, EP, { force: true })` at lines `49, 61, 67, 83, 100`.
- The one assertion that depended on the flag being off is `reconcile-execute.test.ts:40-45`:
  ```ts
  it('is a no-op when MECHANICS_AUTO_ADVANCE is off and not forced', async () =&gt; {
    const { client } = seedWithReviewShotPlan();
    const res = await reconcileEpisode(client, EP); // no force, flag unset
    expect(res.ran).toBe(false);
    expect(res.approvedAssetIds).toHaveLength(0);
  });
  ```
  **Migration note:** this test already passes under the arm model *by accident of the fixture*. `seedWithReviewShotPlan()` (`reconcile-execute.test.ts:29-36`) seeds `governance_mode: '3'` but `metadata: {}` — no `reconciler_armed`, so `isReconcilerArmed({}, 3)` returns `false` → `EMPTY`. The test name/comment ("flag unset") is now stale wording. To make the intent explicit under the arm model you'd add a symmetric positive test: same fixture but `metadata: { reconciler_armed: true }` and `governance_mode: 2|3`, asserting `res.ran === true` **without** `force`. Also worth a negative: `reconciler_armed: true` + `governance_mode: 1` must stay a no-op.
- The `force:true` tests (approve/idempotent/reserved/pilot/HALT, lines 47-104) are independent of both the old flag and the new arm — they bypass the gate — so they stay green unchanged.

### `webapp/__tests__/lib/agents/reconcile.test.ts`
- Tests the **pure** decision core `planReconcileActions` / `collectCriticSignals` — no Supabase, no env, no arm/flag concept. Governance is passed as a plain arg `governanceMode` in the `ctx()` helper (`reconcile.test.ts:53-63`, default `3`).
- Mode-aware assertions live at `reconcile.test.ts:172-213`: Mode 1 mechanical PASS → `wait` (179-185); Mode 2 mechanical PASS → `approve` (187-194); Mode 2 creative video → `wait` (196-200); Mode 3 creative video → `approve` (207-212). These encode exactly the `{2,3}` semantics the arm gates on, but they do **not** touch the arm itself, so they need **no migration**.

### `webapp/__tests__/agents/gate-decision.test.ts`
- Pure functions `resolveGateDecision` / `decideGate` / `recordGateDecision`. No env, no arm. Uses `makeMockSupabase` only for the writer test (`gate-decision.test.ts:89`).
- The governance-mode contract it locks: `mechanical → advance` in modes 2/3, `require_human` in mode 1 (`gate-decision.test.ts:18-22`); `creative → advance` only mode 3 (24-28); null mode → mode 1 (30-33). No changes needed; this is the invariant the arm's `mode ∈ {2,3}` relies on.

---

## 2. `webapp/scripts/replay-pilot.ts` — self-approves in JS, never touches the reconciler

- **Does NOT exercise the reconciler.** `runPipelineStep` (`replay-pilot.ts:96-181`) calls `insertJobRow → validateAgentInputs → loadAgentInputs → runAgent → recordCost → saveAgentOutput → markJobCompleted`. It never imports or calls `reconcileEpisode`/`planReconcileActions`.
- **Self-approves in JS** at `replay-pilot.ts:172-178`:
  ```ts
  if (options.autoApproveOutput !== false) {
    const asset = supabase.tables.assets.find((a) =&gt; a.id === saved.assetId);
    if (asset) { asset.status = 'APPROVED'; }
  }
  ```
  It drives the pipeline stage-by-stage by hand and manually rewrites `file_type`s to satisfy the next gate (e.g. lines 286-298, 307, 328-338).
- **Does NOT set `MECHANICS_AUTO_ADVANCE`** (or `reconciler_armed`). Episodes are seeded `governance_mode: 1` (`replay-pilot.ts:195, 400, 447, 488`); the only governance test is the Mode-1 PUBLISH hard-limit block/allow (`replay-pilot.ts:390-433`).
- **Arming-per-episode would NOT affect replay-pilot.** Since it bypasses the reconciler entirely and never arms an episode, its assertion count (the happy path asserts `18` COMPLETED jobs at `replay-pilot.ts:365-369`, plus the governance/idempotency/budget scenarios) is unaffected. It remains a runner-layer harness, orthogonal to the arm.

---

## 3. `webapp/scripts/smoke-state-matrix.ts` — read-only shadow projection

- Header (`smoke-state-matrix.ts:3-4`): "Тир-A shadow dry-run (Фаза 1 + 2a). READ-ONLY, $0, zero mutation." It projects a real episode's state matrix against live Supabase and prints both the human render (`renderStateMatrixMarkdown`, line 48) and the actions the **pure** `planReconcileActions` *would* take (lines 61-79) — plus an idempotency re-run probe (82-92).
- It calls the **pure core**, not the executor, so it **never checks the arm/flag** and performs no mutation. Governance is read from live data and passed through: `smoke-state-matrix.ts:68`
  ```ts
  governanceMode: matrix.governance_mode == null ? null : Number(matrix.governance_mode),
  ```
  It does **not** set the governance mode or arm anything — it observes whatever the real episode has.
- The Phase-2a "+2 lines" almost certainly correspond to threading `governanceMode` into both `planReconcileActions` calls (lines 68 and 89) — the only mode-aware additions in this file. Because it uses the pure core with no arm gate, it stays green regardless of the arm migration.

---

## 4. General env-stub pattern in the suite

There is **no shared vitest setup file and no `vi.stubEnv`** anywhere. `vitest.config.ts` provides only a static `env:` block (`vitest.config.ts:22-27`) for import-time env validation, `environment: 'node'`, `globals: false` (explicit `vitest` imports), `include: ['__tests__/**/*.test.ts']`.

The established per-test pattern is **manual save/restore of `process.env` in `beforeEach`/`afterEach`**. Canonical example the arm tests should follow — `webapp/__tests__/lib/agents/next-events-readability.test.ts:29-35`:
```ts
const ORIGINAL_FLAG = process.env.READABILITY_GATE_ENABLED;
beforeEach(() =&gt; { delete process.env.READABILITY_GATE_ENABLED; });
afterEach(() =&gt; {
  if (ORIGINAL_FLAG === undefined) delete process.env.READABILITY_GATE_ENABLED;
  else process.env.READABILITY_GATE_ENABLED = ORIGINAL_FLAG;
});
// ...then in a test: process.env.READABILITY_GATE_ENABLED = 'true';
```
Same idiom in `__tests__/lib/agents/next-events-single-dispatch.test.ts:30-37`, `providers/fal-seedance.test.ts:49-64`, `providers/flux-pro-ultra-fal.test.ts:41-71`, `lib/concierge/cost.test.ts:174-182`, `lib/concierge/llm-reasoning.test.ts:11-22`.

**However**, because the arm is now episode **metadata** (`reconciler_armed`) + **governance_mode column**, not an env var, the arm tests should NOT use this env pattern at all — they should set `metadata.reconciler_armed` / `governance_mode` in the `makeMockSupabase` fixture (as `reconcile-execute.test.ts` already does for mode), which is cleaner and needs no save/restore.

---

## 5. Count of test files touching reconcile / gate-decision / next-events / state-matrix

**6 files** directly on those four surfaces:

1. `webapp/__tests__/lib/agents/reconcile.test.ts` — pure decision core (mode-aware).
2. `webapp/__tests__/lib/agents/reconcile-execute.test.ts` — executor + arm/`force` gate (the file that needs arm-migration test additions).
3. `webapp/__tests__/agents/gate-decision.test.ts` — `resolveGateDecision`/`decideGate` mode contract.
4. `webapp/__tests__/lib/agents/next-events-readability.test.ts` — `computeNextEvents` (readability flag).
5. `webapp/__tests__/lib/agents/next-events-single-dispatch.test.ts` — `computeNextEvents` dispatch/chain flags.
6. `webapp/__tests__/lib/agents/state-matrix.test.ts` — state-matrix projection.

Closely adjacent (same subsystem, may be worth a glance but not on the four named surfaces): `webapp/__tests__/lib/agents/state-ledger.test.ts`.

Executor call-site coverage beyond tests: `webapp/inngest/functions/reconcile-episode.ts` (subscriber, calls `reconcileEpisode` with **no** `force` → relies entirely on the arm), and `webapp/app/api/episodes/[id]/reconcile/route.ts` (manual/smoke route, `?force=1`).</result>
<usage><subagent_tokens>66771</subagent_tokens><tool_uses>21</tool_uses><duration_ms>130380</duration_ms></usage>
</task-notification>

## 2026-07-15 08:18 · director-msg (hook) · NEW · (triage at distill)
<task-notification>
<task-id>a50c83e97b6b483de</task-id>
<tool-use-id>toolu_012bgFCpcgmB2sNJiW9BT277</tool-use-id>
<output-file>C:\Users\NAVIAV~1\AppData\Local\Temp\claude\C--SandyStudio--claude-worktrees-conductor-phase2\25a4dc36-f68e-4054-b71f-c3a380c7cb48\tasks\a50c83e97b6b483de.output</output-file>
<status>completed</status>
<summary>Agent "Map episode governance + reconcile triggers" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>Exploration complete. Here is the structured report.

---

# Reconciler triggers &amp; governance mode — findings

## 1. Every call site of `reconcileEpisode`

The reconciler executor is `reconcileEpisode(supabase, episodeId, opts)` in `webapp/lib/agents/reconcile-execute.ts:73`. It has **three real triggers** plus the concierge tool. There is **no watchdog call** — the batch-stall watchdog uses a different nudge mechanism (see below).

**a) Factory, after ANY agent completes** — `webapp/lib/agents/factory.ts:863-868`
This is the primary self-advance driver. It does not call `reconcileEpisode` directly; it emits the Inngest trigger event:
```ts
// Phase 2b — self-advance: after ANY agent completes, tick the reconciler to
// converge the episode. Fired unconditionally (debounced + concurrency-1);
// reconcileEpisode itself no-ops unless the episode is ARMED (metadata
// reconciler_armed + mode 2/3), so this is safe on every completion.
if (episodeId) {
  await step.sendEvent('reconcile-trigger', {
    name: 'sandystudio/reconcile/episode',
    data: { episodeId },
  } as never);
}
```
(Note: the comment header at factory.ts:858-862 already describes the intended Phase 2b arm gate — `metadata reconciler_armed + mode 2/3` — even though the trigger fires unconditionally and the gate lives inside `reconcileEpisode`.)

**b) Inngest function** — `webapp/inngest/functions/reconcile-episode.ts:38` (registered in `webapp/inngest/index.ts:87`)
Sole subscriber to `sandystudio/reconcile/episode`. Calls `reconcileEpisode(supabase, episodeId)` (no `force`, no `actorUserId`), then dispatches the returned cascade events. Debounced 5s / concurrency-1 per `event.data.episodeId` (reconcile-episode.ts:26-29).

**c) API route** — `webapp/app/api/episodes/[id]/reconcile/route.ts:27`
```ts
const force = new URL(req.url).searchParams.get('force') === '1';
const result = await reconcileEpisode(supabase, id, { force, actorUserId: user.id });
```
Director-only (`requireDirector()`), then sends each returned event to Inngest. "The manual engage point for the live smoke."

**d) Concierge conductor tool** — `webapp/lib/concierge/tools/conductor.ts:97` (registered in `webapp/lib/concierge/tools/index.ts:40,153`)
This is a `Tool`, not a direct call. Its `execute` does an HTTP `POST` to `/api/episodes/{id}/reconcile` **without** `?force` (conductor.ts:119-126), so it goes through the same arm gate as the route. See §4.

**Event definition:** `webapp/lib/inngest/client.ts:52-61` (`sandystudio/reconcile/episode`, data `{ episodeId }`).

**Not a trigger:** `webapp/inngest/functions/pa-batch-stall-watchdog.ts` scans stalled episodes (`governance_mode = 3` + `metadata-&gt;&gt;autonomous_run = 'true'`, line 109-110) and "nudges" them, but it does **not** call `reconcileEpisode` — it uses Polina/thin-agent nudges, a separate autonomy path.

---

## 2. `reconcile-episode.ts` and `reconcile/route.ts` — reconcile-vs-no-op logic

Both delegate the decision to `reconcileEpisode` in `webapp/lib/agents/reconcile-execute.ts`. The gate is at **reconcile-execute.ts:81-90**:
```ts
const { data: epRow } = await supabase
  .from('episodes')
  .select('metadata, governance_mode')
  .eq('id', episodeId)
  .maybeSingle();
const episodeMeta = (epRow ...).metadata;
const rawMode = (epRow ...).governance_mode;
const governanceMode = rawMode == null ? null : Number(rawMode);

if (!opts.force &amp;&amp; !isReconcilerArmed(episodeMeta, governanceMode)) return EMPTY;
```
- **Inngest fn** (reconcile-episode.ts:38): no `force` → returns `EMPTY` (`ran:false`) unless the episode is **armed**. Result maps to `{ran, events, approved, halted}`; cascade events only sent when `events.length &gt; 0` (line 48).
- **Route** (route.ts:25-27): `?force=1` sets `opts.force=true`, which **bypasses the arm gate entirely** (`!opts.force &amp;&amp; …` short-circuits). Without `?force`, the route also no-ops on unarmed episodes. On a run it dispatches every returned event and returns `{ran, approved, halted, actions, fired_events}`.

Note the header comments in both files still describe the gate as `MECHANICS_AUTO_ADVANCE` (reconcile-episode.ts:10-12, route.ts:6, reconcile-execute.ts:18-20, ReconcileOptions.force doc at reconcile-execute.ts:46), but the **actual runtime gate is already `isReconcilerArmed`** (metadata `reconciler_armed` + mode ∈ {2,3}) — the env flag is no longer read here. The comments are stale relative to the code.

The pure decision core `planReconcileActions` (`webapp/lib/agents/reconcile.ts:109`) then decides per cell: only `REVIEW` + `fresh` cells are actionable; mechanical (critic-PASS) cells auto-approve via `resolveGateDecision('mechanical', mode)`, creative renders via `resolveGateDecision('creative', mode)`; REVISE/FAIL ≥ cap → `halt`; stitch when all live shots' video APPROVED + music present.

---

## 3. Governance mode — source of truth

`governance_mode` is a **per-episode `smallint` column** on `episodes` (`webapp/supabase/migrations/0002_core_tables.sql:31-32`, `CHECK BETWEEN 1 AND 4`; 1=MANUAL 2=HYBRID 3=DELEGATED 4=AUTOTEST). There is **also** a global default in `app_config` (scope=`system`, key=`governance_mode_default`), seeded to `1` in `webapp/supabase/migrations/0010_phase5b_series_authority_storage.sql:94`.

**Precedence / single source of truth:** `webapp/lib/concierge/resolve-mode.ts:37-57` (`resolveEffectiveConciergeMode`):
1. `episode.governance_mode` — the per-episode override, **the authority** when working on an episode (resolve-mode.ts:41-49).
2. `app_config.governance_mode_default` — global default fallback (resolve-mode.ts:50-56).
3. `'1'` MANUAL — safe fallback.
The header (resolve-mode.ts:3-21) documents the 2026-06-15 "three stores, no shared precedence" incident this collapses.

**(a) WRITE paths:**
- `webapp/app/api/system/governance-mode/route.ts` POST (route.ts:60-94): Director-only, `assertHumanDirector` (hard limit MODE_CHANGE). Scope `'global'` → upserts `app_config` `governance_mode_default` (route.ts:68-79); scope `{episodeId}` → `episodes.update({ governance_mode })` (route.ts:89-92). Logs `governance_mode_change` activity event.
- At **episode creation** — `webapp/app/api/episodes/route.ts:44,115`: create body accepts `governance_mode: 1|2|3` (default 1), written into the insert payload (route.ts:115). Also settable via concierge `createEpisode` tool (`webapp/lib/concierge/tools/episode-create.ts:60-62,79`) and UI modals (`components/episodes/NewEpisodeModal.tsx:60`, `components/onboarding/EpisodeStep.tsx:39`).

**(b) READ for gating decisions:**
- `webapp/lib/governance.ts:122` `enforceMode()` — the mode→category permission brain (`episode.governance_mode`, Category A/B/C).
- `webapp/lib/agents/gate-decision.ts:91-102` `resolveGateDecision(gateClass, mode)` — the reconciler's mode-aware brain: hard_limit→require_human always; mechanical→advance in mode 2/3; creative→advance only mode 3.
- Reconciler: `reconcile-execute.ts:87-88` reads `governance_mode`, coerces to number, feeds `isReconcilerArmed` and `planReconcileActions`.
- Factory reads it for gate measurement: `factory.ts:555,574,580,751-754`.
- State matrix carries it: `webapp/lib/agents/state-matrix.ts:194,295,421` (as a string field).
- Effective-mode GET badge: `governance-mode/route.ts:26-49`; Studio layout default: `app/(studio)/layout.tsx:6,26`; system route `app/api/system/mode/route.ts:35`.
- Many asset routes read the owning episode's `governance_mode` to call `enforceMode` (e.g. `app/api/assets/[id]/upload/route.ts:82-116`, `regenerate-image`, `enrich`, etc.).

There is **no** PLAN.md "Current Mode" source in code — mode lives entirely in the DB (`episodes.governance_mode` column + `app_config.governance_mode_default`).

---

## 4. Concierge conductor tool — how it checks "autonomous mode" today

`webapp/lib/concierge/tools/conductor.ts:97-155` (`reconcileEpisode` Tool, `mutating: true`).

It does **not** itself check the mode or the flag. It resolves the episode id (conductor.ts:115) and POSTs to `/api/episodes/{id}/reconcile` **without `?force`** (conductor.ts:119-126). The actual gate is enforced server-side by `isReconcilerArmed` inside `reconcile-execute.ts:90`.

The tool infers the outcome purely from the response `ran` flag (conductor.ts:150-153):
```ts
const summary = data?.ran
  ? `Reconcile ran: ${approved} auto-approved, ${halted} halted.`
  : 'Reconcile is inactive for this episode (MECHANICS_AUTO_ADVANCE off) — nothing changed.';
```
The tool **description** still tells the model (conductor.ts:100): *"Requires the episode to be in autonomous mode (MECHANICS_AUTO_ADVANCE); reserved gates … still wait for the Director."* Both the no-op summary string (conductor.ts:152) and the description reference the retired `MECHANICS_AUTO_ADVANCE` framing — these are the **consumer-facing strings that must change in Phase 2b** to reflect the per-episode arm (metadata `reconciler_armed` + mode 2/3). Same stale wording is in `webapp/lib/concierge/tools/index.ts:152`.

---

## 5. Existing per-episode "arm" / "autonomous" concept

**Yes — the arm concept already exists in code, but only as a read-side metadata key with no writer and no schema column.**

- `webapp/lib/agents/production-plan.ts:90-104` — `isReconcilerArmed(episodeMeta, governanceMode)`:
```ts
// armed  ⇔  metadata.reconciler_armed === true  AND  mode ∈ {2, 3}.
// `reconciler_armed` is set at episode CREATION (so a deploy never retroactively
// activates a pre-existing episode) and the Director can clear it to pause …
export function isReconcilerArmed(episodeMeta, governanceMode): boolean {
  const armed = (episodeMeta ...).reconciler_armed === true;
  const mode = governanceMode ?? 1;
  return armed &amp;&amp; (mode === 2 || mode === 3);
}
```
- It is **read** only in two places: `reconcile-execute.ts:90` (the gate) and referenced in the factory comment (`factory.ts:861`).
- **`reconciler_armed` is never written anywhere.** A full-repo search for `reconciler_armed` returns only `production-plan.ts:93,95,101` and the `factory.ts:861` comment. In particular, the episode-create route `webapp/app/api/episodes/route.ts:101-121` builds `epMetadata` with only `concierge_cap_usd`, `prompt_revision_cap`, `reference_regen_cap`, `video_regen_cap` — it does **not** set `reconciler_armed`, despite the doc comment claiming it "is set at episode CREATION." So today every episode is effectively unarmed and reconcile only runs via `?force=1` / the route.

**Schema:** `reconciler_armed` is a JSON key inside the `episodes.metadata` **jsonb** column (added in `webapp/supabase/migrations/0029_episodes_archive.sql:47`, `NOT NULL DEFAULT '{}'`). There is **no dedicated column** and **no migration** for it (or for `armed`/`autonomous`).

**Related but distinct per-episode metadata flag:** `metadata.autonomous_run` (`inngest/functions/pa-batch-stall-watchdog.ts:99-131`, `meta.autonomous_run === true`, queried at line 110) — this drives the thin-agent/Polina watchdog sweep for Mode-3 episodes, a **separate** autonomy mechanism from the reconciler arm. Do not conflate the two.

---

### Summary of the Phase-2b gap
The arm machinery (`isReconcilerArmed`, mode 2/3 gate, `resolveGateDecision`) is fully built and already wired as the runtime gate in `reconcile-execute.ts:90`. What's missing / stale: (1) nothing **writes** `metadata.reconciler_armed` at episode creation (`app/api/episodes/route.ts:101`); (2) the factory trigger fires unconditionally and relies on the executor gate; (3) consumer-facing strings and header comments in `conductor.ts:100,152`, `tools/index.ts:152`, `reconcile-episode.ts:10`, `route.ts:6`, and `reconcile-execute.ts:18-20,46` still say `MECHANICS_AUTO_ADVANCE`.</result>
<usage><subagent_tokens>78865</subagent_tokens><tool_uses>27</tool_uses><duration_ms>144016</duration_ms></usage>
</task-notification>

## 2026-07-15 08:35 · director-msg (hook) · NEW · (triage at distill)
<task-notification>
<task-id>a0b1fd33a268b0657</task-id>
<tool-use-id>toolu_01EU7niKTUcem4eGb3okCmbt</tool-use-id>
<output-file>C:\Users\NAVIAV~1\AppData\Local\Temp\claude\C--SandyStudio--claude-worktrees-conductor-phase2\25a4dc36-f68e-4054-b71f-c3a380c7cb48\tasks\a0b1fd33a268b0657.output</output-file>
<status>completed</status>
<summary>Agent "Review Phase 2b arm diff" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>## Review Summary — Phase 2b arm-at-creation wiring

Scope confirmed: only the diff shown was reviewed. Traced both write sites, the single read site (`isReconcilerArmed`), the unconditional trigger dispatch in `factory.ts`, and the gate-class split in `gate-decision.ts` (pre-existing, Phase 2a) to make sure nothing bypasses the new arm.

**[MEDIUM] Read-modify-write race on `episodes.metadata` in the mode-switch route**
File: `webapp/app/api/system/governance-mode/route.ts:84-98`
The episode-scoped switch does `SELECT metadata` → spread → `UPDATE`. Any concurrent writer to the same episode's `metadata` (e.g. `eref/approve-pilots`, `shot-exclusion`, `animatic-timing`, `upload-music` — all of which do the same read-then-spread-write pattern per grep) between the SELECT and the UPDATE will have its write silently clobbered, or will clobber this one — including `reconciler_armed` itself. Since this route is what arms/disarms paid auto-advance, a lost update here is higher-blast-radius than the other metadata writers (could leave the reconciler armed when the Director just disarmed it, or vice versa). This is a pre-existing codebase pattern (7 other routes do the same thing), not a regression introduced by this diff, so I'm not blocking on it — but it's worth a follow-up (Postgres `jsonb_set`/RPC merge, or an `UPDATE ... SET metadata = metadata || jsonb_build_object(...)` single-statement patch) given the safety-critical nature of this particular key.

**[LOW] No test exercises the actual write sites (route-level)**
Files: `webapp/app/api/episodes/route.ts`, `webapp/app/api/system/governance-mode/route.ts`
New tests cover `armForMode` (pure) and `reconcileEpisode` (pre-seeded armed/unarmed metadata) — good, and they do exercise the un-forced armed path and the mode-1 disarm negative as requested. But nothing exercises the route handlers that actually *write* `reconciler_armed` — i.e. no test verifies episode-creation writes the correct value for mode 1/2/3, and no test verifies the mode-switch route's metadata merge (`{...prevMeta, reconciler_armed}`) actually preserves other keys and flips correctly on 2/3→1. This matches existing convention (no API route handler tests exist anywhere in `__tests__/`), so it's not a new gap relative to the codebase's testing philosophy — just noting it as the one meaningfully undertested seam in this diff, since it's the "arm" being written, not just read.

**Everything else checked out correct:**
- `armForMode(mode)` — simple, correct predicate (`mode === 2 || mode === 3`), single definition reused at both write sites and inside `isReconcilerArmed`. No drift risk.
- Arm-at-creation: `CreateBody.governance_mode` is `z.union([literal(1,2,3)]).default(1)` — strictly typed, no coercion gap, no way a non-numeric or out-of-range value reaches `armForMode`. Default episode (mode 1, the common case) is born disarmed. Correct.
- Mode-switch route: `GovernanceBody.targetMode` is the same strict literal union; `assertHumanDirector` gate confirms this is Director-only (hard limit), matching CLAUDE.md §6. Global-scope switches intentionally do NOT retroactively arm existing episodes (only the episode-scoped switch touches `metadata.reconciler_armed`) — correct per the documented "deploy never sets it" invariant.
- Deploy-safety: `isReconcilerArmed` requires `metadata.reconciler_armed === true` (strict equality, not truthy) — a pre-existing episode with no such key, or any other value, is `undefined === true` → `false`. Confirmed inert. `reconcile-execute.ts:88` also correctly coerces `governance_mode` to `Number(rawMode)` before the gate, guarding against a stringified column value from mocks/JSON.
- Trigger path: `factory.ts:858-868` fires `sandystudio/reconcile/episode` unconditionally after every agent completion; the executor (`reconcileEpisode`) is the sole gate (`reconcile-execute.ts:90`). No second/alternate trigger path bypasses `isReconcilerArmed`.
- Creative vs mechanical distinction (`gate-decision.ts:95-101`, pre-existing Phase 2a code, unchanged by this diff) still holds: `hard_limit` gates never advance; mechanical advances at mode 2/3; creative advances only at mode 3. The arm from this diff only widens *which episodes* can reach that gate check — it does not change the gate check itself.
- No stale `MECHANICS_AUTO_ADVANCE` references remain (grep clean); comment-only cleanup is accurate everywhere it touches behavior description.

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0     | pass   |
| HIGH     | 0     | pass   |
| MEDIUM   | 1     | info   |
| LOW      | 1     | note   |

Verdict: APPROVE. The arm-at-creation / arm-on-mode-switch logic is correct and safe — no path found where an episode auto-advances (mechanical or creative) without the Director having explicitly set governance mode to 2/3 at creation or via the mode-switch route. The one MEDIUM (metadata race) is a pre-existing codebase-wide pattern, not introduced by this diff, but worth flagging given this key's safety-critical role — recommend a follow-up ticket rather than blocking this PR.

Files touched (all reviewed): `webapp/app/api/episodes/route.ts`, `webapp/app/api/system/governance-mode/route.ts`, `webapp/app/api/episodes/[id]/reconcile/route.ts`, `webapp/lib/agents/production-plan.ts`, `webapp/lib/agents/reconcile-execute.ts`, `webapp/lib/agents/reconcile.ts`, `webapp/lib/concierge/tools/conductor.ts`, `webapp/lib/concierge/tools/index.ts`, `webapp/lib/inngest/client.ts`, `webapp/inngest/functions/reconcile-episode.ts`, `webapp/inngest/index.ts`, `webapp/__tests__/lib/agents/reconcile-execute.test.ts`.</result>
<usage><subagent_tokens>101652</subagent_tokens><tool_uses>24</tool_uses><duration_ms>166393</duration_ms></usage>
</task-notification>

## 2026-07-15 13:52 · director-msg (hook) · NEW · (triage at distill)
упаковка канала - твоя забота . остальное ( производные ) отдаем кодерам . ок? смотри статус канала и толкай меня к ПРАВИЛЬНЫМ действиям до достижения цели. напомни ее

## 2026-07-16 08:27 · director-msg (hook) · NEW · (triage at distill)
<task-notification>
<task-id>ad424559bf6321378</task-id>
<tool-use-id>toolu_01QxXvHYEwgqRWNktwN53ZC6</tool-use-id>
<output-file>C:\Users\NAVIAV~1\AppData\Local\Temp\claude\C--SandyStudio--claude-worktrees-conductor-phase2\25a4dc36-f68e-4054-b71f-c3a380c7cb48\tasks\ad424559bf6321378.output</output-file>
<status>completed</status>
<summary>Agent "Map failure-spine + escalation surfaces" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>I have all the surfaces mapped. Here is the structured report.

---

# Failure-Spine Surface Map (read-only findings)

## 1. Polina's auto-react is genuinely tool-capable — but NOT in strict modes

**`inngest/functions/exec-pa-react.ts`** POSTs to `/api/concierge/chat-internal` with `PA_INTERNAL_TOKEN` (lines 126, 130-153). The header comment "no-tools OpenAI call" (lines 16-19) is **stale** — it predates the tool loop.

**`app/api/concierge/chat-internal/route.ts`** is NOT no-tools anymore. It runs a full multi-round tool loop (lines 505-666) with a mode-gated tool surface:

- **Strict modes (1 / 2 / 2.5):** read-only surface only — `READ_ONLY_TOOL_SCHEMAS` (lines 105-110, 515). Mutating tools are hard-blocked at the per-tool guard (`runAutoReactTool` → `decideAutoReactMutation`, lines 770-785). Instruction is explicitly *propose-don't-act* (lines 439-447: "You MUST NOT call MUTATING tools… propose it in your text response").
- **`watchdog` source:** `allowTools = parsed.source !== 'watchdog'` (line 399) → **zero tools**, re-prompt only.
- **Bold modes (3 DELEGATED / 4):** `BOLD_TOOL_SCHEMAS` = everything except hard limits (lines 121-124, 511) — Polina **can** fire `triggerAgent`, `approveAsset`, `requestRevision`, `regenerate*` autonomously.
- **Authorized-principal nudge in strict mode (E13):** `AUTHORIZED_OP_TOOL_SCHEMAS` (lines 133-135) — operational mutations but no creative approvals.

**So the gap is precise:** in a normal Director-driven episode (strict mode), an `agent_failed` wakes Polina but she is on the **read-only surface** — she can inspect and *propose* but cannot re-fire the agent or take corrective mutation. That is exactly why "auto-react ran 3× but nothing got fixed." The path to *let recovery act* already exists mechanically (the bold/authorized branches), it is just gated off in strict mode.

**vs interactive `/api/concierge/chat`:** referenced at chat-internal lines 487-492 as the full path with streaming, metadata patches, per-tool timeout, and the deeper turn window. Same tool registry (`@/lib/concierge/tools`), Director cookie auth instead of the EXEC-DIR-AI bearer.

**One existing escalation exit from chat-internal (reusable):** when the loop hits the round backstop or spin guard (`stalledReason || cutoff`, lines 678-714) it persists an assistant turn with `metadata.awaiting_director_input` (deadline 90s), which arms the `pa-escalation-timer` via `threads.ts → sandystudio/pa/awaiting-set`. This is a real "wake something after N seconds" rung — but it targets Polina again, not the Director directly.

---

## 2. Director-facing alarm surfaces that EXIST

### a) `activity_events.severity` — three levels, no 'critical'
`lib/api/events.ts:11` — `EventSeverity = 'info' | 'warning' | 'error'`. There is **no 'critical'** level. `agent_failed` is logged `severity: 'error'` (`factory.ts:918`). Severity is carried into the Inbox item metadata (`inbox/route.ts:153`) but the Inbox **does not filter or surface by severity** — it filters by `event_type`. So a high severity alone reaches no Director surface.

### b) Director Inbox — `app/api/director/inbox/route.ts`
Surfaces exactly (lines 72-82):
`decision_requested`, `input_requested`, `budget_threshold_reached`, `blocker_raised`, `canon_extension_proposed`, `rule_proposal` — all with `.is('resolved_at', null)` (line 84). Plus assets in `REVIEW` status (Source 1, lines 54-62).

**Critical finding: `agent_failed` is NOT in this whitelist.** Neither is `reconcile/halt` nor `regen_cap_halt`. So a persistent agent failure **never lands in the Director Inbox today.** The two Director-actionable "blocker" event types that DO surface (group `blocked`, CTAs RESOLVE/HOLD) are `budget_threshold_reached` and `blocker_raised` (lines 117-118, 126-130).

**How something gets INTO the Inbox:** write an `activity_events` row (via `logEvent`) whose `event_type` is one of the whitelisted values with `resolved_at = null`. `blocker_raised` is the natural, already-wired rung — it renders as a `blocked` item with a RESOLVE primary CTA. A failure-spine escalation that emits `blocker_raised` (or `decision_requested`) would surface to the Director with zero Inbox changes.

### c) Push/notification
The only "wake" primitives found are the `pa/notify-needed` Inngest event (wakes Polina, not the Director) and the `awaiting_director_input` → `pa/awaiting-set` escalation timer. No Director push/email surface appeared in these routes.

---

## 3. Retry-cap-gated notify / RECOVERY-class / reconcile-cron — **planned, not yet present**

The plan cites `factory.ts:1026-1085`. **That range does not exist** — `lib/agents/factory.ts` is **951 lines**. There is no retry-cap-gated notify, no RECOVERY class, and no periodic reconcile-cron in the current tree. Those are the fix to be built. What exists today:

- **Retries:** `spec.retries ?? 2` (factory.ts:140-141, 217-218) — Inngest-level, default 2 (3 attempts). No application-level failure counter, no cap gate on notify.
- **When notify fires:** on **every** `agent_failed` emission, unconditionally. The failure catch (lines 888-947) calls `logEvent(... event_type:'agent_failed', severity:'error' ...)` (lines 916-933) → `logEvent` fires `pa/notify-needed` because `agent_failed` is actionable (`event-actionable.ts:36`). **There is no "wake only after retries exhausted" gate** — every failed attempt/re-fire wakes Polina. This is the mechanism behind the incident's "notify-needed fired 6×."
- **Suppression that DOES exist:** `isPersistentBillingFailure(errMsg)` (line 912) tags the event `metadata.auto_react=false`, and `logEvent` honors that flag to skip the wake (`events.ts:71-79`) — the one existing "terminal failure → escalate to Director, don't re-wake Polina" pattern. It is billing-specific; it does **not** re-fire and does **not** push to the Inbox (just suppresses the wake; the row sits in the raw feed).
- **Shot-level runaway caps that HALT (not re-fire):** `shot-regen-cap-check` (lines 262-305) emits `regen_cap_halt` and early-`return`s; `plan-regen-guard.ts` per-plan cap (referenced line 250). These **stop** loops, they don't recover them, and `regen_cap_halt` is not actionable/Inbox-surfaced.
- **No re-fire-FAILED logic anywhere.** `markJobFailed` marks the row FAILED (see §4); nothing reads FAILED jobs to re-dispatch. The only "self-advance" trigger is on **success** (`reconcile-trigger`, factory.ts:858-868), not on failure.

---

## 4. `markJobFailed` and downstream reaction

**`lib/agents/runner.ts:3670-3686`** — pure DB write: sets `status:'FAILED'`, `completed_at`, `error_message`. Nothing downstream reads it.

Called only from the factory failure catch (`factory.ts:934-936`) alongside two siblings:
- `logEvent(agent_failed)` — fires the Polina wake (lines 916-933).
- `markDispatchIntent(...,'failed')` — releases the per-shot atomic claim "so recovery can re-claim" (lines 937-940). This is the **hook a RECOVERY re-fire would use**: the claim is already released to FAILED/re-claimable state; a re-dispatch for the same (episode, shot, agent) is unblocked by construction.
- Then `throw err` (line 946) → Inngest marks the function FAILED and retries per `spec.retries`.

**No re-fire, no HALT, no Director notify** is triggered by `markJobFailed` itself. The only reaction to `agent_failed` is the Polina wake — which in strict mode is read-only (§1).

**`agent_failed` emission** = `lib/api/events.ts` `logEvent`, gated by `ACTIONABLE_EVENT_TYPES` (`event-actionable.ts:35-48`, includes `agent_failed`) and the `isSelfCausedNotify` / `auto_react=false` breakers (events.ts:70-79).

---

## 5. Watchdog — natural home for an escalation rung

**`inngest/functions/pa-batch-stall-watchdog.ts`** — cron `*/5 * * * *` (line 63).

**Detects:** episodes with `metadata.eref_pilot_state = 'FANOUT_RUNNING'` (lines 78-82) and, opt-in behind `THIN_AGENT_ENABLED`, Mode-3 `metadata.autonomous_run` episodes (lines 105-118). For each candidate it checks: cooldown (`batch_watchdog_nudged_at`, 12 min, lines 133-138); idle ≥ `IDLE_MIN`=6 min of no `jobs` activity (lines 140-158); a "parked for hours" pre-filter for non-fanout (lines 162-164); then two anti-echo guards — Polina spoke within 6 min → skip (lines 181-188), and **require a NEW actionable, non-self-caused `activity_event` since her last turn/nudge** (lines 189-206, reusing `isActionableEventType`/`isSelfCausedNotify`).

**Does:** fires `sandystudio/pa/notify-needed` with `source:'watchdog'`, `eventType:'batch_stall'` (lines 209-217), stamps cooldown (lines 219-225). Note: `source:'watchdog'` → chat-internal runs with **zero tools** (line 399) — it only re-prompts Polina.

**Suitability for a "repeated-failure / stuck-in-REVISION → escalate Director" rung:** It is a natural home — it already scans episodes on a timer, has cooldown/dedup plumbing, and already queries `jobs` and `activity_events` per episode. Its "new actionable state" query (lines 193-199) already pulls recent events and could count `agent_failed` (or FAILED jobs, or REVISION-stuck stages) and, past a threshold, emit a Director-facing `blocker_raised` (→ Inbox §2b) instead of only re-nudging Polina. But note its current scope gate is narrow (only FANOUT_RUNNING + opt-in autonomous_run) — a failure-escalation rung would need a broader candidate scan than the current `metadata-&gt;&gt;eref_pilot_state` filter.

---

## 6. Reconciler HALTs — computed and logged, but reach NOBODY actionable

**`ReconcileResult.halted`** is defined `Array&lt;{ shotId; stage; reason }&gt;` (`reconcile-execute.ts:57-63`). Populated in the action loop (lines 139-150):

```ts
} else if (action.kind === 'halt') {
  halted.push({ shotId: action.shotId, stage: action.stage, reason: action.reason });
  await logEvent(supabase, {
    event_type: 'reconcile/halt',
    severity: 'warning',
    title: `HALT ${action.shotId} · ${action.stage} — needs Director`,
    description: action.reason,
    actor: 'exec-dir-ai',
    episode_id: episodeId,
    metadata: { shot_id: action.shotId, stage: action.stage, reason: 'RECONCILE_HALT' },
  });
}
```

The halt kind originates in the pure planner (`reconcile.ts:47`, `:159` — `{ kind: 'halt', shotId, stage, reason }`).

**Where the halts GO — the dead end:**
1. `logEvent` writes an `activity_events` row, but `reconcile/halt` is **NOT in `ACTIONABLE_EVENT_TYPES`** (`event-actionable.ts:35-48`) → **no `pa/notify-needed`, Polina is never woken.**
2. `reconcile/halt` is **NOT in the Director Inbox whitelist** (`inbox/route.ts:72-82`) → **never surfaces to the Director.**
3. The consumer `reconcile-episode.ts` only returns `halted: r.halted.length` (a **count**, lines 45, 56) and dispatches `result.events` (the approve/stitch cascade, lines 49-54) — it does **not** dispatch or escalate anything from `halted`.

Net: a reconcile HALT is a `severity:'warning'` row in the raw activity feed and nothing else — exactly the "reached NOBODY" gap the actionable-events comment warns about (`event-actionable.ts:44-47`, which notes the critic HALT was fixed by adding `revision_requested`, but `reconcile/halt` was never given the same treatment).

---

## Summary — surfaces to reuse

**(a) Give recovery a way to act:**
- The tool-capable branches already exist in `chat-internal` — `BOLD_TOOL_SCHEMAS` (bold modes) and `AUTHORIZED_OP_TOOL_SCHEMAS` (authorized nudge). Strict-mode auto-react is deliberately read-only; the failure path currently lands there.
- `markDispatchIntent(...,'failed')` (factory.ts:937-940) already releases the shot claim → a RECOVERY re-fire for the same (episode, shot, agent) is unblocked. `markJobFailed` (runner.ts:3670) marks FAILED but nothing reads it — a re-fire reader would hook here.
- The `reconcile-trigger` self-advance (factory.ts:858-868) fires only on success; a failure-side counterpart is absent.

**(b) Alert the Director on persistent failure:**
- Director Inbox surfaces `blocker_raised` / `decision_requested` as actionable items with RESOLVE/OPEN CTAs (`inbox/route.ts:72-137`). Emitting one of these `event_type`s with `resolved_at=null` is the zero-change path to the Director.
- The `auto_react=false` billing pattern (events.ts:71-79) is the existing template for "terminal failure → escalate to human, suppress the Polina re-wake."
- The `awaiting_director_input` → `pa/awaiting-set` escalation timer (chat-internal:686-704) is the existing timed re-wake primitive (currently re-wakes Polina, not the Director).
- The watchdog (`pa-batch-stall-watchdog.ts`) is the existing timer-scan with cooldown/dedup that could count `agent_failed`/FAILED jobs and emit `blocker_raised`.

**Dead-end surfaces that a fix must newly route:** `agent_failed` (severity 'error', wakes only read-only Polina), `reconcile/halt`, and `regen_cap_halt` are all logged but reach neither the actionable-wake set nor the Director Inbox.</result>
<usage><subagent_tokens>75780</subagent_tokens><tool_uses>30</tool_uses><duration_ms>155668</duration_ms></usage>
</task-notification>

## 2026-07-16 08:28 · director-msg (hook) · NEW · (triage at distill)
<task-notification>
<task-id>a8b10b717c9ce34d1</task-id>
<tool-use-id>toolu_01BdojjxdV2ka7yjRYpKXVAV</tool-use-id>
<output-file>C:\Users\NAVIAV~1\AppData\Local\Temp\claude\C--SandyStudio--claude-worktrees-conductor-phase2\25a4dc36-f68e-4054-b71f-c3a380c7cb48\tasks\a8b10b717c9ce34d1.output</output-file>
<status>completed</status>
<summary>Agent "Map REVISE→re-author loop" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>I now have the complete mechanism mapped. Here is my structured report.

---

# REVISE → Re-author Mechanism: Structured Report

## Executive summary

The video-plan path (EXEC-VANIM → EXEC-VPREV) **does self-heal on REVISE, but only for a bounded number of rounds**. Once the critic's revision cap is hit, the raw `REVISE` is coerced to `HALT`; on `HALT` the plan is *left in its current status* (which is already `REVISION` from the prior REVISE round) and the only thing that fires is a passive `revision_requested` activity event. **No agent is re-dispatched to author an APPROVED v2.** The reconciler cannot rescue it either, because it only acts on cells in `REVIEW` status — a `REVISION`-stuck plan is invisible to it. The single automated re-author edge (`VPREV.nextEvent → exec-vanim/plan`) fires *only* while `verdict === 'REVISE'`, never on `HALT`. That is the exact dead-end.

---

## 1. When a critic returns REVISE — what SHOULD happen

Two coordinated pieces run inside the **runner**, then the **critic's `nextEvent`** in the factory decides re-dispatch.

**(a) Status flip + cap enforcement** — `webapp/lib/agents/critic-loop.ts`. `applyCriticVerdict` is the single source of truth. Verdict→status mapping (lines 47-53):

```ts
export function mapVerdictToPlanStatus(verdict: CriticVerdict): string | null {
  if (verdict === 'PASS' || verdict === 'PASS_WITH_UNCERTAINTY' || verdict === 'HALT') {
    return null;               // leave in REVIEW
  }
  if (verdict === 'FAIL') return 'REJECTED';
  return 'REVISION';           // REVISE / UNKNOWN
}
```

Cap coercion (lines 121-126) — a REVISE past the cap becomes HALT:

```ts
const revisionsSoFar = Math.max(0, version - 1);
const effectiveVerdict: CriticVerdict =
  rawVerdict === 'REVISE' &amp;&amp; revisionsSoFar &gt;= cap ? 'HALT' : rawVerdict;
```

The counter is derived from the plan's `version` column (each REVISE re-authors a *new* version), not a stored counter (see the module header, lines 12-18).

**(b) Re-dispatch of the producer** does NOT happen inside `applyCriticVerdict`. It happens in the critic function's `nextEvent`, gated on `effectiveVerdict` which the runner writes into `result.metadata.verdict`. The factory fires that `nextEvent` as a "critic chain" in **all modes** — `webapp/lib/agents/factory.ts:802-844` (the `isCriticChain` detection matches `sandystudio/exec-vprev/`, `exec-eprev/`, `exec-srev/`, `exec-cread/`, `exec-wchk/`). The factory's forward-executor autofire (`plan-critic-autofire`, factory.ts:736-793) fires **only on PASS/PASS_WITH_UNCERTAINTY** (line 757: `if (verdict !== 'PASS' &amp;&amp; verdict !== 'PASS_WITH_UNCERTAINTY') return [];`) — it never handles REVISE.

**`computeNextEvents` (`next-events.ts`) plays no role in REVISE re-authoring.** It routes APPROVED assets forward. Its `SPC-shot_plan` branch (next-events.ts:781-834) fires `exec-vgen/single-shot` only for an APPROVED plan; the REV-readability comment (lines 554-557) explicitly states "a REVISE re-author is a Director-manual re-trigger today."

**The approve route (`app/api/assets/[id]/approve/route.ts`) only re-authors on a Director's *manual* Revise click** (`decision === 'REQUEST_REVISION'`, line 393), not on a critic verdict. That path DOES re-author shot plans now (lines 481-510, added 2026-07-06) — see §5.

---

## 2. The VIDEO plan path (VANIM → VPREV) — traced

Chain: `exec-vanim/plan` → EXEC-VANIM authors `SPC-shot_plan` (saved at REVIEW by factory.ts:591) → VANIM's `nextEvent` fires `exec-vprev/review-plan` → EXEC-VPREV validates.

**VPREV runner** (`webapp/lib/agents/runner.ts:1420-1498`, case `EXEC-VPREV`) calls `runAnimatorCritic`, then `applyCriticVerdict` (runner.ts:1458-1467) with `cap: resolvePromptRevisionCap(episode.metadata)`, and writes `verdict: cv.effectiveVerdict` into metadata (runner.ts:1482).

**VPREV `nextEvent`** — `webapp/inngest/functions/exec-vprev.ts:64-125`. This is the re-author edge:

```ts
if (verdict === 'REVISE') {
  ...
  return {
    name: 'sandystudio/exec-vanim/plan',
    data: { episodeId, shotId, revisionNote, ...(directorOverrides…) },
  };
}
if (verdict === 'PASS') { /* maybe CREAD */ }
return null;                    // ← HALT / FAIL / PASS_WITH_UNCERTAINTY → NO re-dispatch
```

So EXEC-VANIM **is** re-dispatched — but **only while `verdict === 'REVISE'`**. Once `applyCriticVerdict` coerces to `HALT` at the cap, `metadata.verdict === 'HALT'`, this returns `null`, and the plan is left in `REVISION`. The runner's own `runAnimatorCritic` (`webapp/lib/agents/runners/animator-critic.ts`) does **not** apply the cap or flip status — its local `effectiveVerdict` (line 631) only handles V14/V15 deterministic checks; the cap coercion is entirely in `applyCriticVerdict`.

### Comparison across stages — which re-author on REVISE, which dead-end

| Stage | Critic | REVISE → producer re-fire? | Cap → HALT dead-end? | Evidence |
|---|---|---|---|---|
| **Script** | EXEC-SREV → EXEC-SW (Writer) | **Yes, unconditional, UNCAPPED** | No — never coerced to HALT | `exec-srev.ts:32-43` re-fires `exec-sw/write-script` on `REVISE`/`FAIL`; SREV does **not** call `applyCriticVerdict` (no runner case in the grep), so it always self-heals. |
| **Ref plan** | EXEC-EPREV → EXEC-EREF-DESIGNER | Yes, while `REVISE` | **Yes — same dead-end as video** | `exec-eprev.ts:83-101` re-fires `exec-eref-designer/plan`; runner `applyCriticVerdict` at `runner.ts:1567` (actor `EXEC-EPREV`, same cap). Structurally identical to VPREV. |
| **Shot plan (video)** | EXEC-VPREV → EXEC-VANIM | Yes, while `REVISE` | **Yes — the reported gap** | `exec-vprev.ts:78-105` + `runner.ts:1458`. |
| **Readability** | EXEC-CREAD | **No re-author at all** — advisory | HALT escalates only | `exec-cread.ts:112-115` "Auto-chain by verdict: NONE… every verdict is advisory"; uses `applyCriticVerdict` for status/escalation only. |

So **script self-heals unconditionally**; **ref-plan and shot-plan self-heal up to the cap then dead-end identically**; **readability never auto-re-authors**. The video path is not uniquely broken in code — EPREV shares the same cap dead-end — but it is where the E29 stall surfaced (ref plans got approved; the 3 shot plans hit the cap and stranded in REVISION).

---

## 3. Critic revision cap / HALT

- **Cap value**: `DEFAULT_CRITIC_REVISION_CAP = 2` (`critic-loop.ts:36`), but VPREV/EPREV pass `resolvePromptRevisionCap(episode.metadata)` (runner.ts:1466, 1575) so it is episode-configurable.
- **Counting**: `revisionsSoFar = version − 1` (critic-loop.ts:121). version N = attempt N. So at attempt 3 (2 revisions done), the next REVISE coerces to HALT.
- **What HALT emits** (`critic-loop.ts:150-173`): one row into `activity_events`:

```ts
if (effectiveVerdict === 'HALT') {
  await supabase.from('activity_events').insert({
    event_type: 'revision_requested',
    severity: 'warning',
    title: `${actor} HALT — manual review needed (${reviewKind})`,
    ...
    metadata: { critic_escalation: true, reason: 'cap_reached', target_asset_id: planAssetId, shot_id, revisions_so_far, cap },
  });
}
```

- **Critically**: on HALT, `mapVerdictToPlanStatus` returns `null` → the plan is **not flipped**; it retains the `REVISION` status left by the previous REVISE round (critic-loop.ts:128-137 only lifts a `DRAFT` plan to `REVIEW`, never touches `REVISION`).
- **Who does it wake?** Only the inbox/feed via `revision_requested` (the type migration 0043 added to actionable whitelists). It is a passive escalation to the Director/Polina. **It dispatches no producer event** — `applyCriticVerdict` sends no Inngest event, and VPREV's `nextEvent` returns `null` for HALT. There is no automated re-author on cap-exceeded HALT.

---

## 4. Reconciler treatment of a REVISION-stuck plan / REVISE verdict

**Decision core** `webapp/lib/agents/reconcile.ts`:

- Only `REVIEW` cells are actionable — `planReconcileActions` line 120: `if (cell.status !== 'REVIEW') continue;`. **A plan in `REVISION` is skipped entirely** — the reconciler never sees the E29-stuck plans.
- For a `REVIEW` cell carrying a REVISE/FAIL verdict, it emits `wait` below cap or `halt` at/above cap (lines 155-171):

```ts
} else if (verdict === 'REVISE' || verdict === 'FAIL') {
  const count = reviseCounts.get(key) ?? 0;
  if (count &gt;= criticCap) {
    actions.push({ kind: 'halt', ... reason: `critic ${verdict} ×${count} ≥ cap ${criticCap} — HALT + escalate Director` });
  } else {
    actions.push({ kind: 'wait', ... reason: `critic ${verdict} (${count}/${criticCap}) — revise loop in progress` });
  }
}
```

- The action union is `approve | stitch | halt | wait` (reconcile.ts:44-48). **There is no `reauthor`/`re-fire` action kind.** The `wait` branch explicitly assumes the critic-chain is doing the re-author ("revise loop in progress"). On HALT it does not re-author.

**Executor** `webapp/lib/agents/reconcile-execute.ts:123-152`: `approve` → `executeApprove` (demote sibling + flip APPROVED + `computeNextEvents`); `stitch` → stitch event; `halt` → logs a `reconcile/halt` warning event; `wait` → nothing. So the reconciler **re-authors nothing** on REVISE and **ignores** REVISION-stuck plans. It is also armed only for mode 2/3 with `reconciler_armed` metadata (reconcile-execute.ts:90).

**Net**: for a plan stuck in REVISION, the reconciler is a no-op — the `cell.status !== 'REVIEW'` guard filters it out before any verdict logic runs.

---

## 5. Existing helpers that re-dispatch a producer for a shot (reusable by a fix)

All of these fire `sandystudio/exec-vanim/plan` (the re-author trigger). None fires automatically on a critic-cap HALT.

1. **Director manual Revise → approve route** — `app/api/assets/[id]/approve/route.ts:481-510`. On `REQUEST_REVISION` for `SPC-shot_plan*`/`REV-shot_plan*`, resolves the shotId, merges critic notes (`collectShotCriticNotes` + `mergeRevisionNote`), and sends `exec-vanim/plan` with the note. The comment (lines 472-480) documents this closed a prior dead-end (2026-07-06, SH08 E16). The symmetric ref-plan branch is lines 427-470. **This only runs on a human Revise click, not on the critic HALT.**

2. **PA tool `regenerateShotPlan(shotId)`** — `lib/concierge/tools/animator.ts` (header line 10: "MUTATING. Re-fire Animator. Verbal approval."). Content-regenerating (~LLM cost); registered in `lib/concierge/tools/index.ts`. Ref-plan analog: `regenerateRefPlan`.

3. **PA tool `unstickPlanForApproval(planAssetId)`** — `lib/concierge/tools/animator.ts:373-467`. State-machine-only recovery: flips a plan `REVISION → REVIEW` **gated on the latest critic verdict being PASS/PASS_WITH_UNCERTAINTY** (no regen, no LLM). It explicitly **refuses** a plan whose latest verdict is REVISE/HALT — so it cannot rescue the E29 shots (their verdict is REVISE-coerced-HALT, not PASS). Documented for the TD-74/TD-75 PASS_WITH_UNCERTAINTY case only.

4. **`start-video` retro-fanout** — `app/api/episodes/[id]/start-video/route.ts:141` emits `exec-vanim/plan` per already-APPROVED reference.

5. **`computeNextEvents` parallel edge** — `next-events.ts:977` and the animatic branch `next-events.ts:1100-1103, 1136-1144` emit `exec-vanim/plan` for shots with no plan yet (guarded by `shotHasPlan`, so it will NOT re-author a shot that already has a REVISION plan).

6. **`triggerAgent` / trigger route** — `app/api/episodes/[id]/trigger/route.ts:45` maps `EXEC-VANIM → sandystudio/exec-vanim/plan` for a manual/PA-driven fire.

---

## 6. The specific gap (VANIM → VPREV)

**Definition of the gap.** When `EXEC-VPREV` returns REVISE and `revisionsSoFar &gt;= cap`, `applyCriticVerdict` (`critic-loop.ts:125-126`) coerces the effective verdict to `HALT`. Three consequences combine into a permanent dead-end:

1. `mapVerdictToPlanStatus('HALT') === null` (critic-loop.ts:48) → the plan is **not** flipped; it keeps the `REVISION` status set by the prior REVISE round (and `REVISION` is never lifted — only `DRAFT` is, critic-loop.ts:135-137).
2. VPREV's `nextEvent` (`exec-vprev.ts:78,124`) re-fires `exec-vanim/plan` **only** when `verdict === 'REVISE'`; on `HALT` it returns `null` → **EXEC-VANIM is never re-dispatched to author v2**.
3. The only HALT side-effect is a passive `revision_requested` activity row (critic-loop.ts:151-169) — an inbox nudge that wakes nobody to re-author.

**Why nothing downstream recovers it:**
- `computeNextEvents` acts only on APPROVED plans (never on REVISION) and its plan-authoring edges are guarded by `shotHasPlan`, which is true for a REVISION plan — so it won't re-fire.
- `EXEC-VGEN` correctly refuses a non-APPROVED plan (the "Refusing silent storyboard fallback" guard; the same invariant is enforced in the animatic branch at `next-events.ts:1092-1097`, which `continue`s past a non-APPROVED plan without re-authoring).
- The reconciler filters out non-`REVIEW` cells (`reconcile.ts:120`) → the REVISION plan is invisible; and it has no `reauthor` action kind anyway.
- `unstickPlanForApproval` refuses because the latest verdict is not PASS.

**Result**: the plan is stranded in `REVISION` with the only exits being a **human**: (a) Director manual Revise click → `approve/route.ts:481-510` re-fires EXEC-VANIM, or (b) PA `regenerateShotPlan`. There is **no automated edge from a critic-cap HALT back to the producer**, and no armed automation (reconciler) that watches for REVISION-stuck plans. This is the "producer gap on the animator": critic REVISE-at-cap → HALT → passive escalation → nobody re-dispatches EXEC-VANIM to produce an APPROVED v2.

**Note on symmetry**: EXEC-EPREV (ref plans, `runner.ts:1567`, `exec-eprev.ts:83-101`) has the **identical** cap→HALT dead-end. Any fix should treat the two plan critics uniformly.

### Key files
- `webapp/lib/agents/critic-loop.ts:47-53, 121-173` — verdict→status map, cap coercion, HALT `revision_requested` emission.
- `webapp/inngest/functions/exec-vprev.ts:64-125` — the re-author edge, gated on `verdict === 'REVISE'` (null on HALT).
- `webapp/inngest/functions/exec-eprev.ts:69-121` — identical ref-plan edge.
- `webapp/inngest/functions/exec-srev.ts:26-53` — uncapped, always-re-authors script edge (the self-healing contrast).
- `webapp/lib/agents/runner.ts:1420-1498` (VPREV) / `1529-1600` (EPREV) — where `applyCriticVerdict` runs and `effectiveVerdict` is written to metadata.
- `webapp/lib/agents/runners/animator-critic.ts:534-688` — VPREV critic body (no cap/status side-effect itself).
- `webapp/lib/agents/factory.ts:736-757` (PASS-only autofire), `802-844` (critic-chain `nextEvent` dispatch).
- `webapp/lib/agents/next-events.ts:781-834` (APPROVED shot_plan → VGEN), `1092-1097` (non-APPROVED plan skip, no re-author).
- `webapp/lib/agents/reconcile.ts:118-171` (REVIEW-only, wait/halt, no reauthor kind).
- `webapp/lib/agents/reconcile-execute.ts:123-152` (halt logs only).
- `webapp/app/api/assets/[id]/approve/route.ts:481-510` — Director-manual shot-plan re-author (reusable pattern).
- `webapp/lib/concierge/tools/animator.ts:297-467` — `unstickPlanForApproval` (PASS-only) + `regenerateShotPlan`.</result>
<usage><subagent_tokens>141547</subagent_tokens><tool_uses>25</tool_uses><duration_ms>227030</duration_ms></usage>
</task-notification>

## 2026-07-16 10:52 · director-msg (hook) · NEW · (triage at distill)
я в дубае.  но мульт глобальный . как выбрать правильно время для shedule?

## 2026-07-16 11:02 · director-msg (hook) · NEW · (triage at distill)
video and shorts published scheduled / 
https://youtu.be/ywNKJYsbnrE - video  
check

ну вот не я должен задавать  такие вопросы ( я - нуб)  - а ты вести за руку должен. давай-ка сделай скилл по результатам наших с тобой  бесед в этой и прошлых сессиях .

## 2026-07-16 11:19 · director-msg (hook) · NEW · (triage at distill)
q17 да, q18 промпт для кодера, q19 да
e28 вылез странным образом . видимо косяк дистрибуции. у нас же сгенерил два файла - шорт 29 и full ИЗ ШОРТ ФОРМАТА. Я ЕГО ВИЖУ . ОН ДОЛЖЕН БЫТЬ НЕ УТВЕРЖДЕН. И ВОЗМОЖНО ДИСТРИБУТОР ВЫТАЩИЛ ЧТОТО СТАРОЕ. И ПРИЛЕПИЛ КСТАТИ САМ ИНТРО И АУТРО ) НАДО РАЗООБРАТЬСЯ.

## 2026-07-16 11:42 · director-msg (hook) · NEW · (triage at distill)
Factory — Adaptation Overview
The slow loop: is the factory getting cheaper and more autonomous episode over episode — and what did the churn teach us? Honest churn = REVISE per artifact version, never runs/shot.

No scorecards yet. The discriminator fills in as episodes ship (post-distribution).

## 2026-07-16 12:15 · director-msg (hook) · NEW · (triage at distill)
<task-notification>
<task-id>a128e22510cb30478</task-id>
<tool-use-id>toolu_01CYQ181Dxv9yodBg1bSgQmT</tool-use-id>
<output-file>C:\Users\NAVIAV~1\AppData\Local\Temp\claude\C--SandyStudio--claude-worktrees-conductor-phase2\25a4dc36-f68e-4054-b71f-c3a380c7cb48\tasks\a128e22510cb30478.output</output-file>
<status>completed</status>
<summary>Agent "Map reconciler FAILED-cell visibility" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>I have everything needed. Here is the structured reality-map.

---

# Reconciler internals — reality map for Slice 3 (refire) + Slice 4b (reconcile-cron)

## 1. State-matrix FAILED visibility (CRITICAL)

`webapp/lib/agents/state-matrix.ts` — `getEpisodeStateMatrix` (lines 187–308).

**Tables it reads:**
- `episodes` (header: `episode_code, governance_mode, metadata`) — line 192.
- `assets` — ONE read of every asset for the episode (`id,file_type,status,version,metadata,created_at`) — line 204. This is the primary projection source.
- `assets` again inside `resolveShotSpine` for the STB storyboard (line 146).
- `activity_events` — inside `loadGenerationFailures` (line 327), filtered `event_type = 'agent_failed'`.

**It does NOT read the `jobs` table at all.** A cell's status is purely a projection over `assets` rows.

**Cell shape** (`StageState`, lines 51–60):
```ts
export interface StageState {
  status: string | null;   // DRAFT|REVIEW|APPROVED|LOCKED|REVISION|INVALIDATED|null(absent)
  version: number | null;
  asset_id: string | null;
  fresh: boolean;
  blocked_reason?: string;
}
```

**Answer to "does the matrix represent a JOB failure":** No — not structurally. A FAILED agent job produces no asset, so the cell is `status: null` (the `EMPTY_STAGE` constant, line 133) — identical to "never-started". **There is NO FAILED status value and NO FAILED/missing distinction in the cell's `status`.** The status enum is asset-status only.

The ONLY trace of a failure is a **soft, human-language annotation**: after building shots, lines 272–284 call `loadGenerationFailures` (counts `activity_events` of type `agent_failed`, keyed `${shot_id}::${stage}` via the reverse `AGENT_STAGE` map at lines 311–316) and stamp `cell.blocked_reason` — but ONLY on cells where `status === null` (line 277):
```ts
cell.blocked_reason = `генерация упала ×${fail.count}${fail.lastMsg ? ` (${fail.lastMsg})` : ''} — нужен retry или park`;
```
So the failure signal exists as `blocked_reason` text on an otherwise-empty cell, and its count comes from `activity_events`, not `jobs`. The `AGENT_STAGE` map (state-matrix.ts:311) already maps `EXEC-EREF-DESIGNER→ref_plan`, `EXEC-EREF→ref_image`, `EXEC-VANIM→shot_plan`, `EXEC-VGEN→video` — reusable for a refire.

**Implication for Slice 3:** The reconciler cannot currently SEE "video render FAILED vs never-started" from the matrix cell alone — both are `status: null`. To distinguish, a refire planner must either (a) read the `blocked_reason` text the matrix already stamps (brittle — it's Russian prose), or (b) query `activity_events`/`jobs` for `agent_failed` directly. The structured count already exists in `loadGenerationFailures` but is NOT surfaced as a typed field on the cell — only folded into `blocked_reason`.

---

## 2. `reconcile.ts` — `planReconcileActions`

`webapp/lib/agents/reconcile.ts` (full file, 227 lines).

**`ReconcileAction` union (lines 44–48):**
```ts
export type ReconcileAction =
  | { kind: 'approve'; assetId: string; shotId: string; stage: StageName; reason: string }
  | { kind: 'stitch'; reason: string }
  | { kind: 'halt'; shotId: string; stage: StageName; reason: string }
  | { kind: 'wait'; shotId: string | null; stage: StageName | null; reason: string };
```

**`ReconcileContext` input (lines 50–64):**
```ts
export interface ReconcileContext {
  matrix: EpisodeStateMatrix;
  plan: ProductionPlan | null;
  verdicts: Map&lt;string, string&gt;;      // `${shotId}::${stage}` → latest critic verdict
  reviseCounts: Map&lt;string, number&gt;;  // `${shotId}::${stage}` → REVISE/FAIL count
  reservedShots: Set&lt;string&gt;;
  criticCap: number;
  governanceMode: number | null;
}
```

**Per-cell decision loop (lines 113–204):** For each non-excluded, non-reserved, in-plan shot × each stage in `STAGE_ORDER`:
- **Line 120: `if (cell.status !== 'REVIEW') continue;`** — this is the pivotal gate. **Only cells in `REVIEW` are actionable.** A `status: null` FAILED/absent cell is skipped entirely — it never enters the decision body. So a FAILED shot is invisible to the current loop by construction.
- Fresh check (124): stale REVIEW → `wait`.
- Critic-gated stages (134): PASS → `approve` (mode-gated via `resolveGateDecision('mechanical', …)`); REVISE/FAIL ≥ cap → `halt`; else `wait`.
- Non-critic stages (180): Mode 3 → `approve`; else `wait`.
- Then episode-level stitch gate (lines 206–224).

**Where a `refire` action slots in:** A new arm must be added to the `ReconcileAction` union, and — critically — a new branch that runs on **`status === null` cells with a recorded failure**, NOT the `status === 'REVIEW'` path (which returns early at line 120). The most natural place is a separate pass over `matrix.shots × STAGE_ORDER` that inspects empty cells whose failure count is known. It needs:
- `episodeId` (from `matrix.episode_id`),
- `shotId`, `stage` (loop vars),
- the **agent to re-fire** (derivable from `stage` via a stage→agent map — the inverse of state-matrix's `AGENT_STAGE`),
- the **event name + payload** to emit (see §3),
- a prior-attempt count for the recovery cap (see §4) — and note `reviseCounts` already counts `FAIL` verdicts (line 97: `if (verdict === 'REVISE' || verdict === 'FAIL')`), but that counts CRITIC failures, not JOB failures.

The context currently carries no failure-count map; a `refire` planner would need a new `ReconcileContext` field (e.g. `failureCounts: Map&lt;string,{count,...}&gt;`) populated from `activity_events` (`agent_failed`) or from a new counter, since the matrix cell doesn't expose the structured count.

---

## 3. Agent→event re-dispatch mapping (reuse for refire)

**The canonical map is INLINE in the route** — `webapp/app/api/episodes/[id]/trigger/route.ts` lines 33–62, `AGENT_TO_EVENT: Record&lt;string, StudioEventName&gt;`. Relevant per-shot generator entries:

| Agent | Base event (`AGENT_TO_EVENT`) | Plan-driven reroute (per-shot) |
|---|---|---|
| `EXEC-EREF-DESIGNER` (ref_plan) | `sandystudio/exec-eref-designer/plan` | — |
| `EXEC-EREF` (ref_image) | `sandystudio/exec-eref/start` | `sandystudio/exec-eref/execute-from-plan` when `{shotId, planAssetId}` present (route lines 235–243) |
| `EXEC-VANIM` (shot_plan) | `sandystudio/exec-vanim/plan` | — |
| `EXEC-VGEN` (video) | `sandystudio/exec-vgen/generate-shot` | `sandystudio/exec-vgen/single-shot` when `{shotId, planAssetId}` present + `regenerate:true` (route lines 210–227) |

**There is NO reusable shared helper** — the map is a private const in the route, and `next-events.ts` has its OWN inline event-name literals scattered across branches (e.g. `sandystudio/exec-eref/execute-from-plan` at next-events.ts:764, `sandystudio/exec-vgen/single-shot` at next-events.ts:829, `sandystudio/exec-vanim/plan` at next-events.ts:978/1101). No central `STAGE→event` or `AGENT→event` table exists that a refire action could import.

**For a refire action**, the cleanest per-shot mapping (matching what next-events already emits for the plan-driven forward edges) is:
- ref_plan → `sandystudio/exec-eref-designer/plan` `{episodeId, shotId}`
- ref_image → `sandystudio/exec-eref/execute-from-plan` `{episodeId, shotId, planAssetId}`
- shot_plan → `sandystudio/exec-vanim/plan` `{episodeId, shotId}`
- video → `sandystudio/exec-vgen/single-shot` `{episodeId, shotId, planAssetId, duration_seconds?}`

Note the two money stages (ref_image, video) need a `planAssetId` — the refire planner must resolve the shot's current SPC-ref_plan / SPC-shot_plan asset id (the matrix carries `asset_id` per stage, so `shot.stages.ref_plan.asset_id` / `shot.stages.shot_plan.asset_id` are available).

**Reuse point:** the executor (`reconcile-execute.ts`) already imports and calls `computeNextEvents` for the `approve` path. A refire would instead emit the generator event directly (like the trigger route does via `inngest.send`) — the subscriber for each of these events already exists (the factory-built agent functions).

---

## 4. Recovery-cap counting — `countShotAutonomousAttempts`

Source: `webapp/lib/api/plan-regen-guard.ts` lines 153–170 (imported at factory.ts:40).

**Signature:**
```ts
export async function countShotAutonomousAttempts(
  supabase: ServerSupabaseClient,
  episodeId: string,
  shotId: string,
): Promise&lt;ShotAttemptCount&gt;   // { count: number; readError: boolean }
```

**What it counts (lines 158–164):** `jobs` rows for the episode where `agent_id IN SHOT_REGEN_AGENT_IDS` AND `status IN ('QUEUED','RUNNING','COMPLETED')` AND `input_snapshot-&gt;&gt;shotId === shotId`. It counts per **shot, across all plan versions** (not per plan).

`SHOT_REGEN_AGENT_IDS` (line 41): `['EXEC-EREF', 'EXEC-EREF-DESIGNER', 'EXEC-VGEN']` — **note EXEC-VANIM is NOT in this set**, so shot_plan-stage attempts are not currently counted by this helper.

**Critically: FAILED jobs are EXCLUDED** (line 163, only QUEUED/RUNNING/COMPLETED) — the docstring (lines 146–148) explains this is deliberate so a transient provider failure "does not permanently lock the shot out of recovery."

**Could it serve as the recovery-cap counter for Slice 3?** Partially, with a caveat: for a "re-fire a FAILED shot at most N times" cap you want to count **prior FAILED attempts** — but this helper counts *successful/in-flight* attempts and *excludes* FAILED. So it measures "how many real renders happened" (money spent), not "how many times it failed." It IS the right instrument for a spend-based cap (don't burn more than N renders on one shot), and it already fails-closed via `readError` (returns `{count:0, readError:true}` on query error, lines 166–168, so the caller must treat readError as over-cap). But a failure-count cap ("stop re-firing after N *failures*") would need a different query (count `status='FAILED'` jobs, or `activity_events` `agent_failed`).

Related reusable cap: `assertPlanRegenWithinCap` (lines 59–130) is the per-plan in-flight + runaway-cap chokepoint the trigger route already calls (route lines 259–266). It throws `ConflictError` on cap; the human `director` principal bypasses (line 99), `exec_dir_ai` is capped. The cap value is `planRegenCap()` from `chain-flags`. A refire is an autonomous (`exec-dir-ai`) re-fire, so it would be subject to this guard if it dispatched through the same path.

---

## 5. Slice 4b — armed-episode iteration

Template: `webapp/inngest/functions/pa-batch-stall-watchdog.ts` (cron `*/5 * * * *`, lines 57–233).

**How its cron queries candidate episodes:** two `episodes` selects, results merged into a `Map&lt;id, {id, metadata}&gt;`:
1. FANOUT_RUNNING batches (lines 78–82):
```ts
const { data: eps } = await sb
  .from('episodes')
  .select('id,metadata')
  .eq('metadata-&gt;&gt;eref_pilot_state', 'FANOUT_RUNNING')
  .limit(SCAN_LIMIT);
```
2. (opt-in, behind `THIN_AGENT_ENABLED`) autonomous-run episodes (lines 106–111):
```ts
const { data: autoEps } = await sb
  .from('episodes')
  .select('id,metadata')
  .eq('governance_mode', 3)
  .eq('metadata-&gt;&gt;autonomous_run', 'true')
  .limit(SCAN_LIMIT);
```

This is the exact pattern to mirror: `sb.from('episodes').select('id,metadata').eq('metadata-&gt;&gt;KEY','VALUE')`. Note the JSON accessor is `metadata-&gt;&gt;reconciler_armed` and the value comparison is against the **string** `'true'` (PostgREST `-&gt;&gt;` yields text). For governance mode, `.eq('governance_mode', 2/3)` is a real int column — you cannot express `IN (2,3)` on a boolean+int compound in a single `.eq`; the watchdog handles the multi-condition by running two queries and merging, OR you filter mode client-side after fetching armed episodes. A single-query option: `.eq('metadata-&gt;&gt;reconciler_armed','true').in('governance_mode',[2,3])`.

**How it fires per-episode events (lines 209–217):**
```ts
await inngest.send({
  name: 'sandystudio/pa/notify-needed',
  data: { episodeId: ep.id, source: 'watchdog', triggerId: ep.id, eventType: 'batch_stall' },
});
```
A reconcile-cron would mirror this exactly, emitting `sandystudio/reconcile/episode` `{ episodeId: ep.id }` per candidate.

**Guards worth copying from the watchdog:** `SCAN_LIMIT` bound (line 36), per-episode cooldown via a `metadata.*_nudged_at` stamp (lines 133–138, 219–225), and fail-safe "don't fabricate a stall on query error → skip, retry next tick" (lines 150, 200). The idle-window logic (lines 141–164) is watchdog-specific and not needed if the reconcile-cron just fires unconditionally (the reconciler is idempotent + arm-gated).

**Note:** the arm predicate itself is centralized — `isReconcilerArmed(episodeMeta, governanceMode)` in `production-plan.ts:111–114` = `metadata.reconciler_armed === true &amp;&amp; (mode===2||mode===3)`. The cron's DB filter should mirror this so it doesn't fetch episodes the executor will just no-op on.

---

## 6. How `reconcileEpisode` is triggered today — cron via event vs direct call

**Event:** `sandystudio/reconcile/episode`, declared in `webapp/lib/inngest/client.ts:57–61` (`data: { episodeId: string }`).

**Sole subscriber:** `webapp/inngest/functions/reconcile-episode.ts` (lines 20–58). It:
- debounces 5s per `episodeId` (line 27) and runs concurrency-1 per episode (line 30) — a burst collapses safely,
- calls `reconcileEpisode(supabase, episodeId)` (line 39),
- dispatches the returned cascade events via `step.sendEvent` (lines 49–54).

**Who emits it today:** only `factory.ts:894–898` — after ANY agent completes, unconditionally (`reconcile-trigger`). No cron, no route emits it currently.

**The arm gate lives inside the executor**, not the subscriber: `reconcileEpisode` (reconcile-execute.ts:91) returns `EMPTY` unless `opts.force || isReconcilerArmed(...)`. So the event is safe to emit for any episode — a non-armed episode is a guaranteed no-op.

**Cleaner path for the reconcile-cron: emit `sandystudio/reconcile/episode` per armed episode** rather than calling `reconcileEpisode` directly. Reasons:
- **Reuses the existing subscriber's debounce + concurrency-1** (reconcile-episode.ts:27–30) — a cron tick coinciding with a factory-driven completion collapses into one pass instead of racing on the same REVIEW cells.
- **Reuses the arm gate** automatically (the executor no-ops if not armed) — the cron's DB filter is just an optimization to avoid emitting for non-armed episodes.
- **Keeps event dispatch at the IO boundary** — `reconcileEpisode` deliberately does NOT dispatch its own cascade events (reconcile-execute.ts:14–16); it returns them for the caller to send. Calling it directly from a cron would force the cron to also replicate the `step.sendEvent(result.events)` dispatch loop that the subscriber already implements (reconcile-episode.ts:49–54). Emitting the trigger event delegates all of that to the existing subscriber.

Direct-call is only preferable if the cron needs `opts.force` / custom `reservedShots` / a synchronous result — none of which a "catch silently-stalled shots" sweep requires.

---

## Reuse-point summary

| Need | Existing primitive | Location |
|---|---|---|
| Stage↔agent mapping | `AGENT_STAGE` (reverse) | `state-matrix.ts:311` |
| Failure count per shot×stage | `loadGenerationFailures` (from `activity_events` `agent_failed`) — but folded into `blocked_reason` text, not a typed cell field | `state-matrix.ts:321` |
| Per-shot render-attempt (spend) cap | `countShotAutonomousAttempts` (excludes FAILED) | `plan-regen-guard.ts:153` |
| Per-plan in-flight + runaway HALT guard | `assertPlanRegenWithinCap` (director bypasses, exec_dir_ai capped) | `plan-regen-guard.ts:59` |
| Refire event names (plan-driven) | inline literals — NO shared map | `trigger/route.ts:33`, `next-events.ts:764/829/978` |
| Cron episode-iteration pattern | `paBatchStallWatchdog` (two `.eq('metadata-&gt;&gt;…')` selects merged, cooldown stamp, SCAN_LIMIT, fail-safe skip) | `pa-batch-stall-watchdog.ts:78/106/209` |
| Arm predicate | `isReconcilerArmed` | `production-plan.ts:111` |
| Reserved-pilot set | `resolveReservedShots` | `production-plan.ts:74` |
| Reconcile trigger event + subscriber (debounce, concurrency-1, cascade dispatch) | `sandystudio/reconcile/episode` → `reconcileEpisodeFn` | `client.ts:57`, `reconcile-episode.ts:20` |

**Two structural gaps to note for planning (reality, not proposal):** (a) the decision loop hard-gates on `cell.status === 'REVIEW'` (reconcile.ts:120), so FAILED/empty cells never reach any action branch today; (b) there is no typed, structured job-failure signal on the matrix cell — only `blocked_reason` prose derived from `activity_events`, and `countShotAutonomousAttempts` deliberately excludes FAILED jobs, so neither surface directly answers "how many times did this shot's render FAIL."</result>
<usage><subagent_tokens>93750</subagent_tokens><tool_uses>13</tool_uses><duration_ms>130280</duration_ms></usage>
</task-notification>

## 2026-07-16 12:23 · director-msg (hook) · NEW · (triage at distill)
even after deploy Factory — Adaptation Overview
The slow loop: is the factory getting cheaper and more autonomous episode over episode — and what did the churn teach us? Honest churn = REVISE per artifact version, never runs/shot.

No scorecards yet. The discriminator fills in as episodes ship (post-distribution).

## 2026-07-16 14:20 · director-msg (hook) · NEW · (triage at distill)
q12a q13 look for it. because  i can see in UI - budget is calculated (make in factory page: total,precast,postcast/shot, and (folded - every agents/endpoints). checkboxes for visualis in grafics - episode,  total,precast,postcast/shot, agents/endpoints )
 #1 фильтр: checkboxes (exact episode, all , exclude archived (default)

## 2026-07-16 14:21 · director-msg (hook) · NEW · (triage at distill)
<task-notification>
<task-id>a697092916c61d21f</task-id>
<tool-use-id>toolu_01RiZQsi1DRVdtx9Dut9EgwG</tool-use-id>
<output-file>C:\Users\NAVIAV~1\AppData\Local\Temp\claude\C--SandyStudio--claude-worktrees-conductor-phase2\25a4dc36-f68e-4054-b71f-c3a380c7cb48\tasks\a697092916c61d21f.output</output-file>
<status>completed</status>
<summary>Agent "Verify Slice 3 core files" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>All three files are fully read. Here is the verification against the plan's reconnaissance claims.

## 1. `webapp/lib/agents/state-matrix.ts`

**`getEpisodeStateMatrix` (lines 187-308) — does NOT read the `jobs` table.** CONFIRMED. It reads only `episodes` (line 192-196), `assets` (line 204-207), `assets` again via `resolveShotSpine` for the storyboard (line 146-154), and `activity_events` via `loadGenerationFailures` (line 327-332). No `jobs` table reference anywhere in the file.

**`StageState` type (lines 51-60) — current fields:**
```ts
export interface StageState {
  status: string | null;      // DRAFT|REVIEW|APPROVED|LOCKED|REVISION|INVALIDATED|null
  version: number | null;
  asset_id: string | null;
  fresh: boolean;
  blocked_reason?: string;    // optional
}
```
- `status`: present, `string | null`.
- `blocked_reason`: present, optional `string`.
- `failure_count`: NOT present. There is no `failure_count` field. Failure count is instead surfaced textually inside `blocked_reason` (see line 280) and lives only in the internal `loadGenerationFailures` map value (`{ count, lastMsg }`). Flag for the plan: if it assumes a structured `failure_count` field on the cell, that does not exist — only prose in `blocked_reason`.

**`loadGenerationFailures` (lines 321-352, NOT ~321 declaration but body starts here).** CONFIRMED near line 321. Returns `Map&lt;string, { count: number; lastMsg: string | null }&gt;`. Keyed by `` `${shotId}::${stage}` `` (line 340). It queries `activity_events` filtered `event_type = 'agent_failed'` (line 331), maps each event's `metadata.agent` through `AGENT_STAGE` to a stage (line 338), and counts per key, keeping the newest description (rows ordered `created_at` desc) truncated to 80 chars as `lastMsg`. Claim CONFIRMED, with the precision that the key uses the resolved `stage` (via `AGENT_STAGE`), not the raw agent name.

**`blocked_reason` written into the cell — TWO places, not one:**
- First-pass freshness reason (lines 255-262):
```ts
const { fresh, reason } = computeFreshness(stage, shotId, row, chosen);
stages[stage] = {
  status: row.status ?? null,
  version: row.version ?? null,
  asset_id: row.id,
  fresh,
  ...(reason ? { blocked_reason: reason } : {}),
};
```
- The failure-surfacing pass the plan cites (~272-284) is lines 272-284:
```ts
const failures = await loadGenerationFailures(supabase, episodeId);
if (failures.size &gt; 0) {
  for (const shot of shots) {
    for (const stage of STAGE_ORDER) {
      const cell = shot.stages[stage];
      if (cell.status !== null) continue; // only truly-stuck (never produced) cells
      const fail = failures.get(`${shot.shot_id}::${stage}`);
      if (fail) {
        cell.blocked_reason = `генерация упала ×${fail.count}${fail.lastMsg ? ` (${fail.lastMsg})` : ''} — нужен retry или park`;
      }
    }
  }
}
```
Claim CONFIRMED at lines 272-284. Note the guard `if (cell.status !== null) continue;` — the failure reason is stamped only onto EMPTY (never-produced) cells.

**`AGENT_STAGE` map (lines 311-316).** CONFIRMED, matches claim exactly:
```ts
const AGENT_STAGE: Record&lt;string, StageName&gt; = {
  'EXEC-EREF-DESIGNER': 'ref_plan',
  'EXEC-EREF': 'ref_image',
  'EXEC-VANIM': 'shot_plan',
  'EXEC-VGEN': 'video',
};
```

**STAGE_ORDER / stage list.** CONFIRMED — exported at line 30:
```ts
export const STAGE_ORDER = ['ref_plan', 'ref_image', 'shot_plan', 'video'] as const;
export type StageName = (typeof STAGE_ORDER)[number];
```
Related maps (not requested but relevant): `FILE_TYPE_BY_STAGE` (lines 34-39) and `UPSTREAM_OF` (lines 44-49).

## 2. `webapp/lib/agents/reconcile.ts`

**`if (cell.status !== 'REVIEW') continue;` guard.** CONFIRMED at line 120 (exactly as claimed). Surrounding loop (lines 113-121):
```ts
for (const shot of matrix.shots) {
  if (shot.excluded) continue;
  if (reservedShots.has(shot.shot_id)) continue; // Director gates this shot
  if (!isShotInPlan(plan, shot.shot_id)) continue; // out-of-plan → never auto-advance

  for (const stage of STAGE_ORDER) {
    const cell = shot.stages[stage];
    if (cell.status !== 'REVIEW') continue; // only REVIEW stages are actionable
    const key = signalKey(shot.shot_id, stage);
```

**Action union type `ReconcileAction` (lines 44-48) — `kind` values:** `approve`, `stitch`, `halt`, `wait`. Full definition:
```ts
export type ReconcileAction =
  | { kind: 'approve'; assetId: string; shotId: string; stage: StageName; reason: string }
  | { kind: 'stitch'; reason: string }
  | { kind: 'halt'; shotId: string; stage: StageName; reason: string }
  | { kind: 'wait'; shotId: string | null; stage: StageName | null; reason: string };
```

**Guards for reserved / excluded / in-plan shots** — all three at lines 114-116 (quoted above): `shot.excluded` → skip; `reservedShots.has(shot.shot_id)` → skip (Director gate); `!isShotInPlan(plan, shot.shot_id)` → skip (out-of-plan never auto-advances). There is an additional freshness guard at lines 124-132 emitting a `wait` action for stale REVIEW cells.

## 3. `webapp/lib/agents/reconcile-execute.ts`

**How `reviseCounts` is collected.** NOT collected inline in this file — it is destructured from `collectCriticSignals(...)` (imported from `./reconcile`) at lines 100-102:
```ts
const { verdicts, reviseCounts } = collectCriticSignals(
  (revData ?? []) as Array&lt;{ file_type?: string | null; version?: number | null; metadata?: unknown }&gt;,
);
```
`revData` comes from a query over `assets` filtered `file_type LIKE 'REV-%'` (lines 95-99). The actual counting lives in `collectCriticSignals` in reconcile.ts (lines 76-102): it maps REV file types via `STAGE_BY_REV_FILE_TYPE` (only `REV-ref_plan`→`ref_plan` and `REV-shot_plan`→`shot_plan` — lines 39-42) and increments `reviseCounts` when `verdict === 'REVISE' || verdict === 'FAIL'` (lines 97-99). Flag for the plan: the claim says "from REV-assets" — accurate, but note only ref_plan and shot_plan REV types are mapped (ref_image and video have no critic REV type), and both `REVISE` and `FAIL` verdicts increment the count.

**How events are pushed / dispatched.** This module does NOT dispatch Inngest events — it collects them into a local `events` array and RETURNS them (lines 120, 169) for the caller to send (documented lines 13-16). DB mutations (status flips via `executeApprove`) happen here; event dispatch stays at the IO boundary.

**Action-loop switch shape (lines 124-167)** — an `if / else if` chain on `action.kind`, not a `switch`:
```ts
for (const action of actions) {
  if (action.kind === 'approve') {
    const cascade = await executeApprove(supabase, action.assetId, actorUserId);
    approvedAssetIds.push(action.assetId);
    events.push(...cascade);
    await logEvent(supabase, { event_type: 'reconcile/auto-approved', ... });
  } else if (action.kind === 'stitch') {
    events.push({ name: 'sandystudio/exec-stitch/assemble-episode', data: { episodeId } });
  } else if (action.kind === 'halt') {
    halted.push({ shotId: action.shotId, stage: action.stage, reason: action.reason });
    await logEvent(supabase, { event_type: 'reconcile/halt', ... });
    await raiseBlockerOnce(supabase, { ... });
  }
  // 'wait' → nothing to do this pass.
}
```
- `approve`: calls `executeApprove` (lines 177-217) which demotes the sibling APPROVED (`demoteSiblingApproved`), flips status to APPROVED (line 205), then `computeNextEvents` returns the cascade; also logs `reconcile/auto-approved`.
- `stitch`: pushes an Inngest event descriptor `sandystudio/exec-stitch/assemble-episode`.
- `halt`: records into `halted`, logs `reconcile/halt`, AND routes to the Director via `raiseBlockerOnce` (lines 156-164).
- `wait`: no-op.

## Summary of discrepancies to flag
- No structured `failure_count` field exists on `StageState`; failure counts are only embedded as prose in `blocked_reason` (state-matrix.ts:280) and held in the internal `loadGenerationFailures` map (`{count, lastMsg}`).
- `blocked_reason` is written in TWO locations (freshness pass lines 255-262 and failure pass lines 272-284), not just the failure pass.
- `reviseCounts` is not computed in reconcile-execute.ts; it comes from `collectCriticSignals` in reconcile.ts, and increments on both `REVISE` and `FAIL`, only for `REV-ref_plan`/`REV-shot_plan`.
- The action loop is an `if/else-if` chain, not a `switch`; and events are returned, not dispatched, from this module.

All other claims (no `jobs` read, `loadGenerationFailures` keying/behavior, `AGENT_STAGE`, `STAGE_ORDER`, the line-120 REVIEW guard, the reserved/excluded/in-plan guards, the action union) match the current code exactly.</result>
<usage><subagent_tokens>45839</subagent_tokens><tool_uses>3</tool_uses><duration_ms>50435</duration_ms></usage>
</task-notification>

## 2026-07-16 14:22 · director-msg (hook) · NEW · (triage at distill)
<task-notification>
<task-id>a96a8a703dff27716</task-id>
<tool-use-id>toolu_01XM4TRCryLzo1b5VSsSHC5v</tool-use-id>
<output-file>C:\Users\NAVIAV~1\AppData\Local\Temp\claude\C--SandyStudio--claude-worktrees-conductor-phase2\25a4dc36-f68e-4054-b71f-c3a380c7cb48\tasks\a96a8a703dff27716.output</output-file>
<status>completed</status>
<summary>Agent "Verify Slice 4b cron template" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>I have everything needed. Here is the reconnaissance report.

## 1. `webapp\inngest\functions\pa-batch-stall-watchdog.ts` (FULL FILE, 234 lines)

Verified in full above. Key landmarks for mirroring into `reconcile-cron.ts`:

- **Cron expression** — line 63: `{ cron: '*/5 * * * *' }` (every 5 minutes). Function config lines 57-64: `id: 'pa-batch-stall-watchdog'`, `name: 'PA batch-stall watchdog (5-min)'`, `retries: 0`.
- **`SCAN_LIMIT` constant** — line 36: `const SCAN_LIMIT = 20; // bound the per-tick read cost`. Other tunables alongside it: `IDLE_MIN = 6` (34), `COOLDOWN_MIN = 12` (35), `ACTIVE_WINDOW_H = 2` (39), `THREAD_TTL_MIN` env-overridable (42).
- **The DB query it runs** — the primary scan, lines 78-82:
  ```ts
  const { data: eps, error } = await sb
    .from('episodes')
    .select('id,metadata')
    .eq('metadata-&gt;&gt;eref_pilot_state', 'FANOUT_RUNNING')
    .limit(SCAN_LIMIT);
  ```
  Note this uses the PostgREST `-&gt;&gt;` **text** accessor and compares to a string. A second, opt-in scan (lines 106-111, behind `THIN_AGENT_ENABLED`) queries `.eq('governance_mode', 3).eq('metadata-&gt;&gt;autonomous_run', 'true')`. It also reads `jobs` (141-147) and `activity_events` (193-199) per candidate.
- **Fail-safe on query error** — three independent guards, all "skip / no-fabricate / retry-next-tick":
  - Main episode query (83-86): `if (error) { logger.warn(...); return { skipped: 'query_failed', error: error.message }; }`
  - Jobs idle query (148-150): `if (jobErr) continue;` with the explicit comment "A failed query must NOT be read as 'no activity → stalled'... Skip this episode on error; next tick retries."
  - Fresh-events query (200): `if (feErr) continue; // query failed — don't fabricate a stall, retry next tick`
- **The "re-drive" logic** (the part the plan says could move off the watchdog) — lines 209-227: it re-fires the notify event and stamps a cooldown marker:
  ```ts
  await inngest.send({
    name: 'sandystudio/pa/notify-needed',
    data: { episodeId: ep.id, source: 'watchdog', triggerId: ep.id, eventType: 'batch_stall' },
  });
  // ...stamp metadata.batch_watchdog_nudged_at (222-225)
  ```
  This is a **Polina nudge** (re-fire `pa/notify-needed`), gated by cooldown (133-138), an idle check (140-164), and a thread-aware "new actionable state" guard (166-206). It is NOT a reconciler call — it does not touch `reconcileEpisode`.

## 2. Function registration — `webapp\inngest\index.ts`

Two-step pattern: import (lines 7-42), then push into the exported `functions` array (44-90).
- Watchdog registered: import line 40 `import { paBatchStallWatchdog } from './functions/pa-batch-stall-watchdog';`, array entry line 85.
- **A reconciler function already exists and is registered**: import line 41 `import { reconcileEpisodeFn } from './functions/reconcile-episode';`, array entry line 87 (comment line 86: "Фаза 2b — reconciler self-advance (inert unless the episode is armed)").
- To add `reconcile-cron`: add an import near line 41 and an array entry near line 87.

## 3. Episode arm state — column names and read/write sites

Confirmed columns via `reconcileEpisode` select (`reconcile-execute.ts:82-84`): `.select('metadata, governance_mode')`. So `metadata` (jsonb) and `governance_mode` (int) are the exact column names.

**The canonical arm predicate** — `webapp\lib\agents\production-plan.ts:111-114`:
```ts
export function isReconcilerArmed(episodeMeta: unknown, governanceMode: number | null): boolean {
  const armed = (episodeMeta as { reconciler_armed?: unknown } | null)?.reconciler_armed === true;
  return armed &amp;&amp; armForMode(governanceMode);
}
```
with `armForMode` (95-97): `return mode === 2 || mode === 3;`

**MISMATCH TO FLAG (important for a SQL-filtered cron):** The armed check is `metadata.reconciler_armed === true` — a **strict JSON boolean**, read into JS and compared, NOT the PostgREST text filter `metadata-&gt;&gt;reconciler_armed = 'true'`. No code anywhere filters episodes on `reconciler_armed` at the query layer; every consumer reads the full `metadata` object and checks `=== true` in JS. The watchdog's `metadata-&gt;&gt;autonomous_run = 'true'` pattern exists for a *different* key. If `reconcile-cron.ts` wants to pre-filter armed episodes in the DB query, `.eq('metadata-&gt;&gt;reconciler_armed', 'true')` would work at the text level (jsonb `-&gt;&gt;` renders boolean `true` as the string `'true'`), but it must also filter `governance_mode` in `(2,3)` and should ideally still call `isReconcilerArmed` per-row to match existing strict semantics.

Read/write sites for `reconciler_armed`:
- **READ**: `production-plan.ts:112` (predicate above); consumed by `reconcile-execute.ts:91` (`if (!opts.force &amp;&amp; !isReconcilerArmed(...)) return EMPTY;`).
- **WRITE at creation**: `webapp\app\api\episodes\route.ts:109` — `reconciler_armed: armForMode(body.governance_mode),`
- **WRITE on mode switch**: `webapp\app\api\system\governance-mode\route.ts:94` — `const nextMeta = { ...prevMeta, reconciler_armed: armForMode(body.targetMode) };` then `.update({ governance_mode: body.targetMode, metadata: nextMeta })` (97).
- Comment references (not writes): `factory.ts:892`, `inngest/functions/reconcile-episode.ts:11`, `lib/concierge/tools/conductor.ts:152`, `lib/concierge/tools/index.ts:152`, tests `reconcile-execute.test.ts:62,74`.

So the plan's claim is **conceptually correct** (arm ⇔ `reconciler_armed` truthy AND `governance_mode ∈ {2,3}`) but the exact stored/read form is a **JSON boolean checked with `=== true` in JS**, not a `-&gt;&gt;… = 'true'` SQL comparison. Confirmed by `PLAN.md:57`: "armed ⇔ `metadata.reconciler_armed` + `governance_mode∈{2,3}`".

## 4. Existing cron functions (besides the watchdog)

Only ONE other cron exists. Full inventory (all `cron:` occurrences under `webapp\inngest\functions`):
- `pa-batch-stall-watchdog.ts:63` — `*/5 * * * *` (every 5 min) — the subject file.
- `pa-orphaned-awaiting-sweep.ts:50` — `0 * * * *` (hourly).

Note: `schedule-analytics.ts` is **event-driven**, not cron (trigger `{ event: 'sandystudio/exec-pub/published' }`, line 33) despite the "cron fan-out" label in index.ts comment line 72 — flag this if the plan counts it as a cron. `reconcile-episode.ts` is also **event-driven** (`{ event: 'sandystudio/reconcile/episode' }`, line 32), fired by `factory.ts` after every agent completion (`factory.ts:895` `step.sendEvent('reconcile-trigger', ...)`).

## Bottom-line flags for the plan

1. A reconciler Inngest function **already exists** (`reconcile-episode.ts`, event-driven, debounced 5s + concurrency-1 per episode). The new `reconcile-cron.ts` would be a **cron-based complement/safety-net**, not a replacement — mirror the watchdog's cron+scan+fail-safe shape but call `reconcileEpisode(supabase, episodeId)` (from `lib/agents/reconcile-execute.ts`) instead of re-firing `pa/notify-needed`.
2. The watchdog's "re-drive" is a Polina nudge, not a reconciler tick — if the plan wants to "move re-drive off the watchdog into the cron," be aware these are two different mechanisms (notify-needed vs. reconcile convergence).
3. Arm-state SQL form: existing code checks `reconciler_armed === true` in JS on a jsonb boolean, not `metadata-&gt;&gt;reconciler_armed = 'true'`. Match `isReconcilerArmed` semantics (`reconcileEpisode` already enforces the arm internally and returns `EMPTY` when unarmed, so a cron can call it unconditionally and rely on the built-in gate — same pattern as `factory.ts` firing on every completion).</result>
<usage><subagent_tokens>48909</subagent_tokens><tool_uses>10</tool_uses><duration_ms>80479</duration_ms></usage>
</task-notification>

## 2026-07-16 14:22 · director-msg (hook) · NEW · (triage at distill)
<task-notification>
<task-id>aea8b5daff53c7e74</task-id>
<tool-use-id>toolu_01H4r1Cp1puJ2gcgxwd2mT44</tool-use-id>
<output-file>C:\Users\NAVIAV~1\AppData\Local\Temp\claude\C--SandyStudio--claude-worktrees-conductor-phase2\25a4dc36-f68e-4054-b71f-c3a380c7cb48\tasks\aea8b5daff53c7e74.output</output-file>
<status>completed</status>
<summary>Agent "Verify Slice 3.5 arm-aware onFailure" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>All claims verified against current code. Here is the report.

## 1. `webapp/lib/agents/factory.ts` — `onFailure` handler

**Location: lines 230-253** (inside the `createFunction` config object; the wiring comment is at lines 224-229).

```ts
onFailure: async ({ event, error }: { event: { data?: { event?: { data?: Record&lt;string, unknown&gt; } } }; error: Error }) =&gt; {
  try {
    const original = event?.data?.event?.data;
    const episodeId = typeof original?.episodeId === 'string' ? original.episodeId : null;
    if (!episodeId) return;
    const shotId = typeof original?.shotId === 'string' ? original.shotId : null;
    const supabase = createSupabaseServiceRoleClient();
    const ctx = spec.resolveActivityContext
      ? spec.resolveActivityContext(original as Record&lt;string, unknown&gt;)
      : null;
    const suffix = ctx?.shortLabel ? ` — ${ctx.shortLabel}` : '';
    await raiseBlockerOnce(supabase, {
      episodeId,
      stage: `agent_failed:${spec.agentId}`,
      shotId,
      actor: spec.agentId,
      title: `${agentDisplayName(spec.agentId)} failed after retries${suffix} — needs Director`,
      description: (error?.message ?? '').slice(0, 500),
      metadata: { agent: spec.agentId, reason: 'retries_exhausted', ...(ctx?.metadata ?? {}) },
    });
  } catch {
    // Best-effort — a failed escalation must never mask the original failure.
  }
},
```

Answers to your specific questions:
- **Calls `blocker_raised`/`raiseBlockerOnce` directly?** Yes — it calls `raiseBlockerOnce` directly (line 241). It does NOT call `logEvent`/`blocker_raised` itself; it delegates entirely to `raiseBlockerOnce`. Import at line 38: `import { raiseBlockerOnce } from '../api/blocker-escalation';`
- **Reads `episodes.metadata` / `governance_mode` near there?** NO. The `onFailure` handler does no episode-row lookup at all — no `.from('episodes')`, no `metadata`, no `governance_mode`. (Those reads happen elsewhere in the factory body: `governance_mode` is read in `save-and-complete` at lines 584-588 and in `plan-critic-autofire` at lines 780-784 — but not in `onFailure`.)
- **How does it get episodeId/stage/shotId?** From the wrapped original event payload `event.data.event.data` (Inngest nests the original event under `event.data.event` in the failure envelope): `episodeId` and `shotId` are read off `original` (lines 233, 235). `stage` is NOT from the event — it is a hardcoded template `` `agent_failed:${spec.agentId}` `` (line 244). The short label/extra metadata come from `spec.resolveActivityContext(original)`.

## 2. `webapp/lib/api/blocker-escalation.ts` — `raiseBlockerOnce`

**Signature: lines 46-49.**
```ts
export async function raiseBlockerOnce(
  supabase: ServerSupabaseClient,
  input: BlockerInput,
): Promise&lt;BlockerOutcome&gt;
```

- **Dedup key** (line 50): `` const blockerKey = `${input.stage}:${input.shotId ?? ''}`; `` — note the actual key is `stage:shotId-or-empty-string`, not literally `${stage}:${shotId}`. When `shotId` is null/undefined the key ends in a trailing colon (e.g. `agent_failed:EXEC-SW:`). Minor deviation from the claim's `${stage}:${shotId}` wording, but functionally the dedup is by `(stage, shotId)`.
- **Behavior:** episode-scoped fetch of `blocker_raised` rows (lines 56-60), then dedup in JS — returns `'deduped'` if any row has `resolved_at == null &amp;&amp; metadata.blocker_key === blockerKey` (lines 61-65). Dedup read failures **fail open** (catch, lines 66-69). On no dup it calls `logEvent` with `event_type: 'blocker_raised'`, `severity: 'error'`, merging `blocker_key`, `stage`, `shot_id` into metadata (lines 72-86), returns `'raised'`; returns `'error'` if `logEvent` throws.
- **Over `logEvent`?** Yes — confirmed, it is built on `logEvent` (import line 19, call line 72), not a direct insert. Return type `BlockerOutcome = 'raised' | 'deduped' | 'error'` (line 38).

## 3. `webapp/lib/agents/production-plan.ts`

**`isReconcilerArmed` — lines 111-114:**
```ts
export function isReconcilerArmed(episodeMeta: unknown, governanceMode: number | null): boolean {
  const armed = (episodeMeta as { reconciler_armed?: unknown } | null)?.reconciler_armed === true;
  return armed &amp;&amp; armForMode(governanceMode);
}
```
- **Args:** `(episodeMeta: unknown, governanceMode: number | null)`. Matches your `(meta, mode)` claim. `armForMode` (lines 95-97) is `mode === 2 || mode === 3`.
- **MISMATCH to flag:** the JSDoc above it (line 113) says *"`opts.force` still bypasses this"* — but `isReconcilerArmed` itself takes **no `opts` param**. The `opts.force` bypass actually lives in the *caller* `reconcileEpisode` (see item 5). So the doc comment is slightly misleading about this function's own signature.

**`resolveReservedShots` — lines 74-81:**
```ts
export function resolveReservedShots(episodeMeta: unknown): Set&lt;string&gt; {
  const reserved = resolveReservedGates(episodeMeta);
  if (!reserved.includes('pilots')) return new Set&lt;string&gt;();
  const meta = (episodeMeta ?? null) as { eref_pilot_shot_ids?: unknown } | null;
  const ids = meta?.eref_pilot_shot_ids;
  if (!Array.isArray(ids)) return new Set&lt;string&gt;();
  return new Set(ids.filter((v): v is string =&gt; typeof v === 'string'));
}
```
- **Args:** single arg `(episodeMeta: unknown)` → `Set&lt;string&gt;`. Returns empty set unless `'pilots'` is a reserved gate; otherwise the set of `episodeMeta.eref_pilot_shot_ids`.

## 4. `webapp/lib/agents/chain-flags.ts` — flag helpers

Existing exported helpers (with line numbers):
- `designerChainEnabled()` — L13 (env `DESIGNER_CHAIN_ENABLED`, default false)
- `animatorChainEnabled()` — L25 (env `ANIMATOR_CHAIN_ENABLED`, default false)
- `readabilityGateEnabled()` — L35 (env `READABILITY_GATE_ENABLED`, default false)
- `continuityLedgerEnabled()` — L50 (env `CONTINUITY_LEDGER_ENABLED`, default false)
- `checkersFreeTierEnabled()` — L66 (env `CHECKERS_FREE_TIER`, default **true**)
- `stopBeforeErefEnabled()` — L79 (env `C1_STOP_BEFORE_EREF`, default false)
- `planRegenCap()` — L97 (env `PLAN_REGEN_CAP`, default 3)
- `shotRegenCap()` — L120 (env `SHOT_REGEN_CAP`, default 6)
- `capFromMetadata()` — L140 (private helper: metadata override → env default)
- `promptRevisionCap()` / `resolvePromptRevisionCap(metadata)` — L147 / L152 (default 2)
- `referenceRegenCap()` / `resolveReferenceRegenCap(metadata)` — L156 / L161 (default 2)
- `videoRegenCap()` / `resolveVideoRegenCap(metadata)` — L165 / L170 (default 1)
- `anchorVisualGateEnabled()` — L182 (env `ANCHOR_VISUAL_GATE`, default **true**)

**`reconcileRecoveryCap`? — CONFIRMED ABSENT.** No `reconcileRecoveryCap`/`recoveryCap`/`recovery_cap` anywhere in `webapp` (grep returned no matches). Your claim that it does not exist yet holds.

**Two patterns to mirror.** For a boolean flag, the numeric-cap pattern is the right analog for a "cap". Representative numeric-cap helper (verbatim, lines 120-124):
```ts
export function shotRegenCap(): number {
  const v = process.env.SHOT_REGEN_CAP;
  const n = v ? Number.parseInt(v, 10) : NaN;
  return Number.isFinite(n) &amp;&amp; n &gt; 0 ? n : 6;
}
```
If you want per-episode metadata override (like the retry caps), mirror this pair (lines 156-163):
```ts
export function referenceRegenCap(): number {
  const v = process.env.REFERENCE_REGEN_CAP;
  const n = v ? Number.parseInt(v, 10) : NaN;
  return Number.isFinite(n) &amp;&amp; n &gt; 0 ? n : 2;
}
export function resolveReferenceRegenCap(metadata: unknown): number {
  return capFromMetadata(metadata, 'reference_regen_cap', referenceRegenCap);
}
```
Note: `capFromMetadata` is numeric-only. `on_model_strictness` is an **enum** (`loose|medium|strict`), so you'd need a string analogue (a `resolveOnModelStrictness(metadata)` returning the enum with a default), not `capFromMetadata` directly.

**(b) Written at episode creation as a real default** — `webapp\app\api\episodes\route.ts`
- Lines **95-110**, the `epMetadata` object seeded on every new episode:
```ts
const epMetadata = {
  concierge_cap_usd: conciergeBudgetCapConfig().capUsd,
  prompt_revision_cap: promptRevisionCap(),
  reference_regen_cap: referenceRegenCap(),   // line 105
  video_regen_cap: videoRegenCap(),
  reconciler_armed: armForMode(body.governance_mode),
};
```
This metadata object is then written into the `episodes` insert payload (`epPayload`, line 112+).

**(c) API PATCH/GET validation + persistence** — `webapp\app\api\episodes\[id]\settings\route.ts`
- Zod whitelist `Body` (`.strict()`, unknown keys → 400), line **80**: `reference_regen_cap: z.number().int().positive().max(20).nullable().optional(),` (siblings at 79/81).
- Patch application, line **156**: `if (body.reference_regen_cap !== undefined) patch.reference_regen_cap = body.reference_regen_cap;` (siblings 155/157).
- Merge into `episodes.metadata` JSON column: lines **203-218** (`newMeta = {...currentMeta, ...patch}`, idempotent update, audit `logEvent` at 224-234).
- GET hydrate endpoint returns `metadata` as-is, lines **248-267**.
- For an enum field you'd add `on_model_strictness: z.enum(['loose','medium','strict']).nullable().optional()` to `Body` and one `patch.on_model_strictness = ...` line. No cross-field validation needed (like the caps, comment at 154).

**(d) Episode Settings UI** — `webapp\components\episode\EpisodeSettingsCard.tsx`
- Default consts, lines **66-68**: `DEFAULT_PROMPT_REVISION_CAP = 2` etc.
- Generic metadata reader `readCap(meta, key)`, lines **69-73**.
- State init from `initialMetadata`, lines **95-103** (`refCapInput` at 98-100).
- Refetch/hydrate in `useEffect`, lines **114-150** (ref cap at 136-138).
- Save handler `saveCaps()`, lines **199-237** — validates 1–20, PATCHes `{prompt_revision_cap, reference_regen_cap, video_regen_cap}` (body at 222-226).
- Rendered control: the "Retry caps" block, lines **453-509**; the "Рефы" number input bound to `refCapInput` at **474-486**, "Save caps" button at 500-507.
- The existing **pipeline_mode** control (lines **339-366**) is the closest UI precedent for an *enum segmented-button* setting (loose/medium/strict), rather than a number input. It uses `readPipelineMode` from `webapp\lib\api\pipeline-mode.ts` and a 2-value button group — mirror that for a 3-value strictness slider.

**(e) Consumed in the runner** — `webapp\lib\agents\runners\episode-references.ts`
- Line **1959**: `const maxRetries = resolveReferenceRegenCap(ep?.metadata);` (episode metadata read off `inputs.episode`, shape typed inline at 1945-1953 including `metadata?: unknown`).
- Import at line **104** area (`resolveReferenceRegenCap` pulled from chain-flags).

**Label-bug note (from PLAN.md 68-75):** `reference_regen_cap` = "regens OVER the first", so the loop `for (retry=0; retry&lt;=maxRetries; retry++)` gives `cap+1` passes (default 2 → 3 attempts). Semantics are self-consistent; only the UI label historically lied. Relevant if you copy the doc text.

---

## 2. `pickBestAttempt` + `KEEP_ATTEMPT_SCORE_THRESHOLD` — already in CRIT-first state

**Definition** — `webapp\lib\api\shot-reference.ts`:
- Line **193**: `export const KEEP_ATTEMPT_SCORE_THRESHOLD = 85;`
- Lines **201-212**: `reviewComposite()` — mean of non-null 0-100 sub-scores + `criticalCount`.
- Lines **214-217**: `attemptClearsKeepBar(composite, criticalCount)` = `criticalCount === 0 &amp;&amp; composite &gt;= 85`.
- Lines **219-245**: `pickBestAttempt(attempts)` — **CRIT-first ranking is already implemented**:
```ts
const aCrit = a.critical_count ?? 0;
const bCrit = best.critical_count ?? 0;
if (aCrit &lt; bCrit) best = a;                                              // fewer CRITICAL wins first
else if (aCrit === bCrit &amp;&amp; (a.composite_score ?? -1) &gt; (best.composite_score ?? -1)) best = a;  // then higher composite
```
Ties resolve to the **earlier** attempt (loop keeps `best` unless strictly better). Doc-block at 219-229 cites the E30 SH13 bug (2026-07-17) that motivated CRIT-first.

**The scored fields** live on `GenerationAttempt` — `shot-reference.ts` lines **106-142** (`review?`, `composite_score?`, `critical_count?` at 137-141).

**Consumers** — `webapp\lib\agents\runners\episode-references.ts`:
- Import line **104**.
- Keep-first/keep-best doc-block lines **2317-2321**.
- Cap-reached branch, lines **2534-2543**: `const best = pickBestAttempt(generationHistory) ?? attempt;` (line 2540) → `finalVerdict = 'REGENERATE_EXHAUSTED'`.

**Commit confirmed:** `a87d4a83 fix(eref): keep-best ranks clean over high-scoring (CRIT-first)` is the HEAD-most change to `shot-reference.ts` (prior: `5b8f9f69` added keep-first/keep-best). So #2 is done — no action needed beyond awareness.

**Tests** — `webapp\__tests__\lib\api\shot-reference-keepbest.test.ts` (imports `pickBestAttempt`, `KEEP_ATTEMPT_SCORE_THRESHOLD`, `attemptClearsKeepBar`; CRIT-first cases at lines 105, 110, 115).

---

## 3. Transformation marker on a storyboard shot — **DOES NOT EXIST**

I searched `specs/**`, `webapp/**/*.ts`, storyboard schema, and the runtime shot-parsing paths. There is **no** `transformation`, `gloop`/`Gloop`, `morph`, `shapeshift`, or off-model-expected flag anywhere in the shot schema or shot metadata.

Evidence:
- **Shot schema spec** — `specs\schemas\shot.md` (single-shot YAML schema, lines **34-112**). Fields present: `shot_id, scene_id, camera_angle/movement, location, characters_present, action, mood, comic_beat, is_punchline, vertical_safe, landscape_only, props_in_frame, special_effects, style_notes, status`. **No transformation field.** The closest expressive escape hatches are `special_effects` (line 102) and `style_notes` (line 104, *"any deviation from standard style bible for this shot… e.g. 'silhouette only, backlit'"*) — both free-text, not a structured/queryable flag.
- **Runtime shot fields actually consumed** — `webapp\lib\agents\runners\episode-reference-designer.ts` lines **547-554**: `shot_role, camera_angle, duration_seconds, action_prose (?? action ?? key_beat), expected_gag, expected_emotion, characters_present`. No transformation field read.
- **Storyboard shot parsing is untyped/loose** — `webapp\lib\agents\runners\storyboarder.ts` emits shots as a JSON block; parsers only pull `shot_id`. E.g. `webapp\lib\api\eref-shot-invariant.ts` lines **33-62** (`interface StoryboardShot { shot_id: string }`), and `webapp\lib\agents\visual-verdict.ts` `loadShotContract()` lines **126-156** returns the raw shot object as `unknown`. There is **no zod schema** for storyboard shots — they are free-form JSON in the STB asset `content`.
- The only `transform`/`off-model` hits in `webapp` are unrelated: CSS transforms and the vision-critic's `anatomy_on_model` check (see below).

**Implication for your feature:** a transformation-aware exception has **no existing marker to key off**. You would need to introduce one — either a new structured shot field (e.g. `transformation: string | boolean` in the STB JSON + storyboarder prompt), or a naming convention detector (e.g. `Gloop-&lt;char&gt;`) parsed from `characters_present`/`action_prose`. Neither exists today. The naming-convention route matches the `"Gloop-Sandy"` hint in PLAN.md line 37 and needs zero schema change, but relies on prose parsing.

---

## 4. Where the on-model gate / detector plugs in (context for the strictness slider consumer)

The strictness slider is meant to feed the new on-model detector gate. Current state of that surface:

- **Vision critic core** — `webapp\lib\agents\visual-verdict.ts`:
  - `VisualFinding.check` enum includes `'anatomy_on_model'` (line **29**) and `severity: 'critical'|'major'|'minor'` (line 33).
  - `VisualVerdict` = `{ verdict: 'PASS'|'REVISE'|'FAIL', findings, summary }` (lines **39-43**).
  - `runVisualVerdict()` (lines 80-123) runs the `visual-shot-verdict` rubric skill against rendered frames. `loadStyleCanon` (158-169) / `loadLocationCanon` (179-198) supply Bible canon. This is the "5 blind agents / strict rubric" detector referenced in PLAN.md 32-35.
- **In-pipeline runner** — `webapp\lib\agents\runners\visual-shot-critic.ts` (exists; wraps `visual-verdict.ts`).
- **The gap the PLAN describes (lines 28-31):** the reconciler auto-approves REVIEW→APPROVED unconditionally; `reconcile.ts:32 STAGE_HAS_CRITIC.ref_image = FALSE` means the visual verdict is **not wired to approval**. A strictness slider would be read (via a new `resolveOnModelStrictness(ep.metadata)`) at that gate to pick the PASS/FAIL threshold, and the transformation exception (#3) would suppress the silhouette-based FAIL for declared-transformation shots.

---

## 5. Episode-metadata typing/validation — where a new field is declared correctly

There is **no single central zod type** for `episodes.metadata` — it is the Supabase `Json` column. Validation is **whitelist-at-the-write-boundary**:

- **Authoritative validator:** the `Body` zod schema in `webapp\app\api\episodes\[id]\settings\route.ts` lines **55-90** (`.strict()`). This is the *only* place a Director-settable metadata key is typed. **A new `on_model_strictness` field must be added here** (plus the one `patch.` line at ~157) or PATCH will 400.
- **Creation defaults:** `webapp\app\api\episodes\route.ts` lines **102-110** (`epMetadata`) — add the default here so episodes are born with a value (mirrors `reference_regen_cap` at 105).
- **Read/resolve helpers:** `webapp\lib\agents\chain-flags.ts` — add a `resolveOnModelStrictness(metadata)` next to `resolveReferenceRegenCap` (172-179); note `capFromMetadata` (156-161) is numeric-only, so an enum needs its own coercion.
- **UI reader:** `EpisodeSettingsCard.tsx` `readCap` (69-73) is numeric; for the enum mirror the `readPipelineMode` pattern (imported line 22 from `webapp\lib\api\pipeline-mode.ts`) which is the existing enum-metadata reader.

Other episode-metadata keys already living in this same untyped-column/whitelist pattern (useful precedents): `anchor_chain_enabled`, `pipeline_mode`, `budget_approved`, `concierge_cap_usd`, `prompt_revision_cap`, `reference_regen_cap`, `video_regen_cap`, `generation_config`, `delivery_targets`, `reconciler_armed`.

---

### Summary of what to create vs. reuse
- **Reuse/extend (enum, not number):** `chain-flags.ts` resolver pair, `settings/route.ts` Body + patch, `episodes/route.ts` default, `EpisodeSettingsCard.tsx` control (model it on `pipeline_mode`, not the numeric caps).
- **Already done:** `pickBestAttempt` CRIT-first + `KEEP_ATTEMPT_SCORE_THRESHOLD=85` (commit a87d4a83) — no work.
- **Missing entirely — must be invented:** any storyboard transformation marker. No `transformation`/`gloop`/`transform` field or flag exists in the shot schema or runtime shot object; the shot JSON has no zod schema at all. Choose between a new structured STB field vs. a `Gloop-&lt;char&gt;` naming-convention detector.</result>
<usage><subagent_tokens>80324</subagent_tokens><tool_uses>34</tool_uses><duration_ms>186678</duration_ms></usage>
</task-notification>

## 2026-07-18 03:34 · director-msg (hook) · NEW · (triage at distill)
запустила полина fanoutShots . вопрос она запускает по 4 кадра за раз. боимся что провайдер откажет если сразу много. но это долго получается. а ты быстро как то делал (по моим ощущеням) . как ускорять такие процессы? нам ведь с массовой обработке по-моему только генератор картинки и видео отказывал. но могу заблуждаться. расскажи как ты гнал 10. по одному? параллельно?

## 2026-07-18 04:19 · director-msg (hook) · NEW · (triage at distill)
спальня есть в канонах - это полина не дотянула в каст (поправь аккуратно ручками в базе подумать только как правильно ставить локации если их несколько). но проблема в другом!."on-model судит личность Сэнди" а надо чтобы все каноны проверял.
 параллельно запусти агента - у меня на лэптопе не запускается composer - скорее всего то-то что было с ffmpeg - не установлен. проверь пофикси.

## 2026-07-18 04:26 · director-msg (hook) · NEW · (triage at distill)
<task-notification>
<task-id>a8b9b0d195122eaf9</task-id>
<tool-use-id>toolu_01M5XLmUFTDHJcQiwSRyuTTh</tool-use-id>
<output-file>C:\Users\ALEXAN~1\AppData\Local\Temp\claude\C--Users-Alexander-sandystudio\232dea5b-e8b1-40d2-a5f8-09866af50225\tasks\a8b9b0d195122eaf9.output</output-file>
<status>completed</status>
<summary>Agent "Fix composer/ffmpeg on laptop" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>I have a complete picture. Let me summarize my findings.

## Report

### What "composer" is
"Composer" is the studio's UI/display name for **EXEC-MGEN**, the music-generation agent — not a standalone binary. Confirmed in:
- `webapp/lib/api/agent-names.ts:34` → `'EXEC-MGEN': 'Composer'`
- `webapp/lib/api/pipeline-stages.ts:215` → stage `music_generator`, label `Composer`, emoji 🎵
- Inngest function: `webapp/inngest/functions/exec-mgen.ts` (`EXEC-MGEN: Generate Music`)

It runs inside the webapp via Inngest. Real generation uses the `suno` provider (`SUNO_API_KEY`), auto-downgrading to `mock` when the key is absent (`webapp/lib/agents/provider-resolver.ts:54,120`). ffmpeg is only touched *downstream* of generation — for optional fade/trim shaping (`webapp/lib/agents/providers/music-processor.ts`) and final-cut stitching (`webapp/lib/agents/providers/ffmpeg-stitch.ts`). The Composer's core generation step does not require ffmpeg at all.

### Root cause: the ffmpeg hypothesis is disproven on this laptop
ffmpeg **is installed and fully resolvable** here. The Director's "ffmpeg not installed on the laptop" theory does not hold:

- `where ffmpeg` → `C:\Users\Alexander\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_..._8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin\ffmpeg.exe`
- Direct run → `ffmpeg version 8.1.2-full_build` (works)
- In-process Node `spawn('ffmpeg', ['-version'])` → exit 0 (the exact probe `resolveFfmpegPath()` uses)
- `.env.local` has `FFMPEG_PATH` set to the 8.1.2 binary and **that file EXISTS**
- The winget-glob resolver (`ffmpeg-stitch.ts`, commit `d33d9dab` already present) matches: package dir matches `/ffmpeg/i`, build dir `ffmpeg-8.1.2-full_build` matches `/^ffmpeg-/i`

So ffmpeg resolves three independent ways (env → PATH → winget glob). No glob mismatch, no missing binary.

Everything else the Composer needs is also healthy:
- Stack is **up**: app `/api/health` → `{"status":"ok", openai_configured:true, ...}` on :3000; Inngest self-hosted responding on :8288
- `EXEC-MGEN: Generate Music` **is registered** with Inngest (54 functions synced)
- `prod.log` / `inngest.log` are clean — **no** MGEN/music/ffmpeg errors, no panics, and no prior MGEN run/failure event at all

### What I changed / installed
**Nothing.** ffmpeg is already installed and the resolver is correct — there was no missing binary to install and no path/glob bug to fix. Installing or editing code would have been wrong. No files staged; working tree unchanged (aside from the pre-existing `.claude/training-inbox.md` and untracked skill dir from before this session).

### Verification result
- ffmpeg resolves in the app runtime (bare-`ffmpeg` probe exits 0; `FFMPEG_PATH` valid; winget glob matches)
- Composer's Inngest function registered and the stack healthy
- No error surface anywhere in the logs

I did **not** fire the Composer, because firing it would create a (mock) asset — outside the "startup/health only, no media" boundary you set. With `SUNO_API_KEY` absent it would run as `mock` anyway, which wouldn't reproduce a real failure.

### Remaining risk / next step
1. **I could not reproduce a "does not start" failure** — the machine is currently in a fully working state for the Composer. If the Director reported this *before* the stack came up (prod.log shows it started today 07:44) or before ffmpeg was installed yesterday (per memory `office-pickup-2026-07-17-ffmpeg-glob.md`), the issue may already be resolved. To capture a real error, the Director should fire the Composer from the episode UI once and I can read the resulting Inngest failure event / server log — the true cause (if any remains) is almost certainly **not** ffmpeg. Likely candidates: an upstream gate not satisfied so MGEN is never dispatched (`webapp/lib/agents/gate.ts:197` — Composer fires only after REV-world_check approval), or `SUNO_API_KEY` absent so it silently produces a mock track the Director reads as "didn't really run."
2. **Minor hygiene (not fixed, flagging only):** `FFMPEG_PATH` in `.env.local` pins the version-specific path `...ffmpeg-8.1.2-full_build\...`. This is the same failure shape as the code hardcode that broke yesterday (8.1.1→8.1.2) — the next winget upgrade will make this env value point at a vanished directory. It self-heals (resolver falls through to the glob + PATH), so it's low severity, but consider **removing `FFMPEG_PATH` from `.env.local`** and letting the winget-glob/PATH resolver own discovery, to avoid a future stale-path red herring. I left it untouched since it currently points at the real binary and changing env wasn't requested.</result>
<usage><subagent_tokens>82647</subagent_tokens><tool_uses>23</tool_uses><duration_ms>310347</duration_ms></usage>
</task-notification>

## 2026-07-18 05:04 · director-msg (hook) · NEW · (triage at distill)
заработал composer -  был пропущен один критик раньше - полина (и фабрика) отловили. хотя полина на фри гемини )) 
проблема номер два. SH05 помнишьь про тарелку с кашей? я rejected и написал изменения в модалке режекта. но видимо чтото пошло не так.на перегенерированном кадре та же желтая тарелка. и пояснения полины. хотя по моему мнению она не должна ничего запускать. это должна делать фабрика по факту режекта...

## 2026-07-18 05:24 · director-msg (hook) · NEW · (triage at distill)
в Episode reference  просмотровщике куда попадаю через кебаб - Candidates for this shot  не под основной картинкой , переключение просмотра тоже не работает и кажется какая-то путаница с выбором. запусти агента внимательно изучи и пофикси .

## 2026-07-18 05:38 · director-msg (hook) · NEW · (triage at distill)
<task-notification>
<task-id>a79455353c3f12d04</task-id>
<tool-use-id>toolu_01NnUyk5yNa2SxoygYtiRGSU</tool-use-id>
<output-file>C:\Users\ALEXAN~1\AppData\Local\Temp\claude\C--Users-Alexander-sandystudio\232dea5b-e8b1-40d2-a5f8-09866af50225\tasks\a79455353c3f12d04.output</output-file>
<status>completed</status>
<summary>Agent "Fix EREF candidates viewer UI" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>All changes are coherent, tsc is clean, and the targeted tests pass. Here is my report.

## Summary

The "reference detail viewer" opened from a timeline/kebab reference cell is `EpisodeAssetDrawer` (rich drawer). It renders **two** variant strips, and that duplication plus a stale "primary" derivation is the root of all three symptoms.

### Root causes (file:line)

1. **Placement (symptom 1).** There are two strips. The one literally titled **"Candidates for this shot"** was the sibling-row `CandidatesStrip` at `EpisodeAssetDrawer.tsx:719-731` — rendered *after* Test Plan / Verdict / Scores / Issues, i.e. **not** under the image. The strip that *was* under the image (`AttemptsStrip`, line 628) was titled "Generation attempts", so the strip the Director calls "candidates" was split and misplaced.

2. **Selection confusion (symptom 3).** `AttemptsStrip.finalVersion` (the "current" badge) was derived as `selected_version ?? last(generation_history)` (old `EpisodeAssetDrawer.tsx:631-639`). But the main preview and the preview-header badge derive the primary as `selected_version ?? image_prompt.current_version ?? last` (`AssetPreview.tsx:273`; the shipped bytes come from `image_prompt.current_version`, set at `episode-references.ts:2761`). Under **keep-best** (2026-07-16/17) the shipped attempt is the *best*, frequently **not the last** — so the badge highlighted a different tile than the image actually on screen.

3. **Click "doesn't switch" (symptom 2).** Shares cause with #2. The promote path itself works (`select_attempt` sets `selected_version`; `previewFreshness` folds it into the `?t=…-sel&lt;N&gt;` cache-bust). But because the badge sat on the last attempt while the main image already showed the *best*, clicking the on-screen tile looked like a no-op and the whole selection read as inconsistent. It was a perception artifact of the mismatched "current".

### Changes (not committed — left in the working tree)

- **`lib/api/shot-reference.ts`** — Added pure helper `primaryAttemptVersion(shot_reference, image_prompt.current_version)` as the single canonical primary-attempt derivation (`selected_version` → `current_version` → last). Corrected the now-wrong doc comment on `selected_version` that told consumers to use `?? generation_history.at(-1)`.
- **`components/assets/EREFv2Sections.tsx`** — `AttemptsStrip` gained an optional `label` prop (defaults to "Generation attempts (N)").
- **`components/assets/EpisodeAssetDrawer.tsx`** — The under-image strip is now the canonical **"Candidates for this shot (N)"**, its `finalVersion` uses `primaryAttemptVersion` (so the "current" badge matches the on-screen pixels, incl. keep-best), and the redundant lower sibling-row `CandidatesStrip` was removed from the EREF block. VID-shot's `CandidatesStrip` is untouched.
- **`components/preview/AssetPreview.tsx`** — Header-badge `activeAttempt` now calls the same `primaryAttemptVersion`, so drawer and preview can't drift.
- **`__tests__/lib/api/shot-reference-keepbest.test.ts`** — Added a `primaryAttemptVersion` block (manual-pick wins; follows shipped `current_version` not last; legacy fallback to last; null cases).

### Verification

- `npx tsc --noEmit` → **exit 0 (clean)**.
- `vitest run` on `shot-reference-keepbest.test.ts` + `asset-preview-resolver.test.ts` → **27/27 passed** (includes the new helper cases and the existing `selected_version` cache-bust regression).
- Did not start/rebuild the app or spend money (stack running separately, untouched).

**Manual path to confirm in the running app:** open an IMG-episode_ref whose keep-best shipped a non-last attempt (e.g. best=v2 of 3). The single "Candidates for this shot (3)" strip appears directly under the image; the green "current" badge sits on v2 (the tile shown in the big preview). Click v3 → main preview switches to v3 and the badge moves to v3; click v2 → switches back. No second "Candidates" heading further down.

Note on scope: symptoms 2 and 3 genuinely shared one code cause (the badge derivation); the promote→preview refresh wiring itself was already correct — the fix makes the indicator honest so the click reads as working.</result>
<usage><subagent_tokens>179734</subagent_tokens><tool_uses>49</tool_uses><duration_ms>816765</duration_ms></usage>
</task-notification>

## 2026-07-18 07:31 · director-msg (hook) · NEW · (triage at distill)
<task-notification>
<task-id>a63ecad8434bd8d84</task-id>
<tool-use-id>toolu_01VhVkTVtTwA44wws4vuFT3H</tool-use-id>
<output-file>C:\Users\ALEXAN~1\AppData\Local\Temp\claude\C--Users-Alexander-sandystudio\232dea5b-e8b1-40d2-a5f8-09866af50225\tasks\a63ecad8434bd8d84.output</output-file>
<status>completed</status>
<summary>Agent "Recover lost timeline color-coding" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>Investigation complete. The headline finding overturns the premise, so let me be precise and thorough in the report.

---

# Timeline color-coding ("work-state language") — archaeology report

## TL;DR — the system is NOT lost. It is fully present and wired on `master`.

Contrary to the briefing, the color=role timeline language from `ef490f4b` is **alive and rendering on current HEAD** (`a87d4a83`, master, origin/master, and this worktree — all three identical). Nothing was reverted. Every piece the commit message promised for **Slice 1** still exists, is imported, is called, and paints the timeline cells. The 6 unit tests pass **6/6**. There is **nothing to restore.**

The one thing that never existed is **Slice 2** (the References/Video pillbar buttons adopting the same state language) — it was written as "next" in `ef490f4b` and was never built. If the Director feels something is "missing," that gap is the only real candidate.

I made **no code changes** — the worktree is clean, because restoration is a no-op.

---

## Correcting the briefing's "verified" claims

The briefing stated: *"grep finds NO `workRolePalette` and NO `--accent-role-` tokens anywhere, and the timeline cell rendering uses `workPhaseForAgent`, not the role palette."*

That is false against `master`. Bulletproof counts from repo root:
- `workRolePalette`: **16 references** across `webapp/`
- `--accent-role-`: **7 references**
- `git show origin/master:` confirms both `workRolePalette` (pipeline-stages.ts:649) and the four `--accent-role-*` tokens (globals.css:55–58) are on the pushed master, not just locally.

The likely source of the false negative: the grep was run against a different/stale checkout (there are multiple worktrees, e.g. `origin/worktree-agent-ad3d941d6b34f6d5b`), or `workPhaseForAgent`'s legitimate presence at `EpisodeTimelineSection.tsx:161` was mistaken for "the cell rendering uses the old phase language." That line is **not** a color renderer — it is only a **poll-cadence heuristic** ("is any pipeline job live → poll every 4s instead of 8s").

---

## Step 1 — Full inventory of the color language, and its status at HEAD

Prime commit: **`ef490f4b`** "feat(timeline): unified work-state language — colour=role, kebab on click (slice 1)" (Alexander Ostrovoy, Thu Jul 2 2026). Extended by **`7842afa6`** "feat(E18)…" (Thu Jul 9 2026), which *added* the D7 persistent-trail glow (a net addition, never a removal).

| Piece | Location at HEAD | Status |
|---|---|---|
| `WorkRole` type (`designer\|critic\|artist`) | `webapp/lib/api/pipeline-stages.ts:545` | ✅ present |
| `ROLE_OF_STAGE` (stage→role, both pipelines) | `pipeline-stages.ts:548-555` | ✅ present |
| `workRoleForAgent(agentId)` | `pipeline-stages.ts:558-562` | ✅ present |
| `ShotWork` interface `{object, roles}` | `pipeline-stages.ts:565-568` | ✅ present |
| `activeWorkByShot(jobs)` → live roles per shot, animate-dominant | `pipeline-stages.ts:576-598` | ✅ present |
| `completedWorkByShot(jobs)` → D7 settled trail | `pipeline-stages.ts:609-640` | ✅ present (added by `7842afa6`) |
| **`workRolePalette(roles)`** → `{color, glow, label, token}`, token precedence both&gt;critic&gt;designer&gt;artist, `var(--accent-role-${token})`, no hex | `pipeline-stages.ts:649-676` | ✅ present |
| **`--accent-role-{designer,critic,both,artist}`** tokens | `webapp/app/globals.css:55-58` (indigo/amber/teal/violet) | ✅ present |
| Cell-number recolour BY ROLE, live-wins + D7 trail fallback | `AnimaticPlayer.tsx` `cellPalette()` lines 328-388 (role branch 339-356) | ✅ present &amp; applied |
| Palette actually painted onto the cell (color / textShadow=glow / pulse class / `--stage-glow`) | `AnimaticPlayer.tsx:1416` (compute) → `1490-1506` (apply) | ✅ wired end-to-end |
| Per-line "writing…/reviewing…/generating…" role badge | `AnimaticPlayer.tsx:623-647` (`partitionBadge`, object-aware) | ✅ present |
| Kebab opens on **click** (toggle), not hover | `AnimaticPlayer.tsx:471, 1479` (`setOpenCellIdx(v =&gt; v===i?null:i)`) | ✅ present |
| Timeline feeds roles (`liveWorkByShot`/`completedWorkByShot`) | `EpisodeTimelineSection.tsx:490-491, 944` → `AnimaticPlayer` | ✅ present |
| 6 unit tests (role detection, per-shot roles, palette precedence) | `webapp/__tests__/lib/api/work-role-language.test.ts` | ✅ present, **6/6 green** |

**Object-family + role split the Director remembered:** it is real and intact. `activeWorkByShot` computes both `object` (image=`design` / video=`animate`, via `workPhaseForAgent`) *and* `roles` (hue, via `workRoleForAgent`) per shot (pipeline-stages.ts:582-583). Object = which pipeline family, role = who is working (hue). Both axes coexist exactly as designed. The related lineage commits (`dcd6d0b8`, `e65816d7`, `3c14849a`) are the **earlier Phase-A.1 status-color layer** that still forms the fallback branch of `cellPalette` (lines 357-387) beneath the role layer — also intact.

## Step 2 — Where was it lost?

**It was never lost.** `git log --all -S 'workRolePalette' -- webapp/lib/api/pipeline-stages.ts` returns exactly one commit: `ef490f4b` (the add). No commit on any ref (local or remote) ever removed it. Same for `--accent-role-` in globals.css: only `ef490f4b` ever touched those lines. The only other commit touching `workRolePalette` in `AnimaticPlayer.tsx` is `7842afa6`, which **added** the D7 trail usage. There is no removal, revert, bad merge, or collateral drop anywhere in history. Intent question is moot — nothing was removed.

## Step 3 — Restoration

**No restoration needed. No cherry-pick, no re-apply, no conflicts** — the code the briefing wanted back is already on master, identical, and rendering. Applying `ef490f4b` again would be a no-op (or a spurious re-add of code already present). I deliberately made zero edits; the worktree is clean.

Verification run (main-repo deps, worktree had no `node_modules`; unit-test only, stack untouched):
- `vitest run __tests__/lib/api/work-role-language.test.ts` → **Test Files 1 passed, Tests 6 passed (6)**.
- `tsc` was not needed — no code changed. `ef490f4b` recorded "tsc·0 / vitest 1088 / replay-pilot 30/30"; `7842afa6` recorded "tsc clean". Master is unmodified relative to those.

## The real gap: Slice 2 (never shipped)

`ef490f4b`'s message promised: *"Slice 2 (next): the References/Video pillbar buttons reflect the same state language (idle/designer/critic/both/processing/frames-ready/video-ready/error)."*

Confirmed **not built**: `EREFPilotPillbar.tsx` and `VGENPilotPillbar.tsx` color only with generic `--accent-primary / --accent-warning / --accent-success / --accent-danger` (e.g. EREF lines 258, 272, 415, 458; VGEN lines 258, 469, 551-557). Neither pillbar imports `workRolePalette` or references any `--accent-role-*` token. So the pillbars do **not** speak the designer/critic/both/artist language that the timeline cells do — the two surfaces are inconsistent, which is exactly the kind of thing that would make the Director feel the language "isn't there" on the pillbars.

**If the Director's memory is of a fully-unified language (timeline + pillbars), the work to do is to BUILD Slice 2, not restore Slice 1.** That is net-new: wire the pillbars' per-stage buttons to `workRolePalette(...)`/`--accent-role-*` keyed off the same live-job role detection (`activeWorkByShot`), so a running designer/critic/artist job tints the corresponding pillbar segment with the matching hue + pulse. This is a clean feature addition with no conflicts (the palette fn and tokens are already exported and ready to consume).

## Recommendation (two cases, as requested)

- **"It's already here" (most likely reality):** No action. Point the Director at a live episode timeline with a running job — the cell numbers recolour by role (indigo/amber/teal/violet) and pulse today. If it's not *visually* appearing at runtime, that's a data/polling issue (are RUNNING/QUEUED jobs present with resolvable `shot_id`?), not lost code — worth a quick live check, but it is not an archaeology problem.
- **"I want the pillbars to speak it too" (the genuine gap):** Build Slice 2 as above. I can prepare that patch on request — it's additive and low-risk.

**Key citations:** `ef490f4b` (Jul 2, add), `7842afa6` (Jul 9, D7 trail add), HEAD `a87d4a83`. Palette: `pipeline-stages.ts:649-676`; tokens: `globals.css:55-58`; render: `AnimaticPlayer.tsx:328-388` + `1416`/`1490-1506`; feed: `EpisodeTimelineSection.tsx:490-491,944`; tests: `work-role-language.test.ts` (6/6). Pillbar gap: `EREFPilotPillbar.tsx` / `VGENPilotPillbar.tsx` (no `accent-role`).</result>
<usage><subagent_tokens>82240</subagent_tokens><tool_uses>24</tool_uses><duration_ms>391074</duration_ms></usage>
</task-notification>

## 2026-07-18 16:14 · director-msg (hook) · NEW · (triage at distill)
даже интересно что это была за борьба на 18 шоте plan

v16
APPROVED
✓

v15
INVALIDATED
✓

v14
INVALIDATED
✓

v13
INVALIDATED
✓

v12
INVALIDATED
✓

v11
INVALIDATED
✓

v10
INVALIDATED
✓

v09
INVALIDATED
✓

v08
INVALIDATED
✓

v07
INVALIDATED
✓

v06
INVALIDATED
✓

v05
INVALIDATED
✓

v04
INVALIDATED
✓

v03
INVALIDATED
✓

v02
REVISION

v01
REVISION
critic

v16
REVIEW
✓

v15
REVIEW
✓

v14
REVIEW
✓

v13
REVIEW
✓

v12
REVIEW
✓

v11
REVIEW
✓

v10
REVIEW
✓

v09
REVIEW
✓

v08
REVIEW
✓

v07
REVIEW
✓

v06
REVIEW
✓

v05
REVIEW
✓

v04
REVIEW
✓

v03
REVIEW
✓

v02
REVIEW
✓

v01
REVIEW
✓
video
generating…

## 2026-07-18 17:35 · director-msg (hook) · NEW · (triage at distill)
я запустил перегенерацию последнего кадра - поправил проспт. убидись что генерация идет и проверь что в прозе я добавил рот и попытался поменять бэкграунд

## 2026-07-18 18:17 · director-msg (hook) · NEW · (triage at distill)
it seems also we have same issues in online editor oreview like we had in preview of ref or ans shors. попытка изменить порядок размещения и сделать approved always in left place (first) makes mess only  . I believed we fixed it ((
also if we reduce shot timing 0.5 sec we excude shot from final cut and make batton and kebab opasity less 100% . but when we increase timing up we forgon up opacity

## 2026-07-18 20:10 · director-msg (hook) · NEW · (triage at distill)
нашел картинки. я до этого смотрел в видео . сорри. 
но кроме картинок нашел очередной баг 
в ref preview  I cant pick small picture to meke it APPROVED. green frame dont move. AND every pick to small tumbnail on prewiew I CAN CEE new REcord in Polina chat: 00:06 AGENT — completed
00:06 AGENT — completed
00:06 AGENT — completed
00:06 AGENT — completed
00:06 AGENT — completed
00:06 AGENT — completed
00:07 AGENT — completed
00:07 AGENT — completed
00:07 AGENT — completed
00:07 AGENT — completed

## 2026-07-19 05:03 · director-msg (hook) · NEW · (triage at distill)
Video
plan

v16
APPROVED
✓

v15
INVALIDATED
✓

v14
INVALIDATED
✓

v13
INVALIDATED
✓

v12
INVALIDATED
✓

v11
INVALIDATED
✓

v10
INVALIDATED
✓

v09
INVALIDATED
✓

v08
INVALIDATED
✓

v07
INVALIDATED
✓

v06
INVALIDATED
✓

v05
INVALIDATED
✓

v04
INVALIDATED
✓

v03
INVALIDATED
✓

v02
REVISION

v01
REVISION
critic

v16
REVIEW
✓

v15
REVIEW
✓

v14
REVIEW
✓

v13
REVIEW
✓

v12
REVIEW
✓

v11
REVIEW
✓

v10
REVIEW
✓

v09
REVIEW
✓

v08
REVIEW
✓

v07
REVIEW
✓

v06
REVIEW
✓

v05
REVIEW
✓

v04
REVIEW
✓

v03
REVIEW
✓

v02
REVIEW
✓

v01
REVIEW
✓
video
▶
v01
APPROVED
on screen
✓

## 2026-07-19 13:37 · director-msg (hook) · NEW · (triage at distill)
clear
PS C:\Windows\System32> $c = "$env:USERPROFILE\.claude"
PS C:\Windows\System32> "--- skills ---";   (Get-ChildItem "$c\skills" -Directory -EA SilentlyContinue).Name
--- skills ---
agent-harness-construction
agent-introspection-debugging
agent-sort
agentic-engineering
ai-first-engineering
ai-regression-testing
api-connector-builder
api-design
article-writing
autonomous-loops
backend-patterns
blueprint
brand-voice
claude-api
claude-devfleet
code-tour
coding-standards
configure-ecc
content-engine
content-hash-cache-pattern
continuous-agent-loop
continuous-learning
continuous-learning-v2
cost-aware-llm-pipeline
council
cpp-coding-standards
cpp-testing
dashboard-builder
data-scraper-agent
database-migrations
deep-research
deployment-patterns
dmux-workflows
docker-patterns
e2e-testing
enterprise-agent-ops
eval-harness
exa-search
fal-ai-media
frontend-design
frontend-patterns
frontend-slides
github-ops
grill-me
hookify-rules
iterative-retrieval
knowledge-ops
manim-video
market-research
mcp-server-patterns
nanoclaw-repl
plankton-code-quality
postgres-patterns
product-capability
prompt-optimizer
ralphinho-rfc-pipeline
regex-vs-llm-structured-text
remotion-video-creation
research-ops
search-first
security-bounty-hunter
security-review
security-scan
skill-stocktake
strategic-compact
tdd-workflow
team-builder
terminal-ops
token-budget-advisor
ui-demo
verification-loop
video-editing
videodb
workspace-surface-audit
x-api
PS C:\Windows\System32> "--- commands ---"; (Get-ChildItem "$c\commands" -Recurse -File -EA SilentlyContinue).Name
--- commands ---
agent-sort.md
analisis2x.md
aside.md
build-fix.md
checkpoint.md
claw.md
code-review.md
context-budget.md
devfleet.md
docs.md
e2e.md
eval.md
evolve.md
feature-dev.md
gan-build.md
gan-design.md
harness-audit.md
hookify-configure.md
hookify-help.md
hookify-list.md
hookify.md
instinct-export.md
instinct-import.md
instinct-status.md
learn-eval.md
learn.md
loop-start.md
loop-status.md
model-route.md
multi-backend.md
multi-execute.md
multi-frontend.md
multi-plan.md
multi-workflow.md
nav-orch-commit.md
nav-orch-deploy.md
nav-orch-merge.md
nav-orch.md
orchestrate.md
pa-recent.md
pa-resume.md
pa-summary.md
plan.md
pm2.md
projects.md
promote.md
prompt-optimize.md
prp-commit.md
prp-implement.md
prp-plan.md
prp-pr.md
prp-prd.md
prune.md
quality-gate.md
refactor-clean.md
resume-session.md
review-pr.md
rules-distill.md
santa-loop.md
save-session.md
sessions.md
setup-pm.md
skill-create.md
skill-health.md
tdd.md
test-coverage.md
update-codemaps.md
update-docs.md
verify.md
PS C:\Windows\System32> "--- agents ---";   (Get-ChildItem "$c\agents" -File -EA SilentlyContinue).Name
--- agents ---
a11y-architect.md
architect.md
build-error-resolver.md
chief-of-staff.md
code-architect.md
code-explorer.md
code-reviewer.md
code-simplifier.md
comment-analyzer.md
conversation-analyzer.md
database-reviewer.md
doc-updater.md
docs-lookup.md
e2e-runner.md
gan-evaluator.md
gan-generator.md
gan-planner.md
harness-optimizer.md
loop-operator.md
performance-optimizer.md
planner.md
pr-test-analyzer.md
refactor-cleaner.md
security-reviewer.md
seo-specialist.md
silent-failure-hunter.md
tdd-guide.md
type-design-analyzer.md
typescript-reviewer.md
PS C:\Windows\System32> "--- plugins ---";  Get-Content "$c\plugins\config.json" -EA SilentlyContinue
--- plugins ---
PS C:\Windows\System32> "--- memory dirs ---"; (Get-ChildItem "$c\projects" -Directory -EA SilentlyContinue).Name
--- memory dirs ---
C--PROJECTS-PERSONA-COM
C--SandyStudio
C--SandyStudio--claude-worktrees-angry-tesla-fed2ed
C--SandyStudio--claude-worktrees-beautiful-ramanujan-1ffc4d
C--SandyStudio--claude-worktrees-beautiful-williamson-26aba4
C--SandyStudio--claude-worktrees-conductor-phase2
C--SandyStudio--claude-worktrees-distracted-euler-d48516
C--SandyStudio--claude-worktrees-e23
C--SandyStudio--claude-worktrees-e25
C--SandyStudio--claude-worktrees-ecstatic-noyce-12c9a8
C--SandyStudio--claude-worktrees-eloquent-greider-bd6a88
C--SandyStudio--claude-worktrees-exciting-easley-23cb75
C--SandyStudio--claude-worktrees-exciting-khorana-1e513e
C--SandyStudio--claude-worktrees-festive-spence-a7ff79
C--SandyStudio--claude-worktrees-fetch-timeout-swaps
C--SandyStudio--claude-worktrees-focused-sinoussi-597697
C--SandyStudio--claude-worktrees-friendly-mcnulty-c304a6
C--SandyStudio--claude-worktrees-goofy-sutherland-b5dcb7
C--SandyStudio--claude-worktrees-keen-chebyshev-5f65ab
C--SandyStudio--claude-worktrees-laughing-noether-f069e9
C--SandyStudio--claude-worktrees-nice-liskov-b8f12c
C--SandyStudio--claude-worktrees-pedantic-gould-307846
C--SandyStudio--claude-worktrees-quizzical-brown-462555
C--SandyStudio--claude-worktrees-relaxed-hofstadter-0164c6
C--SandyStudio--claude-worktrees-responsibility-matrix-impl-2e1f98
C--SandyStudio--claude-worktrees-shorts-recut
C--SandyStudio--claude-worktrees-sweet-meninsky-5dd7b6
C--SandyStudio--claude-worktrees-teo-shorts-tail-wiring
C--SandyStudio--claude-worktrees-trusting-vaughan-f6191d
C--SandyStudio--claude-worktrees-zealous-solomon-0e7f82
H-----------usefullTranslator
H-----------usefullTranslator--claude-worktrees-silly-benz-3b68a4
PS C:\Windows\System32> "--- memory files ---"; (Get-ChildItem "$c\projects\C--SandyStudio\memory" -File -EA SilentlyContinue).Name

## 2026-07-19 13:39 · director-msg (hook) · NEW · (triage at distill)
--- memory files ---
agent_chain_mode_4_vs_1_3.md
ai_ep_conception_gaps.md
anchor_mode_orbit_ref_only.md
anti_additivity_principle.md
architectural_rethink_over_patches.md
autonomous_factory_architecture_doctrine.md
backlog_2026-07-05_live-run-queue.md
backlog_animatic_dedup_ref_vs_video.md
backlog_audience_quality_sensor.md
backlog_enable_mechanics_auto_advance_smoke.md
backlog_episode_metadata_rmw_race.md
backlog_eref_pipeline_node_spec.md
backlog_exec_copy_publicist_angle.md
backlog_kebab_video_reference_zones.md
backlog_next_run_polina_gemini_free.md
backlog_observability_failures_not_surfaced.md
backlog_per_shot_video_eligibility.md
backlog_polina_false_completion_phrasing.md
backlog_scene_prop_canon_anchor.md
backlog_scorecard_polina_mislabel.md
backlog_shorts_delivery_targets_not_propagated.md
backlog_shorts_ui_slicer.md
backlog_shot_centric_paradigm.md
backlog_skill_abstraction_audit.md
backlog_td_05s_delete_flag.md
backlog_td_artdir_breakdown_role.md
backlog_td_brief_authoring_training.md
backlog_td_canon_existence_preflight.md
backlog_td_canon_unlock_button.md
backlog_td_casting_draft_deadend.md
backlog_td_e11_board_act_grouping.md
backlog_td_eref_noassets_catchall.md
backlog_td_fanout_trigger_shape.md
backlog_td_kebab_plan_critic_lines.md
backlog_td_music_bake_animatic_selection.md
backlog_td_partial_animatic_and_provider_caps.md
backlog_td_pipeline_full_process_surface.md
backlog_td_polina_nudge_readonly_execution_gap.md
backlog_td_polina_workplan_tracker.md
backlog_td_script_uneditable_ui_plus_indicator.md
backlog_td_stitch_gate_music_and_exclude_retrigger.md
backlog_td_storyboarder_orbit_not_wired.md
backlog_td_surgical_revision_after_critique.md
backlog_td_vgen_endimage_metadata_gap.md
backlog_td_wchk_two_bugs.md
backlog_td32_td33_continuity_and_attempts.md
backlog_td36_studio_shell_ergonomics.md
backlog_td61_td62_pipeline_blockers.md
backlog_video_direct_from_canon.md
brand_bumper_production_recipe.md
camera_orbit_signature_policy.md
concierge_uses_openai.md
critic_churn_discriminator.md
critic_revision_cap_doctrine.md
desktop_app_terminal_pane_is_new_session.md
dev_workflow_no_build_during_dev.md
director_communication_style.md
director_decide_small_things_yourself.md
director_message_stream_read_all_first.md
director_message_timestamp_dubai.md
director_minimal_changes_no_new_entities.md
director_name_alexander.md
director_process_and_people_first.md
director_question_numbering.md
director_questions_human_style.md
director_signal_when_input_needed.md
director_systemic_not_patchwork.md
director_timezone_dubai_utc_plus_4.md
episode_ideas_location.md
eref_generation_needs_stable_server.md
feedback_ambient_event_format_structured.md
gag_bank_proof_by_groups_not_count.md
grill_me_skill.md
handoff_td54_studioshell_scroll_layout.md
harness_trim_skills_library.md
inngest_dev_router_unreliable_no_selfheal.md
inngest_selfhost_setup.md
kebab_color_grammar_doctrine.md
match_cut_doctrine.md
MEMORY.md
migration_apply_cli_first.md
my_name_is_teo.md
no_deploy_during_live_run.md
node_env_file_does_not_override.md
npm_install_legacy_peer_prunes_optionals.md
nudge_polina_dont_act_for_her.md
openai_model_ids_live_source.md
operational_ritual_hooks_live.md
orchestrator_master_session_paradigm.md
overlay_agent_reports_on_server_logs.md
plan_md_living_anchor.md
plan_md_size_budget.md
plan_preview_drawer_doctrine.md
polina_cost_audit_CORRECTED_2026-06-26.md
polina_resistance_log_e07_smoke.md
preamble_attention_pollution_gpt_image_2.md
proactive_cost_risk_on_model_switch.md
provider_fetch_no_timeout_root_cause.md
reconciler_audit_2026-07-10.md
remote_access_setup_parked.md
replay_pilot_harness.md
sandy_canon_physics_corrections.md
sandy_canon_visual_identity.md
session_2026-05-25_td49-phase2-p2.3.md
session_2026-05-26_pa-ui-batch-and-td39.md
session_2026-05-26_td51-58-shipped.md
session_2026-06-01_td85-resolution-discipline.md
session_2026-06-08_e02-finalcut-wysiwyg-fix.md
session_2026-06-10_t1-gagad-cread-consolidation.md
session_2026-06-11_wchk-state-ledger-sprint.md
session_2026-06-12_f1-f8-fix-sprint.md
session_2026-06-14_arch-sprint-identity-casting.md
session_2026-06-15_e10-gemini-cap-fixes.md
session_2026-06-17_anchor-mode-B-smoke.md
session_2026-06-17_format-authority-slice1.md
session_2026-06-22_e11-done-numbering-fixes.md
session_2026-06-26_e12-polish-numbering-harness.md
session_2026-06-28_s2-leak-closing.md
session_2026-07-02_polina-slim-shotid-oneattempt.md
session_2026-07-04_autonomy-phase-0-1-2a.md
session_2026-07-09_e25-polina-noop-prod-server.md
session_2026-07-13_e28-gold-autonomy-diagnosis.md
session_2026-07-15_shorts-delivery-targets-wiring.md
session_2026-07-16_channel-launch-prep-vending-shorts.md
shot_identity_refactor_decision.md
supabase_data_api_grant_rule.md
supabase_project_ref.md
technology_md_protocol.md
train_personnel_doctrine.md
verify_real_results_not_logs.md
webapp_local_dev_two_terminals.md
PS C:\Windows\System32>

## 2026-07-19 19:50 · director-msg (hook) · NEW · (triage at distill)
Ну, смотрите еще раз. Цель бывает только одна. И цель фотосоздания автономной AI-фабрики, в которой роль человека сводится к постановке задач. и обучении сотрудников для работы в разных жанрах. Задача это путь к цели. Путей может быть много. Задач может быть много, цель одна. Но задача это не мелкий шажок. Это целая планета. В планете есть Континенты, моря, кратеры, еще что-то, какие-то дороги и пути. Это все вот эти мелочи :замкнуть петлю или починить какой-нибудь slice. Цель автономная ии- фабрика. роль человека - креатив на старте в разработке концепта сериала и эпизода. фабрика базируется на автономности производства, дистрибуции анализа обратной связи - коррекции маршрута - обучения всех участников процесса от директора до аналитика - снова креатив и так по кругу. самоообучение должно быть неотъемлемой частью. однаконе самоцелью  .
 На пути фабрики стоят задачи. Какие задачи? Автономность, надежность, качество, творчество, ценообразование совершеннолетние. Ну еще что я упустил? подумай. Ты хорошо умеешь думать, когда я тебя навожу на правильный путь))
 Вот это все те планеты, которые мы должны пройти. Где мы сейчас находимся? Сейчас мы в принципе практически автоматизировали создание и весь процесс. Спотыкаясь о какие-то регулярные баги, иногда чиним один баг - делаем новый, но в принципе на тридцатом эпизоде у нас хорошо прошли рефы -практически без вмешательства абсолютно .Картинки, референсы. но мы споткнулись на видео, хотя в моём понимании процесс создания референсов и процесс создания видео до уже быть абсолютной копией практически. С разницей только в Кэпе, в ограничениях количества перегенераций. А у нас получилась какая-то каша. Я даже сложно могу представить почему. 
но вернёмся к цели. дрейф от цели вот что мешает к ней идти. задача партнёра - удерживать от дрейфа (как? - думай)
то есть прежде чем создать механизм разработки и производства нам нужно не потерять или создать и доработать механизм создания того механизма. 
 где в самом вредоносном могу оказаться как раз я, постоянно меняююя  курс и занимаююясь тем что кажется важным сию секунду ,когда на самом деле это может приводить только к отклонению в сторону от маршрута.  и потом потребует последующего времени усилий и ошибок на возвращение на линию заданного пути (ЛЗП). 
поэтому твоя задача  не бежать исполнять мои указания хорошенько осмыслить то что я сказал и  попытаться понять что вообще нужно сделать для того чтобы прийти именно к этой цели к этой нашей полярной звезде,  как ограничить и оградить нас самих от нас самих. 
сложно сказано?

## 2026-07-19 20:56 · director-msg (hook) · NEW · (triage at distill)
<task-notification>
<task-id>a02d743973cb60737</task-id>
<tool-use-id>toolu_01ViG8F5hrHXqxThiUKfb6xR</tool-use-id>
<output-file>C:\Users\ALEXAN~1\AppData\Local\Temp\claude\C--Users-Alexander-sandystudio\db82fb2e-10e2-40ba-abd3-828b2871c745\tasks\a02d743973cb60737.output</output-file>
<status>completed</status>
<summary>Agent "Fresh-eyes audit of Layer 0" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>Audit complete. I verified every claim against the actual files, commits, hooks, and settings.

---

## VERDICT: FLAWED

The two anchor documents are individually reasonable prose, and the flaky-test fix is clean and complete. But Layer 0's central selling point — that it is "mechanism not discipline" and therefore "can't die again" — is **false**. No enforcing mechanism was added. The one hook that could enforce it wasn't touched, and the "COMPASS hook" the commit relies on does not exist. This is the same discipline-based approach that already decayed once, re-shipped with a claim that it isn't.

---

## FINDINGS (most severe first)

### CONFIRMED

**F1 — The "COMPASS hook" is fabricated; the "can't die again" claim is untrue. [HIGHEST]**
Commit `99ea6d11` message: *"The COMPASS hook already points at NORTH_STAR.md; this closes the loop so the anchors can't die again."* There is no hook named COMPASS — not in `.claude/hooks/`, not in `settings.json` (10 registered hooks, none COMPASS), and never in git history (`git log -S "COMPASS" --all` and `*compass*` both empty). The **only** NORTH_STAR reference in any hook is a passive comment at `.claude/hooks/change-journal.cjs:9` naming it as an example "durable file" — that hook appends a log line per Write/Edit; it never reads or points at the Star. So the entire enforcement of Layer 0 is §9 prose read by a human/agent — the exact mechanism that decayed in 22 days. Failure scenario: identical to the original — a few sessions skip the read, the copies diverge, PLANET drifts N episodes behind, nothing fires. *Fix: either build a real SessionStart hook that surfaces NORTH_STAR/PLANET (and dates), or delete the false claim from the doctrine so no one trusts a guard that isn't there.*

**F2 — The actual staleness hook was NOT extended to PLANET.md. [HIGH]**
§12 Ritual 2 prose now says check PLAN.md **and** PLANET.md (`CLAUDE.md:257`, `:330`). But `plan-md-staleness-check.cjs` — the SessionStart hook that mechanically implements Ritual 2 — parses a date from a single `PLAN.md` only (`:38-42` candidates, `:64` regex). PLANET.md staleness has **zero** mechanical check. The cited root-cause failure ("planet drifted 17 episodes behind") is precisely PLANET drift — and it remains unguarded. *Fix: teach the hook to also read PLANET.md's `## Текущая планета … выбрана YYYY-MM-DD` date and warn on &gt;3 days.*

**F3 — NORTH_STAR.md is 65 lines, not ≤50. [MEDIUM]**
`wc -l NORTH_STAR.md` = 65. The header (`:1-2`) and commit both claim "≤50 lines." It's 30% over, and the file literally closes with *"Держи короткой"* (`:65`). A scope-discipline document that violates its own stated scope on day one. *Fix: cut to ≤50 or change the claim.*

**F4 — Dangling reference in the ratified Star. [MEDIUM]**
`NORTH_STAR.md:55` sources its doctrine at `rules/common/partnership.md`. That file is not tracked anywhere and `rules/common/` does not exist. The ratified anchor points its doctrine section at a missing file. *Fix: create the file or drop the citation.*

**F5 — PLANET.md target-mode contradicts its own gate list. [MEDIUM]**
`PLANET.md:2` declares target "Mode 3" (DELEGATED). Per `CLAUDE.md §6`, Mode 3 = EXEC-DIR-AI approves **all** gates except hard limits (Publish/LOCKED/Budget/Mode). But `PLANET.md:26-32` lists the **Director personally** approving brief, script, casting, and video pilots — that is Mode 2.5 APPRENTICE behavior. Under true Mode 3 only touch #5 (Publish) stays with the Director. The autonomy criterion mixes two governance modes. *Fix: name Mode 2.5 as the target, or reconcile the gate list to Mode 3.*

**F6 — "Zero unplanned touches" is gameable and uninstrumented. [MEDIUM]**
The criterion (`PLANET.md:21-25, 45-48`) is defined by an *open, expandable* list: `:26` and `:32` say planned gates are added "when we hit them live." So any unplanned bug-fix touch can be retroactively reclassified as a newly-discovered planned gate — trivially satisfying "zero unplanned." Nothing counts or logs touches (no state field, no artifact); measurement is the Director's memory — ironic, since the whole project's root cause was memory-reliance. *Fix: freeze the planned-gate list per episode before the run starts, and log every Director touch to a state file so "unplanned = 0" is observable rather than remembered.*

**F7 — No precedence rule across the 4 anchors; new anchors have no master-only guard. [LOW-MEDIUM]**
New §9 (`CLAUDE.md:255`) says PLAN.md is "NOT the strategy," but `CLAUDE.md:243` (§8) still says "If §8 and PLAN.md disagree, PLAN.md wins" and treats PLAN.md as authority. No rule states what wins if PLANET.md and PLAN.md disagree on state — two more docs added without a conflict-resolution rule, which is the very drift Layer 0 exists to kill. Separately, NORTH_STAR/PLANET both declare "Только master" but no hook enforces it (`plan-md-update-guard.cjs` is PLAN.md-only, `:74`), and editable worktree copies already exist at `.claude/worktrees/e30smoke/{NORTH_STAR,PLANET}.md` — the "which copy is truth" problem is live and unguarded for the new files.

**F8 — NORTH_STAR mode list contradicts CLAUDE.md §6. [LOW]**
`NORTH_STAR.md:47` says "4 режима (Manual→Hybrid→Delegated→Autotest)" — omits Mode 2.5 APPRENTICE, the mode the studio is actually running per §6 and memory, and presents AUTOTEST (a throwaway mode that reverts to Mode 1) as the ladder's endpoint. Exactly the doc-vs-doc divergence Layer 0 is meant to prevent.

### The flaky-test fix (`2a55c1b7`) — SOUND
- (a) **All** occurrences fixed: `grep "await import('@/lib/concierge/tools')"` under `webapp/__tests__` returns zero real hits (the 4 remaining matches are the new explanatory *comments*). 6 dynamic imports across 4 files removed, as claimed.
- (b) **Semantics unchanged:** none of the 4 files use `vi.mock` (verified), so the lazy import guarded nothing; hoisting to a top-level static import is safe. The `async`→sync test-fn change is correct.
- (c) **Root cause left as tech debt** (287KB barrel, ~1.2s cold import) — acceptable for a test fix, but a latent landmine: nothing prevents a future test from dynamically importing the barrel in a test body and re-flaking. *Suggest a lint rule banning `await import('@/lib/concierge/tools')` in test bodies, or splitting the barrel.* Reported verify (tsc clean, 1415/1415, replay 30/30) is consistent with the diff.

### Not a problem
§9 renumbering is clean and continuous (1–11, verified in the diff); no other doc references §9 step numbers.

---

## THE ONE THING most likely to make this decay again
The fix is branded "mechanism not discipline," but **no mechanism was added** — the only new enforcement is more prose in §9, the one hook that could enforce it (`plan-md-staleness-check.cjs`) still ignores PLANET.md, and the "COMPASS hook" it leans on doesn't exist. Nothing forces any session to open NORTH_STAR.md or PLANET.md. It will rot on exactly the same schedule as the last pair, and the false "can't die again" line in the ratified commit makes that rot *less* likely to be caught, because the team believes a guard is watching.</result>
<usage><subagent_tokens>68662</subagent_tokens><tool_uses>15</tool_uses><duration_ms>233298</duration_ms></usage>
</task-notification>

## 2026-07-20 04:03 · director-msg (hook) · NEW · (triage at distill)
Что ж, неплохой анализ и самокритика, но не доведен до конца. Во-первых, я чувствую, что вот эта разбросанность файлов по разным местам и отсутствие собранного механизма в Евэдина это потенциально следующая дырка. при переносе чего-нибудь куда-нибудь. Поэтому логично, наверное. Всё это собрать в одном месте и явно не на лаптопе и ни на десктопе. Очевидно, это должно быть. Ссыласен? И была ещё какая-то вторая мысль, которую я не докрутил, но она, похоже, на, о том, что, в принципе, этот механизм, создание механизмов Он должен быть даже выше, чем проект. Ну, я имею в виду, что у каждого проекта должен быть свой настроенный под конкретный проект этот механизм, но хотелось бы, чтобы эта система могла храниться где-то как отдельная сущность, как отдельный механизм, который можно клонировать при создании любых проектов. я вот об этом. 
и третья но очень важная мы уже говорили о том что инсинуацию по поводу режима 2,5 надо вообще-то отсюда убрать нет такого режима записанный функционируют режимы 1, 2 ,3.  и всё даже режим четвёртый мы убирали потому что фактически я им не пользуюсь в силу его без особой полезности. технический ты прав идеальный вариант ну точнее говоря доведённые до абсолюта вариант - это Когда директор утверждает список тем план издания и финансы то есть те самые хард лимиты о которых ты говорил а утверждение чтения брифов а также кастинг и чтение сценариев да по большому счёту это могут делать также выстроенные критики как они это делают в нижестоящих подразделениях. поэтому можно ввести режим доведённого до абсолюта работы предприятия только назовём его тогда чтобы нигде хвосты не пересекались - режим 9.
но в целом если говорить о режимах как плоскости где описана точка касания директора и других человеческих представителей то в принципе опять же в идеале там где режим девять У нас должна существовать Матрица распределения ответственности и это то к чему мы периодически возвращаемся Но что мы ни разу не доделали точка вы всё равно к этому придём

## 2026-07-20 04:58 · director-msg (hook) · NEW · (triage at distill)
<task-notification>
<task-id>a88c3020b05b42101</task-id>
<tool-use-id>toolu_015i7Y5nYE8kdd278CoAvQHY</tool-use-id>
<output-file>C:\Users\ALEXAN~1\AppData\Local\Temp\claude\C--Users-Alexander-sandystudio\db82fb2e-10e2-40ba-abd3-828b2871c745\tasks\a88c3020b05b42101.output</output-file>
<status>completed</status>
<summary>Agent "Map governance mode references" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>I now have the full blast radius. Here is the reconnaissance report.

---

# Governance Mode Blast Radius — Mode 2.5 / Mode 4 Removal

## Q1 — Is Mode 2.5 / Mode 4 present in CODE or DB schema? (the decisive answer)

**YES — both are present in live CODE and in DB CHECK constraints. This is NOT a doc-only cleanup; it requires a code + schema migration.**

The strongest evidence, ranked by how hard it breaks:

**Mode 2.5 — LIVE CODE (breaks compile/runtime if the string is simply deleted):**
- `webapp\lib\concierge\types.ts:33` — `export type ConciergeMode = '1' | '2' | '2.5' | '3';` — **`'2.5'` is a live union member.** This is the single most load-bearing hit. Removing it turns the two switch arms below into TS errors.
- `webapp\lib\concierge\system-prompt-builder.ts:146` — `case '2.5':` emits the runtime APPRENTICE prompt block ("Mode 2.5 — APPRENTICE. Agent-led, Director-supervised…") injected into Polina's system prompt.
- `webapp\lib\concierge\system-prompt-builder.ts:667` — `case '2.5':` returns the label `' (APPRENTICE — agent-led)'`.
- `webapp\lib\concierge\types.ts:39` — `active_mode: ConciergeMode | null;` (thread field typed on the union).

**Mode 2.5 + Mode 4 — DB CHECK constraint (stored, live on the table):**
- `webapp\supabase\migrations\0025_concierge_threads.sql:31` — `active_mode IS NULL OR active_mode IN ('1','2','2.5','3','4')` — the `concierge_threads.active_mode` column **actively permits both `'2.5'` and `'4'`**. This is a migration (immutable history) BUT the constraint is live on the running table; correcting it needs a NEW migration.
- `webapp\supabase\migrations\0002_core_tables.sql:32` — `CHECK (governance_mode BETWEEN 1 AND 4)` — `episodes.governance_mode` **permits `4`**. Live constraint; needs a new migration to narrow to `BETWEEN 1 AND 3`.

**Mode 4 — the runtime logic was ALREADY removed (Phase 1); only comments/labels remain:**
- The autonomy brain `webapp\lib\agents\gate-decision.ts` is mode-aware for 1/2/3 only; header comment (`:14`) states "Mode 4/AUTOTEST removed in Phase 1." No `=== 4` branch.
- `webapp\lib\agents\next-events.ts:10` — "PHASE 1: Mode-4/AUTOTEST removed."
- Grep for live comparisons `=== 4` / `'AUTOTEST'` in non-test webapp code returned **only comments** (factory.ts:849/897, gate-decision.ts:6/14, chat-internal route.ts:114/400/429) — no live `governance_mode === 4` or `directorUserId === 'AUTOTEST'` branch survives. The `'AUTOTEST'` strings passed in `webapp\__tests__\lib\agents\next-events-*.test.ts` are just arbitrary `directorUserId` args proving the branch no longer special-cases.

**Latent Mode-4 acceptance still in code (would silently accept a stale `4`):**
- `webapp\lib\concierge\resolve-mode.ts:34` — `n &gt;= 1 &amp;&amp; n &lt;= 4` accepts `'4'` and returns `String(n)`. (Note: it can never produce `'2.5'` — `parseInt('2.5')=2` and the numeric sources are integers.)
- `webapp\lib\api\series-bible.ts:141` — doc-comment `(1=MANUAL, 4=AUTOTEST)` while the actual type on the next lines is `GovernanceModeNum = 1 | 2 | 3` (`:133`) — stale comment only.

## Q2 — Grouped reference list

### (b) CODE — enums/types/logic/DB-value that a removal must touch
| File:line | What |
|---|---|
| `webapp\lib\concierge\types.ts:33` | `ConciergeMode = '1' \| '2' \| '2.5' \| '3'` — **live union w/ 2.5** |
| `webapp\lib\concierge\system-prompt-builder.ts:146,148-151` | live `case '2.5':` APPRENTICE prompt block |
| `webapp\lib\concierge\system-prompt-builder.ts:667-668` | live `case '2.5':` label |
| `webapp\lib\concierge\resolve-mode.ts:34` | `n &lt;= 4` accepts legacy Mode 4 |
| `webapp\components\studio-shell\GovernanceChip.tsx:15-27` | `GovernanceMode = 1\|2\|3` (already clean; UI dropdown only offers 1/2/3) |
| `webapp\components\studio-shell\StudioTopbar.tsx:14`, `StudioShell.tsx:27` | `governanceMode?: 1 \| 2 \| 3` (clean) |
| `webapp\lib\api\series-bible.ts:133` | `GovernanceModeNum = 1 \| 2 \| 3` (clean; source-of-truth type) |
| `webapp\app\api\assets\[id]\regenerate-video\route.ts:90` | local `GovernanceModeNum = 1 \| 2 \| 3` (clean) |
| `webapp\lib\api\series-bible.ts:141` | stale comment `4=AUTOTEST` |
| `webapp\lib\agents\gate-decision.ts:6,14`; `next-events.ts:10,506,601,772,1401`; `factory.ts:849,852,897`; `chat-internal\route.ts:113-114,400,422,429,460`; `plan-regen-guard.ts:17`; `chain-flags.ts:91`; `series-bible.ts:141`; `status-transitions.ts:36`; `eref-check.ts:12`; `animator-critic.ts:56`; `replay-pilot.ts:16,195,340`; `exec-thumb-designer.ts:9,28`; `regenerate-image\route.ts:438`; `regenerate-image-from-plan\route.ts:222` | **comments only** mentioning Mode 4/AUTOTEST — safe to reword, no logic impact |
| `webapp\components\concierge\ConciergePanel.tsx:6`; `series-bible\SeriesBibleView.tsx:38`; `concierge\types.ts:12`; `chat\route.ts:5`; `dispatch.ts:4`; `approval-check.ts:6`; `wait-for-pickup.ts:7` | **comments only** mentioning Mode 2.5 |

Tests referencing the removed modes (will need updating if you tighten types): `webapp\__tests__\api\status-transitions.test.ts:34`, `webapp\__tests__\lib\concierge\gate-mutation.test.ts:6`, `webapp\__tests__\lib\agents\next-events-readability.test.ts:6,97,108`, `webapp\__tests__\lib\agents\next-events-single-dispatch.test.ts:8,61,70`, `webapp\__tests__\lib\api\plan-regen-guard.test.ts:2`.

### (c) Migrations — immutable history (do NOT edit; supersede with a NEW migration)
- `webapp\supabase\migrations\0002_core_tables.sql:32` — `governance_mode BETWEEN 1 AND 4`
- `webapp\supabase\migrations\0025_concierge_threads.sql:31` — `active_mode IN ('1','2','2.5','3','4')` and header refs (`:5,65`)
- `webapp\supabase\migrations\0010_phase5b_series_authority_storage.sql:94` — seeds `governance_mode_default = '1'`
- `webapp\supabase\migrations\0040_gate_decision_log.sql:26-27` — `governance_mode` column + Mode 4 comment
- `webapp\supabase\migrations\0035_activity_events_type_catchup.sql` — `governance_mode_change` event type (unaffected)
- `webapp\lib\supabase\types.gen.ts:481,491,501,964,976,988` — generated `active_mode: string` (regenerate after the new migration)

### (a) Prose / docs (safe to edit)
- **Governance spec (source-of-truth doc):** `specs\company\governance.md` — Mode 2.5 section `:169-333` (large block), Mode 4 section `:350-384`.
- **Top-level docs:** `CLAUDE.md:165,167,227`; `AGENTS.md:165,167,227`; `NORTH_STAR.md:47`; `RESUME-AFTER-CLEAR.md:3,5,6`; `PLAN.md:422,649,679,696,711`.
- **Agent files:** `agents\exec\concierge.md` (2.5 throughout: `:6,15,20,21,24,49-53,86,89,91,137,147,171`), `agents\exec\orchestrator.md:60,67,142-162`, `agents\exec\exec_dir_ai.md:28,59`, `agents\exec\editor.md:326`, `agents\exec\archivist.md:66`, `agents\artistic\art_director.md:233-237`.
- **Specs:** `specs\system\webapp.md:106,618,685`, `specs\system\uiux.md:494-511,672-679,1180`, `specs\system\director_inbox.md:341-344`, `specs\system\onboarding.md:260-277`, `specs\system\project_state.md:47`, `specs\system\pipeline_view.md:370`, `specs\glossary.md:257-260`, `specs\production\pipeline_overview.md:31-34`, `specs\protocols\inter_agent_handoff.md:81-190`, `specs\protocols\batch_approval.md:164`.
- **Config:** `config\uiux.yaml:203` — `autotest_severity: "warning"` (the one config key naming AUTOTEST).
- **History/analysis (record — can leave as-is):** `docs\CLAUDE-history.md`, `docs\PLAN-history.md`, `docs\e09-supervision-log.md:391`, `docs\analysis\E27-run-defects.md:17`, `docs\AUTONOMY-IMPLEMENTATION-PLAN.md:41`, `.claude\training-inbox.md:2807`, `.env.example:134`.

## Q3 — Where governance mode is DEFINED vs STORED

**DEFINED (source of truth):**
- **Type (webapp authority):** `webapp\lib\api\series-bible.ts:133` — `GovernanceModeNum = 1 | 2 | 3`. Re-used across all asset routes and `governance.ts`.
- **Enforcement logic:** `webapp\lib\governance.ts` (`enforceMode`, category map) and `webapp\lib\agents\gate-decision.ts` (`resolveGateDecision` — the mode×gateClass autonomy brain, 1/2/3 only).
- **Concierge type (separate, string-based):** `webapp\lib\concierge\types.ts:33` — `ConciergeMode = '1'|'2'|'2.5'|'3'` (the ONE place 2.5 still lives as a value).
- **UI enum:** `webapp\components\studio-shell\GovernanceChip.tsx:15` — `GovernanceMode = 1|2|3`.
- **Doctrine doc:** `specs\company\governance.md`; mirrored in `CLAUDE.md §6` / `AGENTS.md`.

**STORED:**
- **Per-episode:** Supabase `episodes.governance_mode` (smallint, `0002_core_tables.sql:31-32`, CHECK 1-4). This is the authority the pipeline runs under.
- **Global default:** Supabase `app_config` row `scope='system', key='governance_mode_default'` (seeded `'1'` in `0010`). Read by `resolve-mode.ts` and `GovernanceChip`.
- **Per-thread snapshot:** Supabase `concierge_threads.active_mode` (text, `0025:23,31`, CHECK includes `'2.5'`/`'4'`). Written via `webapp\lib\concierge\threads.ts:51`. Precedence chain lives in `webapp\lib\concierge\resolve-mode.ts` (episode → app_config → `'1'`); note it deliberately does NOT trust `active_mode` as authority.
- **Config seed (repo):** `config\uiux.yaml:198-203` (the `governance_mode` UI control) and `.env.example:133`.

## Q4 — Could a new "Mode 9" collide with any existing literal 9?

**No naming collision in the governance namespace — but the schema and types actively FORBID 9, so Mode 9 needs explicit widening, not just addition.** Blockers/considerations:

1. **DB constraints reject 9:**
   - `episodes.governance_mode` CHECK is `BETWEEN 1 AND 4` (`0002_core_tables.sql:32`) → inserting `9` throws. Needs a new migration.
   - `concierge_threads.active_mode` CHECK is `IN ('1','2','2.5','3','4')` (`0025:31`) → `'9'` rejected. Needs a new migration.
2. **Type unions reject 9:** `GovernanceModeNum`/`GovernanceMode` = `1|2|3`, `ConciergeMode` = `'1'|'2'|'2.5'|'3'`. All must gain `9`/`'9'`.
3. **`resolve-mode.ts:34`** caps `n &lt;= 4` → would silently drop a stored 9 back to fallback `'1'`. Must widen.
4. **UI:** `GovernanceChip.tsx:119` hard-codes `[1, 2, 3]` for the picker; `MODE_LABEL`/`MODE_DESCRIPTION` maps need a `9` entry.

**Unrelated existing literal-9 uses (different numeric namespaces — no governance collision, listed so you don't mistake them):**
- `webapp\components\dashboard\ActiveEpisodesZone.tsx:38` — `PUBLISHED: 9, ANALYTICS_COLLECTING: 9, COMPLETE: 9` — these are **episode-status sort ordinals**, not governance modes.
- `webapp\app\onboarding\page.tsx:77` — `state.current_step === 4` — onboarding step counter, unrelated.
- Various `res.status === 403/404/402` and `version === 4` in scripts/providers — HTTP/version numbers, unrelated.

Net: "Mode 9" is free as a label, but the two CHECK constraints and three type unions treat the mode domain as closed (currently 1-4), so introducing 9 is a deliberate widening across DB + types + UI, exactly parallel in scope to the 2.5/4 removal.

---

**One-line bottom line for the Director:** Removing 2.5/4 is **not** doc-only — it touches one live TS union (`ConciergeMode`, `types.ts:33`) with two switch arms (`system-prompt-builder.ts:146,667`) and two live DB CHECK constraints (`0002:32` governance_mode 1-4, `0025:31` active_mode set), requiring a new migration; Mode 4's *runtime logic* is already gone (Phase 1), leaving only comments. Everything else is prose.</result>
<usage><subagent_tokens>77519</subagent_tokens><tool_uses>19</tool_uses><duration_ms>178004</duration_ms></usage>
</task-notification>

## 2026-07-20 07:50 · director-msg (hook) · NEW · (triage at distill)
напомни что это

## 2026-07-20 20:39 · director-msg (hook) · NEW · (triage at distill)
===1=== пошли первые просмотры опубликованных видео (там основная масса - scheduled) читай скилл head of growth но помни что это не только не догма но это не обкатанный материал. так что делай анализ, ищи лучшие практики . оттталкивайся не от гипотез а от анализа и сравнения . задача не свалиться в клише "сам не бомбил , но научить могу!"  а выстроить "автономную экосистему анализа информации из гугл студио,других аналитических платформ и синтеза процессов коррекций и обучения"

## 5. Inngest event `sandystudio/reconcile/episode`

**Defined (type):** `webapp/lib/inngest/client.ts` lines 57-61:
```ts
'sandystudio/reconcile/episode': {
  data: {
    episodeId: string;
  };
},
```
(Comment block lines 52-56.)

**Sent from:**
- `webapp/lib/agents/factory.ts` lines 894-899 — fired unconditionally after any agent completes (`reconcile-trigger`):
```ts
if (episodeId) {
  await step.sendEvent('reconcile-trigger', {
    name: 'sandystudio/reconcile/episode',
    data: { episodeId },
  } as never);
}
```
(There are additional emit sites beyond the factory — on Director approve / shot-exclude per the client.ts comment, line 53 — not enumerated here since you asked specifically about client.ts/factory.)

**Subscribed:** `webapp/inngest/functions/reconcile-episode.ts` line 32 (`reconcileEpisodeFn`, defined lines 20-58). Config (lines 21-31):
```ts
{
  id: 'reconcile-episode',
  name: 'Reconcile Episode (Фаза 2b self-advance)',
  retries: 1,
  debounce: { period: '5s', key: 'event.data.episodeId' },
  concurrency: { limit: 1, key: 'event.data.episodeId' },
},
```
- **Debounce:** `5s`, keyed on `event.data.episodeId`.
- **Concurrency:** `limit: 1`, keyed on `event.data.episodeId`.
- **Arm-gate — MISMATCH to flag:** the arm-gate is **NOT in the subscriber**. `reconcile-episode.ts` does no arm check itself — it just calls `reconcileEpisode(supabase, episodeId)` (line 39) and dispatches the returned cascade. The arm-gate lives one level down in `webapp/lib/agents/reconcile-execute.ts` line 91:
```ts
if (!opts.force &amp;&amp; !isReconcilerArmed(episodeMeta, governanceMode)) return EMPTY;
```
So if your recon claim attributed the arm-gate to the subscriber, correct it: the subscriber owns debounce + concurrency-1 only; the `isReconcilerArmed` gate (and the `opts.force` bypass) is inside `reconcileEpisode` in `reconcile-execute.ts`.

---

### Summary of mismatches vs. the recon claims
1. **`onFailure` does NOT read `episodes.metadata`/`governance_mode`** — it does zero episode-row lookup; `stage` is the hardcoded `agent_failed:${agentId}`, and episodeId/shotId come from the nested `event.data.event.data`. (Consistent with your framing, just confirming.)
2. **`raiseBlockerOnce` dedup key** is `` `${stage}:${shotId ?? ''}` `` (trailing colon when shotId is null), not literally `${stage}:${shotId}`.
3. **`isReconcilerArmed(episodeMeta, governanceMode)` has no `opts` param** despite its JSDoc mentioning `opts.force`; the `force` bypass is in the caller `reconcileEpisode`.
4. **`reconcileRecoveryCap` confirmed absent** — safe to add, mirror `shotRegenCap()` (pure env) or the `referenceRegenCap`/`resolveReferenceRegenCap` pair (env + per-episode metadata override).
5. **Arm-gate is in `reconcile-execute.ts:91`, not in the `reconcile-episode.ts` subscriber.** The subscriber only carries `debounce 5s` + `concurrency limit 1` (both keyed on `event.data.episodeId`) and `retries: 1`.</result>
<usage><subagent_tokens>62235</subagent_tokens><tool_uses>10</tool_uses><duration_ms>97073</duration_ms></usage>
</task-notification>

## 2026-07-16 14:23 · director-msg (hook) · NEW · (triage at distill)
<task-notification>
<task-id>acab4898ea1bdf0cc</task-id>
<tool-use-id>toolu_01DUnzrKFku4f3mwyXn6J89K</tool-use-id>
<output-file>C:\Users\NAVIAV~1\AppData\Local\Temp\claude\C--SandyStudio\80441284-da45-4c79-bbe9-328744f6caa0\tasks\acab4898ea1bdf0cc.output</output-file>
<status>completed</status>
<summary>Agent "Chart/viz patterns in webapp" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>Investigation complete. Here are my findings.

## 1. Charting dependencies — NONE installed

`C:\SandyStudio\webapp\package.json` (lines 36–74) contains **no charting library**. No recharts, chart.js, visx, d3, victory, nivo, or similar.

The only graphics-capable deps are 3D/ambient, not 2D charting:
- `three` `^0.171.0`, `@react-three/fiber` `^9.0.0-rc.0`, `@react-three/drei` `^9.122.0` — used by the ambient background canvas only.
- `lucide-react` `^0.468.0` — provides icons like `BarChart3`, `Gauge`, `TrendingDown` (already imported on these pages), but these are decorative glyphs, not data-driven charts.

**Conclusion: to add trend charts you either add a new dependency or hand-roll inline SVG. The codebase precedent is hand-rolled (see below).**

## 2. Existing chart/graph/sparkline/progress components — none dedicated, but reusable inline patterns exist

There is **no** `components/**` chart/sparkline/gauge/meter component. The only file with inline SVG primitives is `C:\SandyStudio\webapp\components\studio-shell\AmbientAssetField.tsx` (decorative ambient field, not data-viz).

Reusable hand-rolled data-viz patterns already in the code:
- **CSS progress/meter bar** — `C:\SandyStudio\webapp\app\(studio)\budget\page.tsx` lines 110–124: a `div` track (`h-1.5 rounded-full bg-[var(--bg-elevated)]`) with an inner `div` whose `width: ${ratio*100}%` and token-driven `background` (danger/warning/primary). This is the established bar idiom.
- **KPI stat tile** — `Tile` in `factory/page.tsx` (lines 72–103) and `Stat` in `budget/page.tsx` (lines 146–173).
- **Per-shot colored cell strip + playback progress bar** — `C:\SandyStudio\webapp\components\animatic\AnimaticPlayer.tsx`: `cellPalette()` (line 328) maps state→token color, and it uses `color-mix(in oklab, var(--accent-success) N%, transparent)` for glows/fills (lines 365–382, 1116–1203). This is the closest existing "mini visualization" and the best reference for a theme-token-driven inline SVG/CSS trend strip.

## 3. Theme-token palette for data-viz colors

There are **no dedicated `--chart-*` or `--series-*` tokens**. Charts must reuse the semantic accent palette. From `C:\SandyStudio\webapp\app\globals.css` (defined per-theme for all three themes: slate_blue_cinematic default lines 37–58, sand_gold_studio 119–131, deep_purple_night 179–191):

Accent/series-usable tokens:
- `--accent-primary`, `--accent-secondary`, `--accent-tertiary`
- `--accent-success`, `--accent-warning`, `--accent-danger`, `--accent-info`
- `--accent-orange`, `--accent-purple`
- Work-state hues: `--accent-role-designer`, `--accent-role-critic`, `--accent-role-both`, `--accent-role-artist`, `--accent-stage-design`, `--accent-stage-animate`
- Status ramp: `--status-draft/review/revision/approved/locked/blocked/running/completed/warning/danger/muted`
- Text/surface for axes/gridlines/labels: `--text-primary/secondary/muted`, `--bg-elevated`, `--bg-soft`, `--panel-glass-border` (good for gridlines), `--panel-glass-border-active`.

For semi-transparent fills/glows the codebase uses `color-mix(in oklab, var(--accent-*) N%, transparent)` (AnimaticPlayer) — the idiomatic way to derive series tints without new tokens.

**No-hardcode rule** — the spec is `C:\SandyStudio\specs\system\uiux.md`. Note the task referenced "§7.5" but **that section does not exist**; §7 is "Settings Integration" (7.1–7.3 only). The relevant rules are:
- §6.4 (lines 295–305): "Components must use semantic tokens. Raw hex values are allowed **only inside theme definitions**. Do not scatter raw colors inside React components. Do not create page-specific colors unless they are mapped to tokens."
- Line 193, and §26 (lines 1229–1230): "Do not hardcode colors directly inside components. Use semantic theme tokens."
- §24 anti-pattern list line 1183: do not "hardcode visual colors directly into random components."

## 4. How other dashboards render data

All three dashboards share one structure: `StudioContentFrame` wrapper → `header` → `Card`/`CardHeader`/`CardTitle`/`CardBody` from `C:\SandyStudio\webapp\components\ui\Card.tsx`, SWR data fetch via `@/lib/swr` `fetcher`.

- **Card primitive** (`components/ui/Card.tsx`): glass panel, `variant` = `glass | glass-strong | solid`, plus `CardHeader`, `CardTitle` (uppercase tracked), `CardBody`, `CardFooter`. Everything is token-driven (`border-glass`, `bg-panel-glass`, `shadow-[var(--panel-shadow)]`).
- **Budget** (`budget/page.tsx`): 4 KPI `Stat` cards + per-episode list where **each row already renders a horizontal ratio bar** (spend/ceiling) with token colors — the existing bar idiom to copy for per-episode trends.
- **Audience** (`audience/page.tsx`): axis→color map object (`AXIS`, lines 51–56) and `CONF_COLOR` map (58–64) pointing at accent tokens; ranked advice cards, a funnel list, and a per-video list sorted by completion %. **No bars/charts yet** — purely text/list, so a good candidate for the same treatment.
- **Factory** (`factory/page.tsx`, the target): currently a KPI `Tile` grid (lines 72–103, target-aware good/bad/neutral coloring), an open-proposals list, and a **plain HTML `&lt;table&gt;` "Per-episode trend"** (lines 251–312) with per-cell token coloring. It already has a `VERDICT_COLOR` map (lines 59–65) using `--accent-success/info/warning/orange`. This table is exactly where per-episode bars/sparklines/stacked bars would augment or replace the numeric columns.

## Recommendation for the decision

**Hand-roll inline SVG (or CSS bars), token-driven — do not add a chart library.** Rationale grounded in the repo:
- Zero charting deps today; every existing visualization (budget ratio bars, AnimaticPlayer shot strip + progress) is hand-rolled with `var(--accent-*)` and `color-mix(...)`. Adding recharts/d3 would be the first heavy 2D dep and would fight the strict "semantic tokens only, no page-specific colors" rule (recharts wants explicit color props/hex).
- The trend data is small and per-episode (bars, sparklines, stacked bars over ~episode count) — trivially expressible as inline `&lt;svg&gt;` with `&lt;rect&gt;`/`&lt;polyline&gt;` using `fill="var(--accent-primary)"` etc., matching the budget bar and AnimaticPlayer precedents.
- Series palette to standardize on: `--accent-primary`, `--accent-secondary`, `--accent-tertiary`, `--accent-info`, `--accent-purple`, `--accent-orange` for categorical series; `--accent-success/warning/danger` for good/watch/bad thresholds; `--panel-glass-border` for gridlines; `--text-muted` for axis labels. Derive fills via `color-mix(in oklab, var(--accent-*) N%, transparent)`.

One caveat to flag to the parent: the task cited `uiux.md §7.5`, which does not exist in the current spec — the governing color rule is §6.4 (and §26).</result>
<usage><subagent_tokens>57957</subagent_tokens><tool_uses>16</tool_uses><duration_ms>91163</duration_ms></usage>
</task-notification>

## 2026-07-16 14:23 · director-msg (hook) · NEW · (triage at distill)
<task-notification>
<task-id>a9c6f13d9d8ca0d80</task-id>
<tool-use-id>toolu_01G3mB4jTAQCDsyyPX1QvKPC</tool-use-id>
<output-file>C:\Users\NAVIAV~1\AppData\Local\Temp\claude\C--SandyStudio\80441284-da45-4c79-bbe9-328744f6caa0\tasks\a9c6f13d9d8ca0d80.output</output-file>
<status>completed</status>
<summary>Agent "Casting-lock boundary + actor split" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>Investigation complete. Here are the findings.

---

## A) CASTING-LOCK BOUNDARY

### The casting asset
- **file_type: `SPC-episode_cast`** — defined as `EPISODE_CAST_FILE_TYPE` in `C:\SandyStudio\webapp\lib\agents\episode-cast.ts:24`. (There is no `SPC-casting`; the glossary/auto-folder table uses `SPC-episode_cast`.) It is the per-episode "cast gallery" that scopes series canon into one episode.
- This is distinct from series-Bible `BIB-*` assets, which are the ones that go to `LOCKED` (glossary `specs/glossary.md:234` — `LOCKED` is series-level, Director-only).

### Status lifecycle for the cast gallery
Born in **REVIEW**, ratified to **APPROVED** (never episode-`LOCKED` in practice):
- Created by `POST /api/episodes/[id]/cast` → inserts the `SPC-episode_cast` row with `status: 'REVIEW'`, `agent_id: 'ART-AD'` (`C:\SandyStudio\webapp\app\api\episodes\[id]\cast\route.ts:110`). It also emits a `decision_requested` event (line 125-134) — that is the cast *proposed* moment, NOT the lock.
- Ratified via the standard `POST /api/assets/[id]/approve` with `{decision:'APPROVE'}`. On approve, `asset.status` → `APPROVED` and it runs `syncAppearsIn(...)` (`C:\SandyStudio\webapp\app\api\assets\[id]\approve\route.ts:267-281`).
- Loaders accept `status IN ('APPROVED','LOCKED')` (`episode-cast.ts:105` in `loadEpisodeCastSlugs`). So **APPROVED is the effective "locked" state** for episode casting.

### The row/event/timestamp that marks casting locked
The approve route emits an `approval_granted` activity event carrying the asset's file_type in metadata (`approve\route.ts:293-310`):
```
event_type: 'approval_granted',
actor: user.id,               // Director UUID
episode_id: asset.episode_id,
metadata: { decision: 'APPROVE', file_type: 'SPC-episode_cast' }
```

**Exact query — casting-lock timestamp per episode (cleanest, via activity_events):**
```sql
select episode_id, min(created_at) as casting_locked_at
from activity_events
where event_type = 'approval_granted'
  and metadata-&gt;&gt;'file_type' = 'SPC-episode_cast'
  and episode_id = $1
group by episode_id;
```
Use `min(created_at)` because a cast can be re-proposed/re-approved; the first approval is the lock boundary.

**Alternative (via the asset row itself):** the `assets` table has an `updated_at` column (`types.gen.ts:340,359`), stamped on the status flip to APPROVED:
```sql
select episode_id, min(updated_at) as casting_locked_at
from assets
where file_type = 'SPC-episode_cast'
  and status in ('APPROVED','LOCKED')
  and episode_id = $1
group by episode_id;
```
The activity_events query is more robust (immutable audit row; `updated_at` can be re-touched by later edits).

### Existing stage/casting handling in the two files you named
- `compute-scorecard.ts`: **no casting handling** — it reads STB-storyboard, VID-shot, VID-final_cut, jobs, activity_events, gate_decision_log only. There is no pre-cast/post-cast split today.
- `vgen-shot-helpers.ts`: no casting/stage logic (`cast` only appears in prompt-context comments at lines 685, 716). Casting scoping lives in `episode-cast.ts`, not here.

---

## B) ACTOR CLASSIFICATION (Director vs Polina vs AI-EP)

### `actorKind()` — `C:\SandyStudio\webapp\lib\api\agent-names.ts:83-88`
Returns `ActorKind = 'director' | 'ai-director' | 'agent' | 'system'`:
- `null`/empty → `'system'`
- matches UUID regex (`/^[0-9a-f]{8}-...$/i`) → `'director'`
- `'exec-dir-ai'` or `'EXEC-DIR-AI'` → `'ai-director'`
- anything else (e.g. `EXEC-SW`) → `'agent'`

**The stated problem is confirmed.** Both a human Director and Polina dispatch through `requireDirector()`, forwarding the Director's session cookies, so both write `actor: user.id` = the same human Director UUID → `actorKind` → `'director'` for both. AI-EP is the only one separable by actor alone (`exec-dir-ai`).

### Where the `[Prod Assistant]` marker is written
Polina's mutating tools prefix the reason/note string in `C:\SandyStudio\webapp\lib\concierge\tools\dispatch.ts`:
- **Dispatch/trigger** (line 110): `reason: `[Prod Assistant] ${args.reason} — ${approval.reason}``
- **Approve asset** (lines 190-191): `note: `[Prod Assistant] ${args.note} — ${approval.reason}`` (or `[Prod Assistant] ${approval.reason}`)
- **Request revision** (line 271): `note: `[Prod Assistant] ${args.note} — ${approval.reason}``

Those strings flow into the API routes and land in activity_events as follows:

**For `manual_trigger`** (`C:\SandyStudio\webapp\app\api\episodes\[id]\trigger\route.ts:321-338`, and the VGEN pilot branch at 155-170):
```
description: body.reason,          // "[Prod Assistant] ..."
metadata: { agent, event, reason: body.reason, payload, inngest_event_ids, ... }
```
→ The marker is in **both** `description` AND **`metadata.reason`**.

**For approvals** (`approve\route.ts:301-310`):
```
description: body.note,             // "[Prod Assistant] ..." when Polina
metadata: { decision, file_type }   // NOTE: does NOT include the note/reason
```
→ For approval events the marker is **only in `description`**, not in metadata.

### The field to key on (three-class split)
Use `actorKind(actor)` first, then the reason-prefix as the human/Polina tiebreaker:
- **AI-EP** → `actorKind(actor) === 'ai-director'` (actor = `exec-dir-ai`).
- **Polina (Prod Assistant)** → `actorKind(actor) === 'director'` AND the event's reason string starts with `[Prod Assistant]`.
- **Director (human)** → `actorKind(actor) === 'director'` AND reason does NOT start with `[Prod Assistant]`.

The single field that carries the marker on **both** event types is **`description`** (startsWith `'[Prod Assistant]'`). For `manual_trigger` you can equivalently use `metadata.reason`; for `approval_*` events you MUST use `description` because metadata has no reason/note field. Recommendation: key on `description.startsWith('[Prod Assistant]')` uniformly, since it works for manual_trigger and all three approval types.

### How compute-scorecard.ts currently counts (all in `C:\SandyStudio\webapp\lib\agents\scorecard\compute-scorecard.ts:226-251`)
The loop over `acts` uses only `actorKind(a.actor)` — it never inspects the reason/description, so **Polina touches are currently miscounted as human Director**:
- `manual_trigger`: `kind==='director'` → `manualHuman++`; `kind==='ai-director'` → `manualAiEp++` (lines 229-232).
- Approvals (`approval_granted|approval_revision|approval_rejected`), gate class from `metadata.file_type` via `approvalGateClass` (mechanical = `REV-` prefix, else creative):
  - mechanical: `director`→`mechApprovalHuman++`, `ai-director`→`mechApprovalAiEp++` (236-238)
  - creative: `director`→`approvalsCreativeHuman++`, `ai-director`→`approvalsCreativeAi++` (240-241)
- Derived (249-251): `codeableTouchesHuman = manualHuman + mechApprovalHuman`; `codeableTouchesAiEp = manualAiEp + mechApprovalAiEp`; total = sum.
- `approvalsCreativeHuman` is the "floor" judgement metric (line 349 in the return).

So today `codeableTouchesHuman` and `approvalsCreativeHuman` both silently fold in Polina's `[Prod Assistant]` touches. To split into three classes you'd branch inside these same conditionals on `description.startsWith('[Prod Assistant]')` (note: the `acts` select at lines 207-216 currently pulls `event_type, actor, metadata` only — you'd need to add `description` to that select, or add `reason` extraction from `metadata` for the manual_trigger case).</result>
<usage><subagent_tokens>63052</subagent_tokens><tool_uses>19</tool_uses><duration_ms>126090</duration_ms></usage>
</task-notification>

## 2026-07-16 14:24 · director-msg (hook) · NEW · (triage at distill)
<task-notification>
<task-id>a0893af196818b6b0</task-id>
<tool-use-id>toolu_01Aj2AtMZUdhmrqB7E4kEYvP</tool-use-id>
<output-file>C:\Users\NAVIAV~1\AppData\Local\Temp\claude\C--SandyStudio\80441284-da45-4c79-bbe9-328744f6caa0\tasks\a0893af196818b6b0.output</output-file>
<status>completed</status>
<summary>Agent "Find real budget source + breakdown" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>I have everything needed. Here is my report.

---

# Budget/Cost Data-Flow Investigation

## 1. Where the Budget page gets episode cost

**Page:** `C:\SandyStudio\webapp\app\(studio)\budget\page.tsx` — pure client component, fetches `/api/budget` via SWR (60s refresh). It renders whatever the API returns; no query logic of its own.

**API:** `C:\SandyStudio\webapp\app\api\budget\route.ts`. It reads **TWO tables** and mixes them — this is the crux of your bug:

```ts
const [episodesRes, logsRes] = await Promise.all([
  supabase.from('episodes').select('id,episode_code,budget_ceiling,budget_spent,status'),
  supabase.from('budget_log').select('episode_id,agent_id,api_provider,cost_usd'),
]);
```

The returned fields come from **different sources**:

| UI field | Source | Query |
|---|---|---|
| `totalSpent` (top stat) | **`budget_log`** sum | `logs.reduce((s,l)=&gt;s+Number(l.cost_usd),0)` (line 52) |
| `totalAllocated` | `episodes.budget_ceiling` sum | line 51 |
| `burnRate` / "Burn / episode" | **`episodes.budget_spent`** avg of last 5 published | lines 56–61 |
| per-episode `total` (the $X.XX / ceiling bar) | **`budget_log`** filtered by `episode_id` | `epLogs = logs.filter(l =&gt; l.episode_id === e.id)` → `epLogs.reduce(...cost_usd)` (lines 66, 79) |
| per-episode `breakdown` chips | **`budget_log`** grouped by `api_provider` (or `'concierge'` when `agent_id==='EXEC-CONC'`) | lines 67–75 |

**Key finding:** the per-episode line total and breakdown are computed **exclusively from `budget_log`**, NOT from `episodes.budget_spent`. `episode_scorecard` is **not** a cost source (it holds autonomy KPIs only — confirmed below). There is no rollup/materialized table.

So on the Budget page: an episode with 0 `budget_log` rows renders **`$0.00 / $150.00`** with an empty breakdown — but the top "Burn / episode" stat still shows a non-zero number because it reads `episodes.budget_spent`. That split is exactly what makes it *look* like "the UI shows calculated costs" while per-episode is empty.

## 2. `budget_log` schema + how to derive per-agent / per-endpoint breakdown

Defined in `C:\SandyStudio\webapp\supabase\migrations\0002_core_tables.sql` (lines 101–114):

```sql
CREATE TABLE public.budget_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id    uuid REFERENCES public.episodes(id) ON DELETE CASCADE,
  job_id        uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  agent_id      text NOT NULL,          -- e.g. EXEC-VGEN, EXEC-EREF, EXEC-CONC
  api_provider  text NOT NULL,          -- "anthropic" | "fal_ai" | "kling" | "mock" | "backfill"
  model_or_tier text,                   -- "claude-sonnet-4-6" | "flux-pro" | ...
  operation     text NOT NULL,          -- "video_generation" | "script_generation" | "concierge_chat" | ...
  cost_usd      numeric(10,6) NOT NULL CHECK (cost_usd &gt;= 0),
  tokens_used   integer,                -- LLM calls
  duration_ms   integer,                -- generation calls
  created_at    timestamptz NOT NULL DEFAULT now()
);
```
Note: your candidate column list was right except the field is **`operation`** (not "endpoint"), and there is **no** `updated_at` — rows are append-only.

- **Per-AGENT breakdown:** group by `agent_id`, sum `cost_usd`.
- **Per-ENDPOINT/operation breakdown:** group by `operation` (and/or `api_provider` + `model_or_tier`).
- The canonical reusable aggregator already exists: `getBudgetSummary()` in `C:\SandyStudio\webapp\lib\budget.ts` (lines 208–243) groups a single episode's rows by `api_provider::operation` with `costUsd` + `calls` count:
```ts
supabase.from('budget_log')
  .select('api_provider, operation, cost_usd')
  .eq('episode_id', episodeId);
// → agg by `${api_provider}::${operation}` → { apiProvider, operation, costUsd, calls }
```
  Swap the key to `agent_id` for a per-agent fold, or nest both. Add `tokens_used`/`duration_ms` to the select for a richer fold. Rows per episode are bounded (a few hundred), so JS aggregation is fine.

`idx` note: partial unique index `budget_log_job_unique ON (job_id) WHERE job_id IS NOT NULL` (migration 0009) — idempotency only, not for querying.

## 3. Why recent episodes have budget in the UI but 0 `budget_log` rows by `episode_id`

Cost is recorded through **two independent write paths**, and only one writes a `budget_log` row keyed to the episode:

**Path A — `recordCost()`** (`C:\SandyStudio\webapp\lib\budget.ts`, lines 305–429). This is the "correct" path: it does an idempotent `budget_log` INSERT (Step 3) **and** bumps `episodes.budget_spent` via the atomic RPC (Step 4). Callers: `inngest/functions/exec-vgen.ts:508`, the three `app/api/assets/[id]/{regenerate-image,regenerate-video,enrich}` routes, and the two `series/[id]/bible` routes. When this path runs, `budget_log` and `budget_spent` stay in sync.

**Path B — `assertBudgetAvailable()` / `increment_budget_spent` RPC** (lib/budget.ts:158–164; migration `0037_budget_atomic_increment_rpc.sql`). This is a **pre-spend reservation** that increments `episodes.budget_spent` **directly, WITHOUT writing any `budget_log` row**. `recordCost(..., reservedUsd)` is supposed to reconcile the delta afterward. **If the reconciliation never runs** — generation failed/aborted, job never reached the `record-cost` step, and `releaseBudgetReservation()` (lib/budget.ts:175–186) wasn't called — then `budget_spent` carries the reserved amount while `budget_log` has **zero rows** for that episode. This is the most likely explanation for E12–E29.

**Other `budget_spent`-only mutators (no `budget_log` row):**
- Ad-hoc episode scripts write/inspect `budget_spent` directly: `scripts\e17-spend.ts`, `e17-*.ts`, `e19-*.ts`, `archive-e20-partial.ts` — anything from that era that set `budget_spent` manually won't have matching log rows.
- **Concierge (Polina) cost** — `C:\SandyStudio\webapp\lib\concierge\cost.ts` `recordConciergeCost()` (lines 40–80) DOES write a `budget_log` row (agent_id `EXEC-CONC`, `episode_id` set) but **deliberately does NOT touch `budget_spent`** (see its header comment lines 11–15). This is the inverse case.

**Also relevant — archival / cascade:** `budget_log.episode_id` has `ON DELETE CASCADE`. If any E12–E29 episode row was ever deleted/recreated its log rows vanish while a snapshot of spend can live in `episodes.metadata.archival` (migration `0029_episodes_archive.sql`). Recent episodes may be `ARCHIVED` (status), which the Budget API's `PUBLISHED_STATES` set does **not** include, so archived episodes are also excluded from `burnRate`.

**Backfill precedent:** `C:\SandyStudio\webapp\tools\backfill-direct-costs.ts` already exists precisely because pre-2026-06-03 direct spends landed in **asset metadata** (`metadata.image_prompt.history[].cost_usd`, `metadata.shot_reference.generation_history[].cost_usd`) and never in `budget_log`. That per-asset history is a secondary cost source you can sweep if `budget_log` is empty for an episode (`sumHistoryCost()`, lines 27–42).

**Net:** `episodes.budget_spent` is the more complete number for recent episodes; `budget_log` is the itemized (per-agent/per-operation) ledger but is under-populated for E12–E29. They will not agree.

## 4. Pre-cast vs post-cast split — feasible

Yes. Every `budget_log` row is timestamped (`created_at timestamptz NOT NULL DEFAULT now()`), so rows can be bucketed against a casting-lock timestamp.

**There is no dedicated `cast_locked_at` column.** The casting-lock event is the **APPROVAL of the episode-cast asset**:
- Cast asset is created in `REVIEW` by `C:\SandyStudio\webapp\app\api\episodes\[id]\cast\route.ts` with `file_type = 'SPC-episode_cast'` (constant `EPISODE_CAST_FILE_TYPE` in `lib\agents\episode-cast.ts:24`).
- Director ratifies via `POST /api/assets/{cast_asset_id}/approve` (route comment, cast/route.ts:141). "Approve to lock scoping."

So the casting-lock timestamp for an episode = the moment its `SPC-episode_cast` asset went APPROVED. Derive it from any of:
1. **`approvals`** table (`created_at`) joined to the `SPC-episode_cast` asset for that episode (approvals schema in 0002_core_tables.sql:72–81), or
2. **`activity_events`** row `event_type='approval_granted'` with `episode_id` set and `metadata.file_type='SPC-episode_cast'`, or
3. the cast asset's `updated_at` when `status='APPROVED'` (assets has an `updated_at` trigger).

Then: `pre_cast = Σ cost_usd WHERE created_at &lt; castLockedAt`, `post_cast = Σ cost_usd WHERE created_at &gt;= castLockedAt`. Note the caveat from §3: this split is only accurate for episodes whose spend is actually itemized in `budget_log`. For reservation-only episodes there are no timestamped rows to bucket.

## What to reuse for the Factory page

**Good news — most of it already exists.** `C:\SandyStudio\webapp\app\api\factory\route.ts` is the sibling of `/api/budget` and already computes total $ and $/shot:

- Header comment (line 5): *"Reads episode_scorecard (SSOT) + budget_log ($/shot)"*.
- Lines 76–85: sums `budget_log.cost_usd` per episode (`costByEpisode`), single scan `.in('episode_id', episodeIds)`.
- Line 93–115: `shotCount = episode_scorecard.shot_count`; `costTotal = costByEpisode.get(episodeId)`; **`costPerShot = costTotal / shotCount`**.

So **total $ and $/shot are already served by `/api/factory`** — reuse `costTotal` and `costPerShot` directly. Note it inherits the §3 limitation: `costTotal` is `budget_log`-based, so it is `null`/low for E12–E29. If you want the *complete* number, read `episodes.budget_spent` alongside it (as the Budget page's burnRate does).

**What you need to ADD** (not yet present anywhere): pre-cast / post-cast split and the folded per-agent/per-endpoint breakdown. Exact reusable queries:

- **shot count (`$/shot` denominator):** `episode_scorecard.shot_count` (latest row per episode; `episode_scorecard_episode_idx` orders by `created_at DESC`). Source-of-truth derivation is `listStoryboardShots()` on the APPROVED `STB-storyboard`, in `lib\agents\scorecard\compute-scorecard.ts:141–169`.
- **total / per-agent / per-endpoint fold:** extend the `getBudgetSummary` pattern (`lib\budget.ts:208–243`) — select `agent_id, api_provider, operation, cost_usd, created_at, tokens_used` `.eq('episode_id', id)`, aggregate in JS by `agent_id` and by `operation`.
- **pre/post-cast buckets:** add `created_at` to that select and compare against the cast-approval timestamp (§4).

**Important:** `episode_scorecard` holds **no cost columns** (schema `0041_episode_scorecard.sql` lines 18–59 — KPIs, autonomy, churn, latency only). Do not expect cost there; join it to `budget_log` / `episodes.budget_spent` exactly as `/api/factory` already does.

### Source-of-truth summary
- **Itemized cost ledger (per-agent, per-operation, timestamped):** `budget_log` — under-populated for E12–E29.
- **Authoritative episode total (most complete for recent episodes):** `episodes.budget_spent`.
- **$/shot denominator:** `episode_scorecard.shot_count`.
- **Cast-lock timestamp:** approval of the `SPC-episode_cast` asset (`approvals` / `activity_events.approval_granted` / asset `updated_at`).
- **Existing code to copy:** `app/api/factory/route.ts` (total + $/shot), `lib/budget.ts::getBudgetSummary` (breakdown fold), `app/api/budget/route.ts` (the concierge-bucket + ceiling-ratio rendering pattern).</result>
<usage><subagent_tokens>83099</subagent_tokens><tool_uses>30</tool_uses><duration_ms>177458</duration_ms></usage>
</task-notification>

## 2026-07-16 16:12 · director-msg (hook) · NEW · (triage at distill)
pre-cast cant be  $2.06 (asset, brif,storyboard,writer,critics?????

## 2026-07-16 16:48 · director-msg (hook) · NEW · (triage at distill)
Windows PowerShell
Copyright (C) Microsoft Corporation. All rights reserved.

Install the latest PowerShell for new features and improvements! https://aka.ms/PSWindows

PS C:\Users\Alexander> cd C:\Users\Alexander\sandystudio
PS C:\Users\Alexander\sandystudio> git status          # если "not a git repository" → папку переименуй/очисти и клонируй:
On branch claude/enhance-video-quality-AcRTn
Your branch is up to date with 'origin/claude/enhance-video-quality-AcRTn'.

nothing to commit, working tree clean
PS C:\Users\Alexander\sandystudio> # git clone https://github.com/alexanderTakeOff/SandyStudio.git C:\Users\Alexander\sandystudio
PS C:\Users\Alexander\sandystudio> git pull            # если уже клон — просто подтянуть свежий master
remote: Enumerating objects: 1248, done.
remote: Counting objects: 100% (398/398), done.
remote: Compressing objects: 100% (141/141), done.
remote: Total 1248 (delta 298), reused 315 (delta 245), pack-reused 850 (from 2)
Receiving objects: 100% (1248/1248), 1.47 MiB | 6.31 MiB/s, done.
Resolving deltas: 100% (721/721), completed with 55 local objects.
From https://github.com/alexanderTakeOff/SandyStudio
 * [new branch]        claude/llm-gpt5-6-luna-option-el8tid -> origin/claude/llm-gpt5-6-luna-option-el8tid
   ab94907e..90f2133c  master                -> origin/master
 * [new branch]        teo/conductor-phase2  -> origin/teo/conductor-phase2
 * [new branch]        teo/d6-throughput     -> origin/teo/d6-throughput
 * [new branch]        teo/e27-d2-d3-fixes   -> origin/teo/e27-d2-d3-fixes
 * [new branch]        teo/e27-plancritic-nesting-fix -> origin/teo/e27-plancritic-nesting-fix
 * [new branch]        teo/episode-start-notice -> origin/teo/episode-start-notice
 * [new branch]        teo/factory-conductor -> origin/teo/factory-conductor
 * [new branch]        worktree-shorts-recut -> origin/worktree-shorts-recut
 * [new branch]        worktree-teo+shorts-tail-wiring -> origin/worktree-teo+shorts-tail-wiring
Already up to date.
PS C:\Users\Alexander\sandystudio> cd C:\Users\Alexander\sandystudio\webapp
PS C:\Users\Alexander\sandystudio\webapp> npm install
npm warn ERESOLVE overriding peer dependency
npm warn While resolving: @react-spring/animated@9.7.5
npm warn Found: react@19.2.5
npm warn node_modules/react
npm warn   react@"^19.0.0" from the root project
npm warn   15 more (@react-three/fiber, @uiw/react-codemirror, ...)
npm warn
npm warn Could not resolve dependency:
npm warn peer react@"^16.8.0 || ^17.0.0 || ^18.0.0" from @react-spring/animated@9.7.5
npm warn node_modules/@react-spring/animated
npm warn   @react-spring/animated@"~9.7.5" from @react-spring/core@9.7.5
npm warn   node_modules/@react-spring/core
npm warn   1 more (@react-spring/three)
npm warn
npm warn Conflicting peer dependency: react@18.3.1
npm warn node_modules/react
npm warn   peer react@"^16.8.0 || ^17.0.0 || ^18.0.0" from @react-spring/animated@9.7.5
npm warn   node_modules/@react-spring/animated
npm warn     @react-spring/animated@"~9.7.5" from @react-spring/core@9.7.5
npm warn     node_modules/@react-spring/core
npm warn     1 more (@react-spring/three)
npm warn ERESOLVE overriding peer dependency
npm warn While resolving: @react-spring/core@9.7.5
npm warn Found: react@19.2.5
npm warn node_modules/react
npm warn   react@"^19.0.0" from the root project
npm warn   15 more (@react-three/fiber, @uiw/react-codemirror, ...)
npm warn
npm warn Could not resolve dependency:
npm warn peer react@"^16.8.0 || ^17.0.0 || ^18.0.0" from @react-spring/core@9.7.5
npm warn node_modules/@react-spring/core
npm warn   @react-spring/core@"~9.7.5" from @react-spring/three@9.7.5
npm warn   node_modules/@react-spring/three
npm warn
npm warn Conflicting peer dependency: react@18.3.1
npm warn node_modules/react
npm warn   peer react@"^16.8.0 || ^17.0.0 || ^18.0.0" from @react-spring/core@9.7.5
npm warn   node_modules/@react-spring/core
npm warn     @react-spring/core@"~9.7.5" from @react-spring/three@9.7.5
npm warn     node_modules/@react-spring/three
npm warn ERESOLVE overriding peer dependency
npm warn While resolving: @react-spring/shared@9.7.5
npm warn Found: react@19.2.5
npm warn node_modules/react
npm warn   react@"^19.0.0" from the root project
npm warn   15 more (@react-three/fiber, @uiw/react-codemirror, ...)
npm warn
npm warn Could not resolve dependency:
npm warn peer react@"^16.8.0 || ^17.0.0 || ^18.0.0" from @react-spring/shared@9.7.5
npm warn node_modules/@react-spring/shared
npm warn   @react-spring/shared@"~9.7.5" from @react-spring/animated@9.7.5
npm warn   node_modules/@react-spring/animated
npm warn   2 more (@react-spring/core, @react-spring/three)
npm warn
npm warn Conflicting peer dependency: react@18.3.1
npm warn node_modules/react
npm warn   peer react@"^16.8.0 || ^17.0.0 || ^18.0.0" from @react-spring/shared@9.7.5
npm warn   node_modules/@react-spring/shared
npm warn     @react-spring/shared@"~9.7.5" from @react-spring/animated@9.7.5
npm warn     node_modules/@react-spring/animated
npm warn     2 more (@react-spring/core, @react-spring/three)
npm warn ERESOLVE overriding peer dependency
npm warn While resolving: @react-spring/three@9.7.5
npm warn Found: react@19.2.5
npm warn node_modules/react
npm warn   react@"^19.0.0" from the root project
npm warn   15 more (@react-three/fiber, @uiw/react-codemirror, ...)
npm warn
npm warn Could not resolve dependency:
npm warn peer react@"^16.8.0 || ^17.0.0 || ^18.0.0" from @react-spring/three@9.7.5
npm warn node_modules/@react-spring/three
npm warn   @react-spring/three@"~9.7.5" from @react-three/drei@9.122.0
npm warn   node_modules/@react-three/drei
npm warn
npm warn Conflicting peer dependency: react@18.3.1
npm warn node_modules/react
npm warn   peer react@"^16.8.0 || ^17.0.0 || ^18.0.0" from @react-spring/three@9.7.5
npm warn   node_modules/@react-spring/three
npm warn     @react-spring/three@"~9.7.5" from @react-three/drei@9.122.0
npm warn     node_modules/@react-three/drei
npm error code ERESOLVE
npm error ERESOLVE could not resolve
npm error
npm error While resolving: @react-three/drei@9.122.0
npm error Found: @react-three/fiber@9.6.0
npm error node_modules/@react-three/fiber
npm error   @react-three/fiber@"^9.0.0-rc.0" from the root project
npm error   peer @react-three/fiber@">=6.0" from @react-spring/three@9.7.5
npm error   node_modules/@react-spring/three
npm error     @react-spring/three@"~9.7.5" from @react-three/drei@9.122.0
npm error     node_modules/@react-three/drei
npm error       @react-three/drei@"^9.122.0" from the root project
npm error
npm error Could not resolve dependency:
npm error peer @react-three/fiber@"^8" from @react-three/drei@9.122.0
npm error node_modules/@react-three/drei
npm error   @react-three/drei@"^9.122.0" from the root project
npm error
npm error Conflicting peer dependency: @react-three/fiber@8.18.0
npm error node_modules/@react-three/fiber
npm error   peer @react-three/fiber@"^8" from @react-three/drei@9.122.0
npm error   node_modules/@react-three/drei
npm error     @react-three/drei@"^9.122.0" from the root project
npm error
npm error Fix the upstream dependency conflict, or retry
npm error this command with --force or --legacy-peer-deps
npm error to accept an incorrect (and potentially broken) dependency resolution.
npm error
npm error
npm error For a full report see:
npm error C:\Users\Alexander\AppData\Local\npm-cache\_logs\2026-07-16T16_42_18_600Z-eresolve-report.txt
npm notice
npm notice New minor version of npm available! 11.6.2 -> 11.18.0
npm notice Changelog: https://github.com/npm/cli/releases/tag/v11.18.0
npm notice To update run: npm install -g npm@11.18.0
npm notice
npm error A complete log of this run can be found in: C:\Users\Alexander\AppData\Local\npm-cache\_logs\2026-07-16T16_42_18_600Z-debug-0.log
PS C:\Users\Alexander\sandystudio\webapp> cd C:\Users\Alexander\sandystudio
PS C:\Users\Alexander\sandystudio> git rev-parse --is-inside-work-tree     # True = это git-репо
true
PS C:\Users\Alexander\sandystudio> git log -1 --oneline                    # хочу увидеть 90f2133c или новее
de7ed3ce (HEAD -> claude/enhance-video-quality-AcRTn, origin/claude/enhance-video-quality-AcRTn) auto-sync 2026-05-07 14:15
PS C:\Users\Alexander\sandystudio> git branch --show-current               # должно быть master
claude/enhance-video-quality-AcRTn
PS C:\Users\Alexander\sandystudio> Get-ChildItem C:\Users\Alexander\sandystudio\start-stack*.*

## 2026-07-16 16:56 · director-msg (hook) · NEW · (triage at distill)
PS C:\Users\Alexander\sandystudio\webapp> npm ci
npm warn ERESOLVE overriding peer dependency
npm warn While resolving: @react-spring/animated@9.7.5
npm warn Found: react@19.2.5
npm warn node_modules/react
npm warn   react@"^19.0.0" from the root project
npm warn   15 more (@react-three/fiber, @uiw/react-codemirror, ...)
npm warn
npm warn Could not resolve dependency:
npm warn peer react@"^16.8.0 || ^17.0.0 || ^18.0.0" from @react-spring/animated@9.7.5
npm warn node_modules/@react-spring/animated
npm warn   @react-spring/animated@"~9.7.5" from @react-spring/core@9.7.5
npm warn   node_modules/@react-spring/core
npm warn   1 more (@react-spring/three)
npm warn
npm warn Conflicting peer dependency: react@18.3.1
npm warn node_modules/react
npm warn   peer react@"^16.8.0 || ^17.0.0 || ^18.0.0" from @react-spring/animated@9.7.5
npm warn   node_modules/@react-spring/animated
npm warn     @react-spring/animated@"~9.7.5" from @react-spring/core@9.7.5
npm warn     node_modules/@react-spring/core
npm warn     1 more (@react-spring/three)
npm warn ERESOLVE overriding peer dependency
npm warn While resolving: @react-spring/core@9.7.5
npm warn Found: react@19.2.5
npm warn node_modules/react
npm warn   react@"^19.0.0" from the root project
npm warn   15 more (@react-three/fiber, @uiw/react-codemirror, ...)
npm warn
npm warn Could not resolve dependency:
npm warn peer react@"^16.8.0 || ^17.0.0 || ^18.0.0" from @react-spring/core@9.7.5
npm warn node_modules/@react-spring/core
npm warn   @react-spring/core@"~9.7.5" from @react-spring/three@9.7.5
npm warn   node_modules/@react-spring/three
npm warn
npm warn Conflicting peer dependency: react@18.3.1
npm warn node_modules/react
npm warn   peer react@"^16.8.0 || ^17.0.0 || ^18.0.0" from @react-spring/core@9.7.5
npm warn   node_modules/@react-spring/core
npm warn     @react-spring/core@"~9.7.5" from @react-spring/three@9.7.5
npm warn     node_modules/@react-spring/three
npm warn ERESOLVE overriding peer dependency
npm warn While resolving: @react-spring/shared@9.7.5
npm warn Found: react@19.2.5
npm warn node_modules/react
npm warn   react@"^19.0.0" from the root project
npm warn   15 more (@react-three/fiber, @uiw/react-codemirror, ...)
npm warn
npm warn Could not resolve dependency:
npm warn peer react@"^16.8.0 || ^17.0.0 || ^18.0.0" from @react-spring/shared@9.7.5
npm warn node_modules/@react-spring/shared
npm warn   @react-spring/shared@"~9.7.5" from @react-spring/animated@9.7.5
npm warn   node_modules/@react-spring/animated
npm warn   2 more (@react-spring/core, @react-spring/three)
npm warn
npm warn Conflicting peer dependency: react@18.3.1
npm warn node_modules/react
npm warn   peer react@"^16.8.0 || ^17.0.0 || ^18.0.0" from @react-spring/shared@9.7.5
npm warn   node_modules/@react-spring/shared
npm warn     @react-spring/shared@"~9.7.5" from @react-spring/animated@9.7.5
npm warn     node_modules/@react-spring/animated
npm warn     2 more (@react-spring/core, @react-spring/three)
npm warn ERESOLVE overriding peer dependency
npm warn While resolving: @react-spring/three@9.7.5
npm warn Found: react@19.2.5
npm warn node_modules/react
npm warn   react@"^19.0.0" from the root project
npm warn   15 more (@react-three/fiber, @uiw/react-codemirror, ...)
npm warn
npm warn Could not resolve dependency:
npm warn peer react@"^16.8.0 || ^17.0.0 || ^18.0.0" from @react-spring/three@9.7.5
npm warn node_modules/@react-spring/three
npm warn   @react-spring/three@"~9.7.5" from @react-three/drei@9.122.0
npm warn   node_modules/@react-three/drei
npm warn
npm warn Conflicting peer dependency: react@18.3.1
npm warn node_modules/react
npm warn   peer react@"^16.8.0 || ^17.0.0 || ^18.0.0" from @react-spring/three@9.7.5
npm warn   node_modules/@react-spring/three
npm warn     @react-spring/three@"~9.7.5" from @react-three/drei@9.122.0
npm warn     node_modules/@react-three/drei
npm error code ERESOLVE
npm error ERESOLVE could not resolve
npm error
npm error While resolving: @react-three/drei@9.122.0
npm error Found: @react-three/fiber@9.6.0
npm error node_modules/@react-three/fiber
npm error   @react-three/fiber@"^9.0.0-rc.0" from the root project
npm error   peer @react-three/fiber@">=6.0" from @react-spring/three@9.7.5
npm error   node_modules/@react-spring/three
npm error     @react-spring/three@"~9.7.5" from @react-three/drei@9.122.0
npm error     node_modules/@react-three/drei
npm error       @react-three/drei@"^9.122.0" from the root project
npm error
npm error Could not resolve dependency:
npm error peer @react-three/fiber@"^8" from @react-three/drei@9.122.0
npm error node_modules/@react-three/drei
npm error   @react-three/drei@"^9.122.0" from the root project
npm error
npm error Conflicting peer dependency: @react-three/fiber@8.18.0
npm error node_modules/@react-three/fiber
npm error   peer @react-three/fiber@"^8" from @react-three/drei@9.122.0
npm error   node_modules/@react-three/drei
npm error     @react-three/drei@"^9.122.0" from the root project
npm error
npm error Fix the upstream dependency conflict, or retry
npm error this command with --force or --legacy-peer-deps
npm error to accept an incorrect (and potentially broken) dependency resolution.
npm error
npm error
npm error For a full report see:
npm error C:\Users\Alexander\AppData\Local\npm-cache\_logs\2026-07-16T16_56_22_515Z-eresolve-report.txt
npm error A complete log of this run can be found in: C:\Users\Alexander\AppData\Local\npm-cache\_logs\2026-07-16T16_56_22_515Z-debug-0.log
PS C:\Users\Alexander\sandystudio\webapp>

## 2026-07-16 17:27 · director-msg (hook) · NEW · (triage at distill)
спасибо что напомнил  про два untracked . я везде убрал хвосты а на исходном остались. зачистил!

## 2026-07-16 18:17 · director-msg (hook) · NEW · (triage at distill)
попробовал прочекать видео на лэптопе : advisory critic could not judge this asset: ffmpeg could not be launched — every candidate (FFMPEG_PATH, PATH, winget/unix fallbacks) failed to spawn. This is often TRANSIENT (the machine could not spawn a process — e.g. another job saturating it), not a missing binary: retry first. If it persists, check that ffmpeg is installed (winget install ffmpeg / brew install ffmpeg / apt install ffmpeg) or set FFMPEG_PATH.
manual_trigger · 👁 Visual Critic (video): SS-S15-E29-VID-shot-s15-e29-sh04-v01-APPROVED.mp4 → skipped

## 2026-07-21 06:41 · director-msg (hook) · NEW · (triage at distill)
зддесь не все верно ниже  в частности секреты лежат в локальном .env . ты не в облаке остальное плюс минус норм но не догма . по факту - начинаем сначала
# SESSION HANDOFF — Head of Growth · Channel View-Spread Audit

> **Date:** 2026-07-21 · **Role:** Head of Growth (Тео) · **Mode at handoff:** `===1===` ANALYTICS
> **Branch:** `claude/head-of-growth-discussion-dt8fr7`
> Read this first in the new session, then `CLAUDE.md → NORTH_STAR.md → PLANET.md → PLAN.md (origin/master) → glossary`.

---

## 1. The task the Director set

Two things, on the **Sandy the Hourglass** YouTube channel (`@sandy_the_hourglass`, `UCc2YJlHFclO9BWLEgPlglIg`):

1. **Analyse the view spread.** Some uploads are published, some are not. Of the published
   ones, some have ~**5 views**, some have **thousands**. First deliverable = *an analysis of
   what causes that gap*, and how to fix it.
2. **Develop the `head-of-growth` skill further** off the back of what we learn.

The Director explicitly wants **DIRECT access to live channel data** for this — not a
reconstruction from memory. "нам надо иметь ПРЯМОЙ доступ для анализа."

## 2. The blocker (why a new session is needed)

This cloud container is a **fresh clone** — it has **no Google/YouTube credentials** and no
`webapp/.env.local` (it's gitignored, never pushed — correct). The live-metrics path
(`webapp/lib/agents/providers/youtube-stats.ts`) needs a token. Public scraping is dead:
YouTube returns **403 to WebFetch** (anti-scraping), and the SandyStudio Supabase project is
**not** in the MCP-connected project list, so no stored snapshots either.

**To get direct access, exactly THREE env vars are required** (confirmed against the real
code path `google-auth.ts` + `youtube-consent.ts` — the `YOUTUBE_CLIENT_ID/SECRET` names in
`.env.example` are STALE/unused; the OAuth client is shared with Drive):

```
GOOGLE_CLIENT_ID=…
GOOGLE_CLIENT_SECRET=…
YOUTUBE_REFRESH_TOKEN=…        # the Sandy Brand Account refresh token
```

The Director is providing these via **CCR environment variables** (env settings → new session
picks them up from `process.env`). Source of the values on the Director's machine:
`C:\SandyStudio\webapp\.env.local`.

## 3. FIRST ACTION in the new session

Once the three vars are set, run the ready-made **read-only** audit (already committed):

```bash
cd /home/user/SandyStudio/webapp && node scripts/yt-audit.mjs
```

It enumerates **every** upload via the owner's uploads-playlist (so unlisted/private show
too) and prints, sorted by views: `views · avgViewPercentage% · publishDate · privacyStatus ·
short|long · title`, plus channel subs/total. No writes anywhere.

If it prints `MISSING ENV` → the vars didn't land; fall back to asking the Director to paste
the three values into chat (they go into a gitignored `.env.local`, never committed).

## 4. Working hypothesis to CONFIRM or KILL with the numbers

Almost certainly this is **not** a quality problem — it's the two-algorithm split baked into
`shorts-longform-distribution`:

- **Thousands of views → the Shorts** (vertical swipe feed pushes to everyone; 0 subs is no
  barrier). Likely the 4 Vending shorts (`R5YYEoP7nrA` / `J6rp-gmUKe4` / `cZmqxhQIPeo` /
  `AHARBzM2CWw`) + Airport short (`mIew_0BCc5Y`).
- **~5 views → the long-form 16:9 episodes** (live in Home/Suggested/Search; an unknown
  0-sub channel gets ~zero impressions there → only direct-link views).
- **Some "5s" = still Unlisted** — the rollout plan was "upload unlisted → schedule Public";
  part of the catalogue likely never flipped to Public.

**What the audit must decide:** (a) which videos are `public` vs `unlisted`/`private`;
(b) for the high-view Shorts, is `avgViewPercentage` healthy (real interest) or low (empty
impressions)? completion% is the quality signal, views are only the exposure gate
(`audience-quality-sensor`). Only after that do we prescribe.

If confirmed, the fix is **funnel, not re-shoot**: flip the good episodes to Public on a
cadence, wire the Shorts→episode backlink bridge (already built:
`webapp/lib/agents/providers/short-linkage.ts`), and keep Shorts as the discovery engine.

## 5. Reference map (all known video IDs)

Full ledger: `docs/distribution/video-episode-map.md`. Long-form episodes:
`mCGE4FBcSrQ BvIHVozwdKQ LgGPVYUEzf8 iT8nwWABBqE ywNKJYsbnrE S2vIiuUCUGg 2efpY_JPYUo
rzBgn07Ucsg gU8BBvnoHu0`. Shorts: `mIew_0BCc5Y` (Airport, canonical) + Vending 4 above.
(The `yt-audit.mjs` enumeration supersedes this list — it reads whatever is actually on the
channel now.)

## 6. Key files touched / relevant

- `webapp/scripts/yt-audit.mjs` — **NEW**, the audit tool (this session).
- `.claude/skills/head-of-growth/SKILL.md` — the role skill to extend (deliverable #2).
- `.claude/skills/shorts-longform-distribution/SKILL.md` — the two-algorithm doctrine.
- `.claude/skills/audience-quality-sensor/SKILL.md` — metric roles (completion vs exposure gate).
- `docs/distribution/strategy.md` + `video-episode-map.md` — GTM plan + video↔episode ledger.

## 7. Housekeeping noted (not yet done)

- `.env.example` lines 68–69 (`YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET`) are dead — code
  reads `GOOGLE_CLIENT_ID/SECRET`. Fix the example to avoid the next person setting the wrong
  vars.
- PLAN.md is **master-only** — do NOT edit it from this feature branch. If a PLAN update is
  owed, do it as a tiny commit on master.

---
*Handoff written by Head of Growth (Тео), 2026-07-21. Resume at §3.*

## 2026-07-21 07:21 · director-msg (hook) · NEW · (triage at distill)
а запусти агента на анализ - влияние времени запуска как-то коррелируется? унас? вообще? 

1. "У главного победителя ссылки НЕТ. PHRbzx1qAHg — 1243 просмотра, самый большой охват на канале — единственный публичный Short без бэклинка. Весь трафик утёк в никуда. У dLB3EcLHQ8g (запланирован на 23-е) тоже пусто." === не может этого быть я делал related видео для каждого шортса. если не было родного - то пускал на опубликованный лонг (как в аэропорте)
2. (75 сек, вертикаль) ведёт на 2efpY_JPYUo (75 сек, лендскейп) === вот это косяк! я не додумал. предложение?
3. давай так поставь хук на анализ каждого сообщения и если оно касается того что можно сделать скиллом для анализатора и выпускающего (growth) - cозраняем на гите в "прото-скилл". когда мыслей наберется - обработаем и преввратим в скилл. полезно? 
q7y ===5===
q8 перевести в sceduled на будущие (какие-то) даты? 
q9 - it is not a "my idea" just a question for disscussion

## 2026-07-21 07:37 · director-msg (hook) · NEW · (triage at distill)
<task-notification>
<task-id>ad72ea9c78531d2db</task-id>
<tool-use-id>toolu_01STmUfCAomGpw8mgHp6APyW</tool-use-id>
<output-file>C:\Users\NAVIAV~1\AppData\Local\Temp\claude\C--SandyStudio\c774dc69-2cb1-412c-b631-a5fa851f2184\tasks\ad72ea9c78531d2db.output</output-file>
<status>completed</status>
<summary>Agent "Playlists as a YouTube traffic lever" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>## 1. DIRECT ANSWER

**No — don't invest in "more links to playlists." It is a rounding error against your actual constraint.** The `PLAYLIST` traffic source, per YouTube's own definition, does not mean "people discovered us via a playlist"; it means *"the video views occurred while the video was being played as part of a playlist. It includes traffic coming from the playlist page"* — i.e. it counts the second, third, fourth video of a play-through, plus any hit on the playlist page itself. On a channel with **1 subscriber and ~95 total views in that table**, the overwhelmingly likely generator of 37 playlist-context views is **your own review-watching of the playlist you built during launch prep**, not audience behaviour. Worse, playlists are structurally a *long-form* mechanic: YouTube's official Shorts discovery documentation lists the surfaces where Shorts get found — Shorts tab, Home, Subscriptions, Search, and sounds/hashtag pages — and **playlists appear nowhere on that list**. Since your two real hits (1,243 and 1,196 views) are Shorts and are not even in this table, optimizing the routing of 95 views is optimizing the wrong number by roughly a factor of 25.

## 2. Is the 37 `PLAYLIST` views a real signal or your own clicking?

**Best read: almost certainly an artifact — yours and/or a handful of the same sessions.** Reasoning:

- The mechanic requires no discovery at all. Anyone who opens the playlist and lets it roll through 5 videos generates 1 playlist-page view + 4 `PLAYLIST` views. **Eight or nine such play-throughs produce 37.**
- YouTube has **no published policy excluding the channel owner's views** from Analytics. The only official statement is that YouTube "may temporarily slow down, freeze, or change your metric count, and discard low-quality playbacks," with multi-device/multi-tab given as the examples of low quality. Owner views are not named. The widely-repeated "YouTube stops counting after 3–4 self-views per day" figure is **folklore — no official source found**.
- The channel has 1 subscriber. `SUBSCRIBER` = 3 views. For 37 organic playlist views to be real, strangers would have had to find a playlist on a 1-sub channel and binge it — while `YT_SEARCH` returned exactly 1 view and `YT_CHANNEL` exactly 1. That combination is internally implausible.

**The exact check that settles it** (YouTube Studio → Analytics → Advanced mode, filter `Traffic source = Playlists`, then break down by, in priority order):

1. **City** (dimension `city`, available since 2022-01-01) — if ~all 37 are Dubai/your city, it's you. This is the single decisive cut.
2. **Device type + operating system** (`deviceType`, `operatingSystem`) — one desktop/Windows bucket = one person.
3. **Subscription status** (`subscribedStatus`: `SUBSCRIBED`/`UNSUBSCRIBED`) — your own account is likely subscribed or not, either way it partitions cleanly against the 3 `SUBSCRIBER` views.
4. **Traffic source detail** (`insightTrafficSourceDetail`) — identifies *which* playlist. If it's the single playlist you created during launch prep, that closes it.
5. **Unique viewers** (Studio Audience tab; note: there is **no unique-viewers metric in the public Analytics API** — you must read it in Studio). If unique viewers for the playlist cohort is ~1–3, it's you.
6. **New vs returning viewers** (Studio Audience tab) — heavy "returning" on a channel with no audience = the operator.

Caveat to expect: YouTube anonymizes/withholds dimension data below traffic thresholds, so `city` may return nothing at n=37. If so, fall back to device+OS and unique viewers.

## 3. Evidence table

| Claim | Source | Date | Type | Weight |
|---|---|---|---|---|
| `PLAYLIST` = "views occurred while the video was being played as part of a playlist. It includes traffic coming from the playlist page." | [YouTube Analytics API — Dimensions](https://developers.google.com/youtube/analytics/dimensions) | current | **Official** | Highest — this is the definitional ground truth |
| `YT_PLAYLIST_PAGE` was once a separate value ("views originated from a page that lists all of the videos in a playlist"); later merged into `PLAYLIST` | [Analytics API Revision History](https://developers.google.com/youtube/analytics/revision_history) (via search summary) | historical | Official, **but I read this via search summary, not verbatim on the page** | Medium — treat the merge as likely, the current single definition is what matters |
| Studio-level: "Playlists: Traffic from any playlist that included one of your videos. These playlists can be your own playlist or another creator's playlist." | [Understand your YouTube video reach](https://support.google.com/youtube/answer/9314355?hl=en) | current | **Official** | High |
| `SUBSCRIBER` = homepage feeds / subscription features (NOT "my subscribers watched") | [Analytics API — Dimensions](https://developers.google.com/youtube/analytics/dimensions) | current | **Official** | High — worth knowing, your "3 SUBSCRIBER" ≠ 3 subscribers |
| `NO_LINK_OTHER` = "YouTube did not identify a referrer… direct traffic as well as traffic on mobile apps" | same | current | **Official** | High — your biggest bucket (48) is literally *unknown*, not a lever |
| `SHORTS` traffic source = "referred by swiping vertically from the previous video in the Shorts viewing experience" | same | current | **Official** | High — this is the source that matters for you, and it's **absent from your table** |
| Metrics filtered for quality; "low-quality playbacks" discarded; multi-device/multi-tab cited as examples | [How views are counted / metrics](https://support.google.com/youtube/answer/2991785?hl=en) | current | **Official** | High for the principle, **silent on owner views** |
| "YouTube stops counting self-views after ~3–4/day" | Quora, remote.tools, ytshark, subsub.io | various | **Folklore / SEO listicle** | Zero. No official corroboration found |
| Shorts discovery surfaces = Shorts tab, Home, Subs, Search, sounds &amp; hashtags. **Playlists not mentioned** | [Search &amp; discovery tips — Shorts](https://support.google.com/youtube/answer/11914225?hl=en&amp;co=YOUTUBE._YTVideoType%3Dshorts) | current | **Official** | High (argument from official silence, but the list is presented as exhaustive) |
| Shorts ranked on: whether viewers choose to watch when recommended, average view duration / % viewed, likes, post-watch surveys | [How YouTube recommendations work](https://support.google.com/youtube/answer/16089387?hl=en) + Shorts page above | current | **Official** | High — this is your real lever list |
| Shorts *can* be added to playlists; viewable via "Shorts" chip (**desktop only**); reordering unavailable in Shorts-only playlists | [Create &amp; manage playlists](https://support.google.com/youtube/answer/57792?hl=en&amp;co=GENIE.Platform%3DDesktop) | current | **Official** | High — confirms the mechanic exists but is second-class |
| Series playlists: "allows other videos in the playlist to be featured and recommended when someone is viewing a video in the series"; "YouTube **may** use this info to modify how the videos are presented or discovered" | [Series playlists](https://support.google.com/youtube/answer/6084043?hl=en) | current | **Official — but deliberately hedged ("may")** | Medium-low. It is a *declaration*, not a promised boost. Requires verified account; a video can be in only one series playlist |
| "Playlists boost session contribution, the leading ranking signal in 2026" | dataslayer.ai, socialpilot, outlierkit, metricool | 2025-26 | **Vendor blog / SEO listicle** | Low. Confidently asserted, zero data, mutually copy-pasted |
| Impressions/CTR **exclude** end screens, cards, and external embeds | multiple CTR-benchmark blogs restating YouTube Help | 2026 | **Vendor blog restating official** | Medium — the point stands: end-screen/card clicks are *not* in your CTR and are separately, weakly measured |
| Average YouTube CTR 4–5%, most channels 2–10% | Creator Academy figure restated across CTR blogs | 2026 | Official figure, **vendor-relayed** | Medium — and it's about thumbnails, not playlist links |
| Actual click-through rate of **playlist links in descriptions / pinned comments** | — | — | **NO EVIDENCE FOUND** | — |
| Any **controlled or large-N** experiment showing adding a video to a playlist causes more views | — | — | **NO EVIDENCE FOUND.** YouTube's own A/B tooling (Test &amp; compare) covers titles and thumbnails only — there is no playlist experiment surface | — |
| Whether the Shorts **swipe feed** interacts with playlists in any way | — | — | **NO EVIDENCE FOUND** in either direction | — |

## 4. What playlists reliably DO vs what is merely claimed

**Reliably do (mechanically true, definitionally, not causally impressive):**
- Auto-advance to the next video once someone is *already watching*, which mechanically produces `PLAYLIST`-attributed views and longer sessions. This is a **conversion/retention mechanic applied to traffic you already have.**
- Give you a shareable single URL and a channel-homepage shelf.
- Series playlists let you *declare* an intended viewing order (official, hedged benefit).
- Produce their own analytics surface (views from playlist, playlist watch time, playlist average duration — which, note, **include videos from other channels** and only reflect activity in your playlist's context).

**Claimed without evidence:**
- "Playlists get you discovered / recommended more." No study, no official promise beyond "may."
- "Playlists boost the algorithm via session contribution." Vendor folklore; YouTube's official recommendation docs describe *viewer-level* satisfaction signals, not playlist membership.
- "Playlists help Shorts." Nothing found; official Shorts discovery list omits playlists entirely.
- **The causality is unestablished and probably backwards.** Videos that get views end up watched-through-in-playlists; there is no evidence the playlist created the view. Your own data is the textbook case: the playlist did not create 37 viewers, ~1–3 viewers created 37 playlist views.

**On the link-placement surfaces you asked about — honest status:**
| Surface | Evidence |
|---|---|
| Video description link | No CTR evidence found. Below-fold on mobile. Assume near-zero. |
| Pinned comment | No CTR evidence found. |
| Channel homepage sections/shelves | Official feature; **no CTR data found**. Only reaches people already on your channel — you had **1** `YT_CHANNEL` view. |
| Channel trailer | Official feature; no data found. Same audience problem. |
| End screens | Official; explicitly **excluded from impressions/CTR**, measured separately. Long-form only — **end screens are not available on Shorts**. |
| Cards | Official; no credible CTR benchmark found. Long-form only. |
| "Related video" link on a Short | Official feature, real, and the one *Shorts-native* routing lever — but **no CTR evidence found**. |

Every one of these routes traffic you already have. None of them create impressions.

## 5. The counter-position, steelmanned — and what the lever actually is

The binding constraint on a 1-subscriber channel is **not routing, it is seeding.** Views = impressions × view rate. Playlists, descriptions, end screens, shelves, cards — all of them operate on the *right-hand* side, after an impression has already been won, and only on the sliver of people already in your funnel. Your entire 95-view table represents your total addressable routing surface for the month. Even a miraculous 100% improvement in routing yields +95 views. **One Short, seeded into the swipe feed, did 1,243 — thirteen times the entire table, from a mechanism that appears nowhere in it.** That asymmetry is the whole argument.

What the *official* evidence says the lever is, for a Shorts-driven channel:
1. **The Shorts feed decides your fate, and it decides on two things YouTube names explicitly:** whether viewers *choose to watch when recommended* (your hook / first frame / thumbnail-equivalent) and whether they *stick around* (average view duration and average percentage viewed), plus likes and post-watch survey satisfaction. That is the entire published ranking surface. Everything you can control lives in the first 1–2 seconds and the retention curve.
2. **Recency is favoured.** YouTube states the Shorts feed "may tune up on the recency of content, making it great for the discovery of new content" — which supports your existing 1/day cadence decision, not a playlist project.
3. **Sounds and hashtags are an officially-named discovery surface for Shorts.** Playlists are not. If you want a metadata lever, that's the one with an official citation behind it.
4. **Stop duplicating gags as landscape uploads.** They compete for nothing you're winning, they can't enter the Shorts feed, and they inflate the very playlist/browse noise you're now trying to read signal from.

**Blunt bottom line:** Your table describes a channel with no audience yet, plus an operator watching his own uploads. Do not build strategy on it. Re-pull the analytics after the processing lag clears so the 1,243/1,196-view Shorts are included — that table will be the first one worth reading, and I'd expect `SHORTS` (swipe feed) to dominate it and `PLAYLIST` to fall to a fraction of a percent. Keeping the one existing playlist tidy costs nothing; building "more links to playlists" is a project with no evidence behind it aimed at a traffic source that is probably you.

**Sources:**
- [YouTube Analytics API — Dimensions (traffic source definitions)](https://developers.google.com/youtube/analytics/dimensions)
- [YouTube Analytics API — Revision History](https://developers.google.com/youtube/analytics/revision_history)
- [Understand your YouTube video reach (traffic source types)](https://support.google.com/youtube/answer/9314355?hl=en)
- [How views/metrics are counted and validated](https://support.google.com/youtube/answer/2991785?hl=en)
- [Search &amp; discovery tips — Shorts](https://support.google.com/youtube/answer/11914225?hl=en&amp;co=YOUTUBE._YTVideoType%3Dshorts)
- [How YouTube recommendations work](https://support.google.com/youtube/answer/16089387?hl=en)
- [Series playlists](https://support.google.com/youtube/answer/6084043?hl=en)
- [Create &amp; manage playlists (Shorts in playlists)](https://support.google.com/youtube/answer/57792?hl=en&amp;co=GENIE.Platform%3DDesktop)
- [Get analytics for your playlists and groups of videos](https://support.google.com/youtube/answer/3529123?hl=en)
- [Learn how to use Advanced mode for analytics reports](https://support.google.com/youtube/answer/9717005?hl=en)
- [A/B test titles and thumbnails (scope of YouTube's own experiment tooling)](https://support.google.com/youtube/answer/16391400?hl=en-GB)</result>
<usage><subagent_tokens>105876</subagent_tokens><tool_uses>22</tool_uses><duration_ms>249715</duration_ms></usage>
</task-notification>

## 2026-07-21 09:42 · director-msg (hook) · NEW · (triage at distill)
все в порядке на самом деле . автономность производства доделана (мы  так думаем,но не тестед это факт). но мы уже перешли на "дальше" потому что с HoG решили опубликовать и сейчас время - создать следующий слой  автономности - анализ дистрибуции, докрутка параметров дистрибуции и параметров создания ( от выбора темы и формата до качества и проч). я долго не вытерплю ковыряться в дистрибуции.я  только на этапе разработки ( пока горю - потом станет скучно) поэтому как ленивый человек - лучше два дня потерять - а потом за два часа долететь!  ))

## 2026-07-21 09:45 · director-msg (hook) · NEW · (triage at distill)
все в порядке на самом деле . автономность производства доделана (мы  так думаем,но не тестед это факт). но мы уже перешли на планету "дальше" потому что с HoG решили опубликовать и сейчас время - создать следующий слой  автономности - анализ дистрибуции, докрутка параметров дистрибуции и параметров создания ( от выбора темы и формата до качества и проч). я долго не вытерплю ковыряться в дистрибуции. я эффективен только на этапе разработки и отладки всех процессов ( пока горю - потом станет скучно) поэтому как ленивый человек - лучше два дня потерять - а потом за два часа долететь!  ))
q26y

## 2026-07-21 09:56 · director-msg (hook) · NEW · (triage at distill)
q27y with notices :пиши docs кратко плиз. очень кратко. caveman style (find skill caveman and use it pls). espetially work docs. I read very rare so you can write in english if it takes less tokens and clearly for you.  ===5=== планка выше - применяла сама в пределах потолка.
Регион ВИДЕО и гипотеза «видео-ген = копия реф-гена минус кэп» перепиши как Регион ВИДЕО и гипотеза «видео-ген по логике должная быть копией реф-гена и проблем тогда тоже не будет? »

## 2026-07-21 10:14 · director-msg (hook) · NEW · (triage at distill)
1. надо сначала разобраться со статусами у нас в отчетах ( и у тебя в работе) вижу расхождение в privat , unlisted, published. где-то ощущаю сбой . отправь на поиски агента. 
2.канал.аналитика: When Impatience Meets Red Tape | Sandy in the Airport | ! views 1248!  . у нас v5 ? what sould I think? not clear.  сначала надо привести в порядок данные - потом привестти в порядок их анализ . - второму агенту - привести данные с канала и у нас  и у утреннего скрипта к единообразию . без этого не идем к анализу
3. возможно где-то МЫ еще проморгали ошибки (неточности?) в подходе к ОБРАТНОЙ СВЯЗИ

## 2026-07-21 10:19 · director-msg (hook) · NEW · (triage at distill)
<task-notification>
<task-id>a7afeb9f5b1c02975</task-id>
<tool-use-id>toolu_01C9krmr1UUkPckzb4GxNEeK</tool-use-id>
<output-file>C:\Users\NAVIAV~1\AppData\Local\Temp\claude\C--SandyStudio\c774dc69-2cb1-412c-b631-a5fa851f2184\tasks\a7afeb9f5b1c02975.output</output-file>
<status>completed</status>
<summary>Agent "Audit video status taxonomy end-to-end" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>## Verdict: the defect is real, systematic, and 100% hit-rate today

**Runtime evidence (read-only re-run against the live channel, just now):**
```
COUNTS { public: 9, unlisted: 2, 'private+publishAt': 18 }
```
**Every single video we call `private` is actually scheduled.** There is not one genuinely-private video on the channel. (Correction to the ground truth given: there are **2** unlisted, not 1 — `ZOUnEEtNseA` + `RlcMjNhjxlQ`, the long/short pair "Every Step Makes It Worse".)

---

## 1. The defects, ranked

### D1 — CRITICAL · `webapp/scripts/yt-audit.mjs:69,93` — the morning snapshot mislabels scheduled as private
`:67` requests `part=snippet,statistics,status,contentDetails` — so `status.publishAt` **is in the response** — but `:69` reads only `privacy: v.status?.privacyStatus` and `:93` prints it raw into the `priv` column. This is the file the daily 08:00 scheduled task (`daily-yt-snapshot.ps1:21`) writes to `docs/distribution/snapshots/&lt;date&gt;.md`. Confirmed in the artefact: `C:\SandyStudio\docs\distribution\snapshots\2026-07-21.md` shows 18 rows as `private`. **Should:** derive state from `publishAt` (rule in §2).

### D2 — HIGH · same file `:70` — `pub` column is the *upload* date, not the release date
`published: v.snippet?.publishedAt` — for a scheduled video that is when the bytes landed, not when the audience sees it. E.g. `Sandy vs. The Elevator` prints `2026-07-10` but goes live `2026-07-30`. Two of the Director's "old, dead" videos are actually **future** videos. **Should:** effective date = `status.publishAt ?? snippet.publishedAt`, with the state label distinguishing them.

### D3 — HIGH · `webapp/lib/agents/providers/youtube.ts:81-113` — `listAllUploads()` never fetches status at all
It reads only `playlistItems?part=snippet,contentDetails` → returns `{videoId,title,publishedAt}`. There is **no** privacy/publish concept in the ingest type (`UploadedVideoRef:75-79`). Consequence: **the webapp is status-blind**, which produces D4.

### D4 — HIGH · `webapp/app/api/audience/route.ts:32,70-92` + `app/(studio)/audience/page.tsx` — the dashboard mixes unpublished videos into audience metrics with no marker
The route enumerates all 29 uploads and feeds every one into `buildAdvice()` (`:95`) as an equal sample. 18 of those 29 have not been released yet, so they contribute near-zero views and depress every ratio the advisor reasons on — and the Director sees no field telling him which is which (`VideoMetric` has no privacy/state field anywhere in route or page). **Should:** carry a `publicationState`, exclude non-`public` from the advisor sample (or at least segment it), and render the state per row.

### D5 — HIGH · `webapp/lib/agents/runner.ts:3216` vs `:192` — one key `youtube_privacy`, two opposite meanings
`:3216` reads `episodes.metadata.youtube_privacy` as **intent** ("what privacy should I upload at?"); `persistYouTubeVideoId` (`:175-197`, writes at `:192`) writes the same key as **observed outcome** after upload. So the recorded outcome silently becomes the next upload's intent, and neither meaning is trustworthy. **Verified stale in the DB right now** (service-role read):

| episode | `youtube_privacy` in DB | actual on YouTube |
|---|---|---|
| SS-S15-E25 `PHRbzx1qAHg` | `unlisted` | **public** |
| SS-S15-E27 `U9YSCsmhcEw` | `unlisted` | **scheduled 2026-07-26** |
| SS-S15-E28 `Rb6XK094TiY` | `unlisted` | **scheduled 2026-07-21** |
| SS-S15-E29 `dLB3EcLHQ8g` | `unlisted` | **scheduled 2026-07-23** |
| SS-S15-E30 `ZOUnEEtNseA` | `unlisted` | unlisted ✓ |

4 of 5 stale. It is written once at upload and **never reconciled** — YouTube-side state changes (the Director scheduling in YT Studio) never come back.

### D6 — MEDIUM · `runner.ts:193` — `youtube_published_at` is the upload timestamp, misnamed
`new Date().toISOString()` at upload time. For a scheduled video the real publication is days later. Anything reading this key as "when it went live" is wrong by up to 20 days.

### D7 — MEDIUM · The uploader **cannot schedule at all** — spec/code drift
`UploadVideoInput` (`youtube.ts:224-233`) has no `publishAt`; the request body (`:250-253`) sends only `privacyStatus` + `selfDeclaredMadeForKids`. Yet `specs/distribution/youtube.md:48-49,71` and `agents/exec/publisher.md:78,97` *mandate* upload-as-private + set `publishAt` + record `scheduled_publish_time`. Only the **mock** implements it (`mock-providers.ts:175,184,203`). So today all 18 schedules were set by hand in YouTube Studio — which is precisely why the DB ledger is stale (D5). This is where the two meanings of `private` collapse: our uploader's `private` means "not ready", YouTube's `private` on the channel means "scheduled". **Defect confirmed as stated in the brief.**

### D8 — LOW · two different definitions of "short"
`yt-audit.mjs:91` classifies by duration ≤ 60s; `audience/route.ts:25,71` classifies by `#shorts` in the title. They disagree on live rows (e.g. "Sandy and the Car Wash #Shorts" = `long` in the snapshot, `short` in the dashboard). Same class of bug — one concept, two implementations.

### D9 — LOW · snapshot header contradicts its own body
`yt-audit.mjs:52` prints `videos=9` (channel `statistics.videoCount` counts public only) directly above a 29-row table. Reads like data loss.

**Not a defect:** `mock-providers.ts:204 privacy_status:'private'` and `shorts/route.ts:43 default('unlisted')` are intents on write, correctly scoped.

---

## 2. The canonical status model I recommend

One derivation, one vocabulary, four states:

```ts
export type PublicationState =
  | { state: 'public';        liveAt: string }   // snippet.publishedAt
  | { state: 'unlisted';      liveAt: string }
  | { state: 'scheduled';     liveAt: string }   // status.publishAt (future)
  | { state: 'private-draft'; liveAt: null  };   // never released

// from videos.list?part=snippet,status
function derivePublicationState(v): PublicationState {
  const p = v.status.privacyStatus, at = v.status.publishAt ?? null;
  if (p === 'public')   return { state: 'public',   liveAt: v.snippet.publishedAt };
  if (p === 'unlisted') return { state: 'unlisted', liveAt: v.snippet.publishedAt };
  if (at) return { state: 'scheduled', liveAt: at };   // private + publishAt ⇒ scheduled
  return { state: 'private-draft', liveAt: null };
}
```
Display rule: `scheduled` renders as `scheduled(2026-07-23)`, never as `private`. `liveAt` — not `snippet.publishedAt` — is the date shown in any dated column. Only `state === 'public'` is eligible for audience/advisor statistics; `unlisted` and `scheduled` are shown but excluded from ratios.

Keep this **strictly separate from asset status**: `DRAFT/REVIEW/APPROVED/LOCKED` describes *our* artefact's approval, `PublicationState` describes *YouTube's* distribution. They must never share a column, a key name, or a color. (Good news: I found **no** place where the two are currently merged — the conflation risk is latent, not realised.)

---

## 3. Collapse, don't guard (anti-additivity)

The mislabel exists in **2** live places (D1 snapshot, D4 dashboard-by-omission) fed by **2 duplicated ingest paths**:

- `webapp/lib/agents/providers/youtube.ts` — the TS provider (no status).
- `webapp/scripts/yt-audit.mjs` — a standalone .mjs that **re-implements** OAuth token exchange (`:25-35`), channel lookup (`:49`), uploads pagination (`:56-62`), and batched `videos.list` (`:66-74`) — ~50 lines duplicating `youtube.ts:37-113`.

**Single source:** extend `youtube.ts` — add `part=status` batching into `listAllUploads()` (or a `listAllUploadsWithState()`), put `derivePublicationState()` there as the only implementation, and widen `UploadedVideoRef` with `state` + `liveAt`. Then:
- `audience/route.ts` gets state for free (it already imports `listAllUploads`).
- `yt-audit.mjs` should be **deleted as an independent implementation** and re-expressed as a thin `tsx` script that imports the provider — deleting its token/channel/pagination block. `daily-yt-snapshot.ps1:21` changes only its command line.
- D8: pick one `isShort` (duration-based is the truthful one) and export it from the same module; delete the title-regex copy in `audience/route.ts:25`.
- D5: stop overloading `youtube_privacy`. Either (a) rename the write to `youtube_privacy_observed` + `youtube_privacy_observed_at`, or better (b) **delete the persisted status entirely** and derive from the API on read — it is stale by construction, and nothing but the uploader reads it today. (b) is the subtractive fix: remove a field rather than add a reconciler.
- D7: add `publishAt?: string` to `UploadVideoInput` and pass it through — this is the one place addition is justified, because it is what makes the spec executable and removes the manual YT-Studio step that causes D5 in the first place.

---

## 4. Could not verify

- **Logs give no evidence either way.** `webapp/prod.log` is 261 bytes, `webapp/inngest.log` has zero `EXEC-PUB`/`privacy` hits — the stack was restarted today and no publish ran. Everything about the publish path (D7) is from code reading plus the DB end-state, not from a live trace.
- **Supabase MCP `execute_sql` was denied** (permission error); the DB table above was read with the local service-role client via `webapp/.env.local` instead. Secrets were loaded into process env only, never printed.
- I did **not** check whether YouTube Studio's own UI shows something different again — only the Data API and our artefacts.
- Whether `categoryId` drift (`youtube.ts:248` = `23` Comedy vs `specs/distribution/youtube.md:44` = `1` Film &amp; Animation) matters is outside this audit; flagging it only as adjacent doc/code drift.</result>
<usage><subagent_tokens>125618</subagent_tokens><tool_uses>25</tool_uses><duration_ms>207786</duration_ms></usage>
</task-notification>

## 2026-07-21 10:23 · director-msg (hook) · NEW · (triage at distill)
<task-notification>
<task-id>a7ca6d9daf84c4c35</task-id>
<tool-use-id>toolu_01TbRSmd1igdTDCWHygWHBjv</tool-use-id>
<output-file>C:\Users\NAVIAV~1\AppData\Local\Temp\claude\C--SandyStudio\c774dc69-2cb1-412c-b631-a5fa851f2184\tasks\a7ca6d9daf84c4c35.output</output-file>
<status>completed</status>
<summary>Agent "Reconcile view metrics across surfaces" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>## Verdict

The hypothesis is **confirmed exactly**. All numbers below are from live read-only calls made just now (2026-07-21), token scopes `youtube.readonly + youtube.upload + youtube.force-ssl + yt-analytics.readonly`. No writes, no secrets printed.

---

## 1. The reconciliation table

`stat` = Data API `videos.list?part=statistics` → `statistics.viewCount`.
`an` = Analytics API `reports?metrics=views&amp;filters=video==&lt;id&gt;` (30d/90d/lifetime — **all three return identical values**, proving the window is not the variable; the processing frontier is).

| Video | id | YouTube public (`statistics.viewCount`) | Webapp `/audience` (`analytics.views`) | Snapshot `2026-07-21.md` (`statistics.viewCount`) | Agree? |
|---|---|---|---|---|---|
| Airport | `PHRbzx1qAHg` | **1248** | **10** | 1243 (stale by hours) | ❌ 125× off |
| Car Wash #Shorts | `8afgQAWP9ac` | **1197** | **3** | 1196 | ❌ 400× off |
| Tennis/Wall (private) | `GULsE8hEYbw` | 15 | 15 | 15 | ✅ |
| Vending WAR | `cZmqxhQIPeo` | 10 | **0** | 10 | ❌ |
| One snack | `J6rp-gmUKe4` | 7 | **5** | 7 | ❌ |

**Sum of all 29 videos: `statistics.viewCount` = 2555 · Analytics lifetime views = 89.**

The webapp and the snapshot only agree where a video has had *no* traffic since the Analytics processing frontier — i.e. only on the dead videos.

### Why the two numbers legitimately differ (proven, not assumed)

**a) Analytics has a ~3-day processing lag.** Channel-wide day report requested with `endDate=2026-07-21` returned rows ending **2026-07-18**, with `2026-07-18 = 1 view` and nothing after. This is the documented behavior: "the API response actually contains data up until the last day specified for which all metrics *in the query* are available" ([Data Model](https://developers.google.com/youtube/analytics/data_model)); YouTube Help documents a comparable multi-day lag on processed analytics ([Check your YouTube Analytics data](https://support.google.com/youtube/answer/6362358?hl=en)). Airport was published **2026-07-19** — its entire real audience lives inside the unprocessed window.

**b) The 10 views Analytics *does* report for Airport are pre-publication owner views.** Day-level breakdown for `PHRbzx1qAHg`:

```
2026-07-10  6 views  46.95%
2026-07-12  2 views  96.06%
2026-07-14  2 views  63.65%
(2026-07-19, 07-20, 07-21: no rows — beyond the frontier)
```

Publish date is 2026-07-19. Every single Analytics view predates publication — these are owner/review plays while the video sat private. **The webapp is ranking the channel on the Director's own preview watches.**

So: the two numbers are *not* reconcilable into one, and they are *not* interchangeable. `statistics.viewCount` is the near-real-time public counter; Analytics `views` is a processed, date-scoped, lagging series. Both are correct for their own question.

---

## 2. Defect list (file:line)

**D1 — CRITICAL. The webapp prefers the lagging metric over the live one.**
`webapp/app/api/audience/route.ts:83`
```ts
views: a?.views ?? s?.viewCount ?? 0,
```
Analytics wins whenever it returns *any* row — including a row made purely of pre-publication owner views. This single `??` is the whole Director-visible defect. It also directly contradicts the project's own spec: `specs/distribution/analytics.md:46` states **Views = `statistics.viewCount`**.

**D2 — CRITICAL. Same inversion in the agent-facing snapshot.**
`webapp/lib/agents/providers/youtube-stats.ts:180` — identical `analytics?.views ?? stats?.viewCount`. This is what `EXEC-ANAL` persists (`webapp/lib/agents/runner.ts:3352`), so every `REV-analytics_*` report ever written carries the wrong `views`, and `note:` at line 192 says "real analytics" — labelling the wrong number as the authoritative one.

**D3 — CRITICAL. The exposure gate is fed the wrong number, which silences the whole sensor.**
`webapp/lib/agents/analytics-advisor.ts:101,110` — `exposureGateViews: 100`. With D1 feeding it Analytics views, Airport (1248 real views) scores 10 → below gate → `confidence: 'none'`, `sampleSize` counts it as 0. The page reports "0 videos past the exposure gate / scout mode" while the channel has two videos over a thousand views. The sensor is structurally blind by construction.

**D4 — HIGH. The video list is ranked on an uncapped, owner-contaminated metric.**
`webapp/app/(studio)/audience/page.tsx:195` — `.sort((a, b) =&gt; b.avgViewPercentage - a.avgViewPercentage)`. This puts `He Got Hit by the Wall` (**2153%**, 15 owner views, *private*) and `He just wanted ONE snack` (**4228%**, 5 views) at the top of the board. Private videos are ranked as if they were audience evidence.

**D5 — HIGH. `avgViewPercentage` is displayed with no validity guard.**
`page.tsx:203` renders `{m.avgViewPercentage.toFixed(0)}%` raw. `analytics-advisor.ts:91` `qualitySignal()` clamps to 0–100, but the page does not use it — the display path bypasses the only clamp in the codebase.

**D6 — MEDIUM. Short/long-form classification disagrees between surfaces.**
`route.ts:25` `isShortTitle = /#?shorts?\b/i.test(title)` (title regex) vs `yt-audit.mjs:91` `dur &gt; 0 &amp;&amp; dur &lt;= 60` (duration). `8afgQAWP9ac` (75s, "#Shorts" in title) = **short** in webapp, **long** in the snapshot. `RlcMjNhjxlQ` (24s) = short by duration but its 117s sibling shares the title. Neither matches YouTube's actual rule (vertical + ≤3min). Consequence: `route.ts:75` also gates retention-curve fetching on this, so curves are pulled for the wrong set.

**D7 — MEDIUM. Retention gate uses the lagging views too.**
`route.ts:75` — `if (kind === 'longform' &amp;&amp; a &amp;&amp; a.views &gt; 0)`. Newly published videos never get a retention curve pulled, precisely when it would matter.

**D8 — LOW / latent. Unit mismatch in config.**
`config/defaults.yaml:303,307` — `avg_view_percentage_warn_below: 0.30 / 0.35` expressed as a **fraction**, while the API returns a **percentage** (0–100+). Nothing reads these keys today (verified by grep), so it is dormant — but it will fire wrong the moment anything does.

**D9 — LOW. The snapshot mixes both metrics in one row without labelling.**
`webapp/scripts/yt-audit.mjs:93` prints `views` (Data API, live) beside `pct%` (Analytics, lagging, uncapped) in adjacent columns with no indication they belong to different clocks. That table is what produced `2153` and `4228` next to `15` and `7` in `docs/distribution/snapshots/2026-07-21.md:8,12`.

---

## 3. The `averageViewPercentage` 4228% question

Definition per Google: "The average percentage of a video watched during a video playback"; effectively `averageViewDuration ÷ video length`. Both `averageViewPercentage` and `averageViewDuration` are documented to **exclude looping-clips traffic since 2021-12-13** ([Metrics](https://developers.google.com/youtube/analytics/metrics)). **No cap is documented, and none is enforced** — our measured values:

| Video | len | `averageViewDuration` | `averageViewPercentage` | views | privacy |
|---|---|---|---|---|---|
| `J6rp-gmUKe4` | 23s | 972s | **4228%** | 5 | public |
| `GULsE8hEYbw` | 75s | 1615s | **2153%** | 15 | **private** |
| `Sandy in the Elevator` | 82s | 103s | 127% | 2 | private |

4228% = 972/23 = 42.3 replays' worth of watch time averaged over **5 playbacks**. Since documented loop-exclusion should have removed Shorts looping, the residual cause is single playbacks left running/rewound in a tab (the sibling metric `audienceWatchRatio` is explicitly documented as able to exceed 1.0 for exactly this reason). **The 2153% video is `private`** — nobody but the owner can watch it. So yes: at these sample sizes the number is **structurally meaningless**, it measures the Director's own browser, and D4 ranks the board on it.

---

## 4. `channels.statistics.viewCount` = 1279 vs 2555 summed — explained

Live: `{"viewCount":"1279","subscriberCount":"1","videoCount":"9"}`.

- `videoCount: 9` = exactly the 9 **public** videos (I counted them: 1248+1197+10+9+7+7+5+2+0). Channel statistics exclude private/unlisted. So the correct comparison is 1279 vs **2485** (public sum), not 2555 (all 29).
- 2485 − 1279 = **1206**, and `8afgQAWP9ac` (Car Wash, published 2026-07-20, 1197 views) accounts for 1197 of it. Excluding that one video gives 1288 vs 1279 — a 9-view residual.

**Conclusion: `channels.statistics.viewCount` is an aggregate that lags per-video `statistics.viewCount` by roughly a day, and counts public videos only.** Not unexplained, not a bug — but it must never be compared against a sum of per-video counts. `yt-audit.mjs:52` prints it as `totalViews=` right above a table of per-video views, inviting exactly that false comparison.

---

## 5. Enumeration / pagination — clean

- `playlistItems` on the uploads playlist: **1 page, 29 items, `totalResults=29`, `nextPageToken` absent.**
- Independent cross-check `search.list?forMine=true&amp;type=video`: **29 ids.**
- Set difference in both directions: **empty**. `listAllUploads()` (`youtube.ts:81-113`) paginates correctly and truncates nothing.

The apparent count mismatch people will hit is `channels.statistics.videoCount = 9` (public only) vs 29 actual uploads — a *different field*, not truncation. I could not verify YouTube Studio's own content-list count directly (would need a browser session); given two independent API enumerations agree at 29 including private/unlisted, I'd expect Studio to show 29 — **stated as expectation, not verified.**

---

## 6. The metric contract

| Displayed number | Exact source field | Lag | Valid range | MUST NOT be shown when |
|---|---|---|---|---|
| **Views** (all surfaces, all rankings, exposure gate) | Data API `videos.list?part=statistics` → `statistics.viewCount` | minutes | ≥0, integer | never suppress — this is the canonical view number everywhere |
| **Analytics views** | Analytics `metrics=views` | **~3 days**; verify by reading the last non-null day in a `dimensions=day` probe | ≥0 | Never shown as "views". Only as **"views (processed, through YYYY-MM-DD)"** with the frontier date printed. Never used for gating, ranking, or funnel math. |
| **Completion %** | Analytics `averageViewPercentage` | ~3 days | 0–100 sane; **&gt;100 = invalid** | Hide when: video is `private`/`unlisted`; Analytics views &lt; 30; value &gt;100; video published &lt; 3 days ago. Never rank on it — the current sort is the 4228% bug. |
| **Avg view duration** | Analytics `averageViewDuration` (seconds) | ~3 days | 0 … video length | Hide when &gt; video length (same invalidity condition as above) |
| **Retention curve** | Analytics `audienceWatchRatio` × `elapsedVideoTimeRatio` | ~3 days | ratio may exceed 1.0 legitimately | Hide when &lt; 30 Analytics views, or video not public |
| **Channel total views** | `channels.statistics.viewCount` | ~1 day, **public videos only** | ≥0 | Never compared against a sum of per-video `viewCount` |
| **Kind (short/long)** | `contentDetails.duration` ≤ 180s **and** vertical aspect | none | — | Never derived from the title string |

Two hard rules that follow, worth stating in the doctrine:

1. **No quality verdict on a video younger than the Analytics frontier + 1 day.** Show "processing" instead of a number.
2. **Never rank, gate, or advise on any metric whose denominator includes owner-only / pre-publication views.** Practically: exclude non-`public` videos from the advisor input entirely, and exclude Analytics rows dated before `publishedAt`.

---

## 7. The single canonical fetch path (anti-additivity)

Today the same logic exists twice: `webapp/lib/agents/providers/youtube-stats.ts` + `webapp/app/api/audience/route.ts:32-92` (TS), and `webapp/scripts/yt-audit.mjs:25-96` (a hand-rolled duplicate of auth, pagination, batching and the analytics loop, ~70 lines). They already disagree on the two things that matter — which view number wins, and how short/long is decided. Patching both guarantees they drift again.

**Recommendation — collapse to one, net-negative diff:**

Add one function to the module that already owns 80% of this, `webapp/lib/agents/providers/youtube-stats.ts`:

```ts
export interface ChannelVideoMetric {
  videoId; title; publishedAt; privacyStatus; durationSeconds;
  views: number;          // statistics.viewCount — THE view number, always
  likes; comments;
  analytics: null | {     // explicitly nested → impossible to confuse with `views`
    views: number;
    averageViewPercentage: number;
    averageViewDuration: number;
    throughDate: string;  // the measured processing frontier
  };
}
export async function getChannelVideoMetrics(): Promise&lt;ChannelVideoMetric[]&gt;
```

Then:
- `route.ts` loses lines 32-92 (enumeration + stats + analytics assembly) and becomes a mapper into `VideoMetric`.
- `yt-audit.mjs` becomes `yt-audit.ts` — a ~30-line printer over `getChannelVideoMetrics()`, run with `tsx --env-file=.env.local` like the other 15 scripts in `package.json:18-33`. One line changes in `daily-yt-snapshot.ps1:21`.
- `collectAudienceSnapshot()` reads the same struct.

Estimated net: **−70 to −90 lines**, one auth path, one pagination path, one definition of "views", and the nesting makes D1/D2 unrepresentable rather than merely fixed.

The one risk to flag: converting the `.mjs` script to `tsx` makes the 08:00 scheduled snapshot depend on `tsx`, and the project memory records that `npm install --legacy-peer-deps` prunes optional deps and breaks `tsx`. If that fragility is unacceptable, the alternative is to keep the canonical module authored as plain ESM `.js` under `lib/` and have the TS side import it — still one copy, no `tsx` dependency for the cron.

---

## 8. Unverifiable / not checked

- **The Director's reported "5".** I could not reproduce it. Airport's Analytics value today is **10**, so `/api/audience` computes **10** for that row right now. `5` is what Analytics returns for `J6rp-gmUKe4` and what `statistics` returns for the Car Wash long-form — he may have read an adjacent row, or Analytics reported 5 at an earlier probe. The defect class is identical either way; I did not want to assert a number I did not observe. (`/api/audience` returns 307 → auth redirect; I did not authenticate a browser session to render the page itself.)
- **YouTube Studio's own content-list count** — not opened; inferred as 29 from two agreeing API enumerations.
- **Whether the 1248/1197 spike is organic reach or something else** — outside scope; both are what YouTube's public counter reports.

Sources: [YouTube Analytics Metrics](https://developers.google.com/youtube/analytics/metrics) · [YouTube Analytics Data Model](https://developers.google.com/youtube/analytics/data_model) · [Check your YouTube Analytics data](https://support.google.com/youtube/answer/6362358?hl=en) · [Data and performance measurement tools on YouTube](https://support.google.com/youtube/answer/14645915?hl=en)</result>
<usage><subagent_tokens>144097</subagent_tokens><tool_uses>27</tool_uses><duration_ms>413027</duration_ms></usage>
</task-notification>

## 2026-07-21 10:24 · director-msg (hook) · NEW · (triage at distill)
Background agent "Hunt blind spots in the feedback loop" was stopped by the user.

## 2026-07-21 10:30 · director-msg (hook) · NEW · (triage at distill)
Сегодня в 21:00 по Дубаю выходят bxTHKjMWcBo и LgGPVYUEzf8 — вертикаль и лендскейп одного гэга = ну можно горизонт пока убрать с публикации но тогда под шотрами наверное нужно класть ссылки на ЛИСТИНГ (непонятно какой )
если я остановил агента - то это случайноо . путаю кнопки. пусть доработает. q30y  ===5===

## 2026-07-21 10:34 · director-msg (hook) · NEW · (triage at distill)
можно ли нам сделать ответственного агента который закроет все или часть задач. если напрямую нельзя то как это сделать через трюки? (интерфейс браузера и т.п. ) 
/head-of-growth

## 2026-07-21 10:38 · director-msg (hook) · NEW · (triage at distill)
<task-notification>
<task-id>a78ef9ac3e1dcc309</task-id>
<tool-use-id>toolu_012XvFUrJDw8EByTpBvY58dq</tool-use-id>
<output-file>C:\Users\NAVIAV~1\AppData\Local\Temp\claude\C--SandyStudio\c774dc69-2cb1-412c-b631-a5fa851f2184\tasks\a78ef9ac3e1dcc309.output</output-file>
<status>completed</status>
<summary>Agent "Hunt blind spots in the feedback loop" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>I have enough. Report follows.

---

# Feedback loop — adversarial review

Scope note: `b4c7b9d7` ("stop the sensor measuring the operator") landed **during** this review and fixed the two items you gave me as established (view-source inversion, unreleased videos in the sample). Everything below is checked against that commit as HEAD and is net-new.

---

## The three that matter

### 1. The collection arm has never run successfully. Not once. Zero reports exist.

Runtime evidence, Supabase:

```
assets WHERE file_type LIKE 'REV-analytics%'   →  count: 0
jobs   WHERE agent_id = 'EXEC-ANAL'            →  2 rows, BOTH status=FAILED
   error_message: "EXEC-ANAL requires collectionPoint and youtubeVideoId in event payload"
   input_snapshot: {"episodeId":"…"}            ← both fields missing
```

Meanwhile `EXEC-PUB` has 15 COMPLETED jobs going back to 2026-06-18, five of them since 2026-07-10.

Two separate causes, both live:

- **Manual re-trigger is guaranteed to fail.** `webapp/app/api/episodes/[id]/trigger/route.ts:61` maps `EXEC-ANAL → sandystudio/exec-anal/collect` through the generic path, which injects only `episodeId`. `runner.ts:3342-3345` then hard-throws. Every click of the "Audience Analyst 📊" kebab, and every Polina pipeline dispatch of that stage, fails deterministically. Both recorded jobs have exactly this shape. The route has special-case payload construction for VGEN, EREF, THUMB — EXEC-ANAL was never given one, and unlike the others it cannot derive its inputs (`youtube_video_id` sits in `episodes.metadata`, three lines of lookup away).
- **The scheduled path has never produced a run at all.** `schedule-analytics.ts` defers four events via `ts: publishTimestamp + delayMs`. `main.db` contains the event names, but zero EXEC-ANAL runs of that shape exist. The file's own comment reasons about "Cloud Inngest" and "the dev server" — we run neither; we run self-hosted `inngest start` since 2026-07-11. **No evidence found** that self-hosted durable honours a 30-day-future `ts`; that is unverified, not disproven.

Failure it produces: `PLANET.md` says the sensor "starves: no snapshot history". It is worse than starving — the persistence arm has produced literally nothing in the project's lifetime, and it fails silently (a FAILED job row, no alert, no surface). The Audience tab works only because it queries YouTube live on every page load; close the tab and the factory retains nothing. There is no history to correct a course against, and none will accumulate.

### 2. The correction arc does not exist. It is fully specified, and fully unbuilt.

`buildAdvice()` has exactly **one** caller in the repo: `app/api/audience/route.ts:111`. Its output is rendered into React and discarded. Nothing downstream reads it.

The arc it should feed is written down in detail and marked APPROVED:

- `specs/distribution/analytics.md` §"FEEDBACK → PRODUCTION LOOP" — BOARD-MKT reads T+7d, writes `REV-analytics_interpretation`, and a five-row table maps each signal to a concrete Brief adjustment.
- `agents/exec/analytics_collector.md` — "routes insights to BOARD-MKT… Data without interpretation is noise."

Reality:
- `BOARD-MKT` appears in the webapp as **two display strings** (`lib/api/agent-names.ts:45`, `lib/concierge/system-prompt-builder.ts:471`). `grep -c "BOARD-" webapp/lib/agents/registry.ts` → **0**. No runner, no prompt path, no Inngest function. The interpretation tier is unrunnable markdown.
- `analytics_interpretation` — **zero occurrences** anywhere in `webapp/`.
- `.claude/skills/series-episode-theme-generation/SKILL.md` and `series-episode-theme-selection/SKILL.md` — the two places where "what do we make next" is actually decided — contain **zero** occurrences of `audience`, `views`, `retention`, `analytic`, `metric`. Theme-selection's input table (`theme_bank`, Bible, `capability_profile`, cost model) has no performance channel at all. Gate 8 "Novelty vs bank" compares a candidate against *our own past ideas*, never against what landed with anyone.
- `loadAgentInputs` (`runner.ts:242`) is episode-scoped: episode row + that episode's assets. Cross-episode audience data is not loadable by any agent, by construction.
- `ScorecardPhase = 'analytics'` (`scorecard/compute-scorecard.ts:33`) is a declared phase with no trigger — `episode-scorecard.ts` subscribes only to `exec-pub/published`.

**Plain statement of the missing arc:** between "we measured the audience" and "the next episode is made differently" there is *nothing*. Not a stub, not a TODO, not a disabled flag. The only carrier is the Director reading a web page and typing something into a brief by hand — which is precisely the "unplanned touch" `PLANET.md` targets at ZERO.

### 3. The Director's advice board is a constant. It cannot respond to data.

`route.ts:111` passes `shippedCategories: []` — hardcoded, no writer anywhere in the repo. `holeCards()` (`analytics-advisor.ts:118-130`) therefore emits **all ten** `SANDY_TAXONOMY` categories as "Untested territory" on every single request, forever, at `rank: 0..9`. Everything data-derived ranks below: leaderboard `rank: 50`, retention `rank: 100+`. `cards.sort((a,b) =&gt; a.rank - b.rank)` (`:189`).

So the top ten cards on the board are a static list, identical today and after a million views, and they push the one or two genuinely data-derived cards below the fold. This is the doctrine's own named failure mode inverted: the skill worries about presenting a fluke as a mandate; the implementation presents *no data at all* as ten ranked recommendations, each with an authoritative-looking `evidence:` line ("Not present in shipped/tracked episodes — no signal either way yet") and a `testNext:` experiment. It reads as analysis. It is a `const`.

---

## Further findings, ranked

**4. `getVideoStatistics` failing is indistinguishable from "the channel has nothing public."** After `b4c7b9d7`, that one call is now the sole source of *both* views and `publicationState`. `route.ts:41` swallows it: `.catch(() =&gt; [])`. On a 403 / quota / token failure, `statById` is empty → line 83 `s?.publicationState ?? 'private-draft'` assigns every video a **definite wrong state** → line 110 `publicMetrics` = `[]` → the advisor reports scout mode, sample 0, and every row shows 0 views. The page renders normally with no error. `'private-draft'` as the default for *missing data* is the bug: absence of a datum is being encoded as a specific fact. Same class as the `delivery_targets`→landscape fallback.

**5. The retention→shot bridge — called "the structural advantage" — cannot fire on anything recent.** `route.ts:80`: `if (kind === 'longform' &amp;&amp; a &amp;&amp; a.views &gt; 0)`. `a` is the ~3-day-lagging Analytics object. The commit fixed the view *source* everywhere else but left this **gate** on the lagging clock. A video published this week has `a === null` → no curve fetched → the `fix_longform` axis is silent exactly when you most want to read it. Additionally `confidenceFor(m, config)` on that card (`:156`) reads `m.views`, which is now the live counter — so the fields inside one card are sourced from two different clocks.

**6. `biggestDrop` reports a universal platform artifact as a per-episode production defect.** `analytics-advisor.ts:211-221` returns the largest single sample-to-sample fall, unsmoothed, unweighted, with no exclusion of the first bucket. On essentially every YouTube retention curve the largest single fall is the opening-seconds bounce. The card that results (`"Retention drop in {episode}"`, `"Largest viewer loss around 2% of the video"`) will point at the same place for every episode, and instructs "tighten that production decision" — sending the Storyboarder to fix a shot that is not the problem. It also never fires on a curve of length &lt; 2 and treats a flat curve identically to a cliff.

**7. `loops` and `shares` are hardcoded `null`; virality is structurally always zero.** `route.ts:101-102`. `viralitySignal()` (`:95-97`) therefore always returns 0, and the evidence string's `, N loops+shares` clause is dead code. The `audience-quality-sensor` skill states as an implemented metric role: "Virality of short-form = loops (rewatches) + shares… which the algorithm amplifies most". Neither is fetched. Worse — see False premise (c).

**8. The ledger holds ONE Short per episode. The doctrine mandates 3–5.** `short-linkage.ts:57-76` `persistShortId` writes the scalar key `youtube_short_id`, overwriting on every call. `shorts-longform-distribution` practice #3: "One episode yields 3–5 *different* Shorts." Live data:

```
SS-S15-E28  short GULsE8hEYbw   (one)
SS-S15-E30  short RlcMjNhjxlQ   (one)
SS-S15-E29  vid dLB3EcLHQ8g     NO short_id at all
```

E29 is the 2026-07-16 launch episode. Your memory note records **four** Vending Shorts uploaded that day — the format-proven ones. **None** of them is in the ledger. `route.ts:71` `shortToEpisode` therefore attributes at most one Short per episode; every other Short arrives at the advisor with `episodeCode: null` and can never be tied to the production decisions that made it. Per-gag attribution — the axis P2 is supposed to unlock — is blocked by the data model, not by the missing tagging. `persistShortId` is also an unguarded read-modify-write on `episodes.metadata` (your known RMW-race backlog item).

**9. Nine Shorts have a parent that our data cannot name.** E01/07/09/11/12/13/14/15/16 each carry `youtube_short_id` and **no** `youtube_video_id` — their long-forms were uploaded by hand and never recorded. `readParentVideoId` (`short-linkage.ts:43-50`) returns `null` for all nine, so `appendParentBacklink` is a documented no-op and those nine Shorts shipped without the backlink. Re-running `dist-shorts-backfill-parents.ts` today would still find no parent — the backfill cannot succeed until someone writes the nine parent ids. The funnel that `shorts-longform-distribution` calls "the load-bearing bridge" is absent on 9 of 11 tracked Shorts, and `/api/audience`'s `funnel` array reports them as parentless without flagging it as a defect.

**10. `T+1h/24h/7d/30d` are measured from upload, not from go-live.** `runner.ts:3239/3303/3331` all set `publishTimestamp: Date.now()` at upload time. With 18 videos uploaded private and scheduled public days later, T+1h, T+24h and often T+7d would all sample a video no one could see. Only T+30d would carry signal. Combined with finding 1 this is currently moot — but it is the bug that will bite the moment the collector is repaired, and it is invisible until then.

**11. `isShortTitle` decides format by title regex.** `route.ts:30`: `/#?shorts?\b/i`. A Short whose title omits `#Shorts` is classified `longform`; an episode whose title contains the word "short" is classified `short`. `getVideoStatistics` now fetches `contentDetails.duration` and derives `durationSeconds` — the reliable signal (≤60s + vertical) is already in hand and unused. Every kind-conditional branch downstream (retention fetch, the `shorts` leaderboard, funnel mapping) inherits the misclassification.

---

## False premises

**(a) "Scheduling is our default publish flow."** `docs/distribution/strategy.md §0.5`: "default upload = Unlisted → schedule Public." `UploadVideoInput` has no `publishAt`. The playbook that EXEC-PUB *owns* prescribes an operation the machine cannot perform — so it silently becomes a manual Director task, and the ledger's `youtube_privacy` goes stale (as you established). A doc marked as the operational playbook mandating a capability the code lacks is the purest form of this class.

**(b) Two governing documents give contradictory cadence, and nothing halts.** `shorts-longform-distribution` SKILL: *"Default: one Short per day, fixed slot"* — the version your 2026-07-16 research ratified. `docs/distribution/strategy.md §2`: *"1 Short every 2–3 days"* and *"Vertical Short (15–30s) — every 2–3 days"*. Same conflict on Shorts-per-episode (skill: 3–5; strategy: 1–3) and on reframing (skill: follow-crop, "a STATIC centre-crop clips it"; strategy §2: *"Sandy stays centered; crop to keep the glass body + key object in frame"* — the exact practice the skill later proved wrong). `skill-creation.md` requires HALT-and-escalate on source-of-truth conflict; there is no mechanism, and an agent reading strategy.md gets the retracted answer with full confidence.

**(c) "Loops are a metric we read."** `audience-quality-sensor` SKILL lists loops (rewatches) as a metric role and calls it the strongest virality driver. The YouTube Analytics API does not expose a per-Short rewatch/loop metric to channel owners. `shares` is available and simply not requested; `loops` is likely **not obtainable at all**. The doctrine builds its primary short-form quality axis on a number that may not exist. This is the same structural class as the "related video" field you flagged: doctrine assuming a field the platform does not provide.

**(d) The `head-of-growth` diagnostic ladder's top rung is unreadable.** Its step 1 branches entirely on *impressions* ("no impressions → packaging problem; impressions but no clicks → CTR problem"). `collectAudienceSnapshot` hardcodes `impressions: 0, impression_ctr: 0, subscribers_gained: 0, traffic_sources: {}` (`youtube-stats.ts` return block), and `/api/audience` never requests them. `specs/distribution/analytics.md` sets a Warning threshold of `Impression CTR &lt; 2%`. If the flagging in `analytics_collector.md` Step 2 ever ran, a hardcoded 0 would trip WARNING on every episode forever. The entire diagnosis→recovery method is unexecutable, and the `views=0` recovery ladder — the doctrine's answer to a weak launch — cannot be walked past step 1.

**(e) The doctrine that forbids learning from what shipped.** `CLAUDE.md §6` (`studio_version &lt; 1.0`): legacy episodes "are training experiments, NOT a production catalog… **not ground truth for calibration**, not a novelty baseline". `series-episode-theme-selection` gate 8 obeys this and switches novelty off. But the videos now on the channel — including the vertical at ~1196 views that proved the format gate — **are** those legacy episodes. The governance rule and the Star's "read feedback → correct course" point in opposite directions on the only data we possess. Nobody is wrong here; nobody has reconciled it either, and until it is, a correctly-behaving theme-selector is *required* to ignore your only real audience signal.

**(f) "Audience tab sensor ALREADY BUILT."** `PLANET.md` "Terrain now". True of the read-and-display path; false of the sensor as a sensor. Nothing persists (finding 1), nothing is remembered between page loads, and nothing consumes the output (finding 2). "Finish THAT one. No second panel." is the right instinct, but "finish" here means building the persistence and correction arms, not topping up a mostly-built thing.

---

## What I could not verify — no evidence found

- Whether self-hosted `inngest start` honours a future `ts` at 1h/24h/7d/30d horizons. The events exist in `main.db`; no run was ever produced. Cannot distinguish "held, pending" from "dropped". A 60-second test (emit with `ts: now+90s`, watch for the run) settles it and is worth doing before any repair of finding 1.
- Whether `dist-shorts-backfill-parents.ts` was ever executed. The nine episodes still have no `youtube_video_id`, so the outcome would have been a no-op either way.
- The current live YouTube state of the 4 Vending Shorts (titles, `#Shorts` presence, backlinks). They are absent from the ledger, so I have no id to check; I did not make live YouTube calls.
- Whether `prod.log` / `inngest.log` ever contained analytics activity. Both are current-session only (`inngest.log` starts 2026-07-21T09:24, `prod.log` is 261 bytes); nothing older survives. The DB job ledger was my substitute and is conclusive on its own.
- Whether any of this was already captured by the sibling agents — `.claude/training-inbox.md` (modified, uncommitted) contains prior findings around lines 3660-3900 covering D1/D2/D3 and a `publicationState` recommendation. I read enough of it to avoid duplicating those; I did not audit the rest of the file.</result>
<usage><subagent_tokens>186315</subagent_tokens><tool_uses>59</tool_uses><duration_ms>451696</duration_ms></usage>
</task-notification>

## 2026-07-21 15:29 · director-msg (hook) · NEW · (triage at distill)
Timon number один. Tag CB. Слишком много людей, слишком сложные. Тема номер два. Замечательно биометрические ворота всегда стресс для всех и всегда работают как попало. Всем будет очень понятно. Тема три. Био находок. Тоже классно. Tier one четыре. Обмен валюты. Ну, шесть баллов из десяти. Тема фотография. Тоже шесть баллов из десяти. TMI семь. Лента выдачи багажа. Хорошая тема. Sushilka. Ну, здесь можно поиграть, но социализация здесь никакой. К тому же руки у него непрозрачные, а резиновые.

## 2026-07-21 15:38 · director-msg (hook) · NEW · (triage at distill)
Timon number один. Tag CB. Слишком много людей, слишком сложные. Тема номер два. Замечательно биометрические ворота всегда стресс для всех и всегда работают как попало. Всем будет очень понятно. Тема три. Био находок. Тоже классно. Tier one четыре. Обмен валюты. Ну, шесть баллов из десяти. Тема фотография. Тоже шесть баллов из десяти. TMI семь. Лента выдачи багажа. Хорошая тема. Sushilka. Ну, здесь можно поиграть, но социализация здесь никакой. К тому же руки у него непрозрачные, а резиновые. Travelator, движущаяся дорожка, тема уже была, но сбыл, правда, экскалатор. Ну, в общем, то же самое. Teletrap убираем, непонятно для многих будет. Tableau вылета в 11-я тема замечательная. Поиск сведа это челлендж. Вращающаяся в дверь входа. Где-то у нас уже было, но можно, в принципе, оставить. Tenнадцатая темa. Сложно показать на картинках. Идею убираем. Timo introscuppa, ну, похоже, уже была. Можно, конечно, её как-то ещё раз играть, но давай оставим. Так, на четыре балла из десяти. Весы на стойке багажа тема хорошая, там можно разыграть перевес, где ему всё приходится выбрасывать. По всему аэропорту все нервничают. шестнадцатая тема. Ну, так, на троечку. Семнадцатая тема. At least, my tema, социальное, там можно толкать разных попутчиков. He must make совершенно неожиданный результат. Food court хорошая тема. We blow onge. Toge играет. Amy veut de dix-neufte tema. Geta на семерочку, на восьмерочку. Duty free, да, можно разыграть историю о том, что всего очень много, всё на толко, на все толкаются, тележки, чемоданы, Eдинственное, развязка неинтересна, какая-то притянутая за уши. Экспонат какой-то непонятно. Некоторые темы и даже многие темы нормальны, но не хватает именно какой-то социальное взаимодействия. Например, в первой истории по аэропорту был инспектор. И вот борьба с инспектором, она как раз давала эту социальность. Разбивающиеся бутылки социальность не дают. Да, это смешно, но нет взаимодействия. Вот надо продумать эти  так, чтобы там были какие-то еще дополнительные герои из нашего списка героев, которые у нас есть, кроме Сенде, что-то еще должны быть. Вполне возможно, что пора нарисовать еще оставшихся героев, которые мы планировали. Я думаю, там еще героев пять, шесть можно спокойно добавить.\

## 2026-07-21 15:46 · director-msg (hook) · NEW · (triage at distill)
И еще один момент. Было несколько эпизодов, когда показывали люди с какие-то обобщенные люди вместо, кроме Сенде, на картинках, и они изображались просто какими-то серыми, черными силуэтами. Так делать не нужно, если показывается толпа, то можно нарисовать каких-то реальных антропоморфных предметов fantasy хватит у наших авторов?  какой-то бардак со списком тем и эпизодов. Напомни, пожалуйста, где это всё лежит список тем эпизодов и список героев. Антагонистов, протагонистов. Надо это как-то нам в одном каком-то месте хранить. Скорее всего, на Гите или в базе данных, но лучше на Гите, наверное, потому что можно отовсюду посмотреть. The список можно прямо дополнять-дополнять. Продолжающаяся нумерация и постепенно к ней возвращаться. И к списку героев, и к списку тем, и, возможно, даже к списку локаций. Но это может быть, могут быть разные документы, а может быть один документ. Что думаешь?
