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
