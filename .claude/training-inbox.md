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
