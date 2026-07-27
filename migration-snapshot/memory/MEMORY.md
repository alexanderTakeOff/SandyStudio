# SandyStudio Memory Index

> One line per entry — detail in topic file. Compacted 2026-07-23.

## 📡 Distribution

- 🎬 [Video↔Episode map](../../../../../SandyStudio/docs/distribution/video-episode-map.md) — 10 финалов↔S15; канал=Brand `UCc2YJlHFclO9BWLEgPlglIg` «Sandy the Hourglass» под `ao@mystaydubai.com`.
- 🔌 YouTube API плумбинг (`c4eac71`): `youtube.ts`; `GOOGLE_REFRESH_TOKEN`=Drive, `YOUTUBE_REFRESH_TOKEN`=upload+readonly.
- ⭐ [EXEC-PUB real — handoff](../../../session-data/2026-07-10-distribution-exec-pub-real-handoff.md) — заливка=МОК (`runner.ts:2940`); q11a swap→uploadVideo+setThumbnail.

## 🪪 Identity & communication

- 🪪 [My name is Тео](my_name_is_teo.md) — cross-project identity (2026-05-19).
- 👤 [Director = Alexander / Александр](director_name_alexander.md) — NEVER «Кирилл».
- 🕐 [Dubai time prefix + UTC+4](director_message_timestamp_dubai.md) — every msg `HH:MM ~ `; commits local, DB/Inngest UTC. [[director_timezone_dubai_utc_plus_4]]
- 🔢 [Question numbering q1..qN](director_question_numbering.md) — continuous, never reset.
- 🔴 [Действие Директора = эмодзи-маркер](director_action_required_emoji_marker.md) — 🔴 блокер / 🟡 нужно / 🟢 выбор, ПЕРЕД `q<N>`.
- ⊖ [Anti-additivity](anti_additivity_principle.md) — reuse if ~80% exists, else subtract; hook-enforced.
- 🧩 [Systemic + Process-first](director_systemic_not_patchwork.md) — ONE invariant; «which ROLE catches this?» before code-fix. [[director_process_and_people_first]]
- 💸 [Cost-risk on model switch](proactive_cost_risk_on_model_switch.md) — estimate volume×price BEFORE.
- 📝 [Work-docs = caveman style](director_docs_caveman_style.md) — очень кратко, Директор их редко читает; полнота — в CLAUDE.md/скиллах.
- 📌 Also in `~/.claude/rules/`: terse-RU + ===5===-gates, conversational-questions, signal-when-input, decide-small-yourself, read-ALL-msgs-first.

## 📦 Active backlog

- 📉 [Shorts: охват без подписок — сериальность](backlog_shorts_reach_no_sub_conversion_seriality.md) — ⭐ 07-23 HoG: старые шортсы 1200+ РЕАЛЬНЫХ просм, 0 подписок; рычаг=удержание>медианы→объём→сериальность. Analytics лаг ~2-3дн. [[audience-quality-sensor]]
- 🧪 [Эксперимент «Автомойка»: срез первых 6с](experiment_carwash_first6s_retention_cut.md) — ⭐ 07-25 НЕ потеря охвата: Директор срезал мёртвый интро (обрыв на 6с) + пустые кадры из widescreen-кропа, перезалил 24 июл; PENDING ~27 июл. Уроки-кандидаты: хук в 1-м кадре + герой в центре. [[backlog_shorts_reach_no_sub_conversion_seriality]]
- 📉 [Удержание НЕ объясняет охват](retention_does_not_explain_reach_yet.md) — ⭐ 07-25 контроль 19 июл: 50%→1220 из ленты, 58%→1. Рычаг недоказан; нужен экспер. с ОДНОЙ переменной. [[hog_daily_report_loop]]
- ⏸️ [Growth-план НА УДЕРЖАНИИ — копим ~10 точек](growth_plan_on_hold_accumulate_first.md) — ⭐ 07-25 Директор: данных мало; сейчас ТОЛЬКО анализ + починка явных ошибок. Живы Track C; A/B заморожены. Режим зашит в `daily-prompt.md`. [[retention_does_not_explain_reach_yet]]
- 🤖 [HoG дневной авто-отчёт](hog_daily_report_loop.md) — ⭐ 07-25 луп на рельсах (`ba8087d8`): таск `\SandyStudio\` Daily 09:00. **`Artifact` в headless `claude -p` НЕ существует** → ссылки в пуше нет; ntfy отдавал `attachment.txt` вместо текста при HTTP 200 (нужен `-ContentType text/plain`); планировщик=PS 5.1→лаунчер ASCII-only. [[autonomous_factory_architecture_doctrine]]
- 🔁 [Cap-reset после HALT-резолва](backlog_cap_reset_after_halt.md) — счётчики derived навсегда→шот исчерпан после HALT; фикс=«с последнего вмешательства», stateless.
- 🌪️ [Видео-шторм E31 RESOLVED 07-23](backlog_video_flow_broken_parallel_churn.md) — шторм=ШИРИНА; Video Pilot Pass + stale-id heal + stop-stack/-Wipe (`e8716d2f`+`28d497fd`); смоук пилотов pending; [кнопка Start Video](backlog_start_video_button_disappears_after_restart.md) закрыта `86b959aa`.
- 💾 [Episode-media Drive backup](backlog_episode_media_drive_backup.md) — music/stitch/final local-only (`drive_file_id:null`); persistBinary→backfill→guard.
- 🚨 [Аппрув критика ≠ аппрув артефакта](backlog_critic_approval_advances_without_artifact.md) — ⭐ гейту нужен АРТЕФАКТ, не карточка критика; script→SB, storyboard→EREF. [[backlog_critic_revise_action_ux_gap]]
- 🎛️ [Кебаб критика REVISE путает](backlog_critic_revise_action_ux_gap.md) — действие должно жить на СТОРИБОРДЕ; backend умеет, дыра во фронте.
- 🔇 [Полина: пишет, но не читает](backlog_polina_read_tools_gap.md) — read-ассета НЕТ; `getStateMatrix` слеп к pre-production. [[backlog_td_polina_nudge_readonly_execution_gap]]
- 🩳 [SHORTS не доходит до агентов](backlog_shorts_delivery_targets_not_propagated.md) — ⭐ Settings пишет aspect_ratio, агенты читают `delivery_targets`; fix=единый источник. [[anti_additivity_principle]]
- 🏷️ [Scorecard: Полина=human](backlog_scorecard_polina_mislabel.md) — UUID Директора завышает касания; fix=третий класс актора.
- 🗨️ [Ambient event format](feedback_ambient_event_format_structured.md) — TIME/КТО(role)/ЧТО/К-ЧЕМУ.
- 🎛️ [TD-kebab: plan/critic lines](backlog_td_kebab_plan_critic_lines.md) — линии в обеих зонах, toggle-approve. [[backlog_kebab_video_reference_zones]]
- 🎨 [Kebab colour grammar](kebab_color_grammar_doctrine.md) — ⭐ CODE WRITTEN+VERIFIED 07-25 (tsc·1510 tests) на ветке `artifact-continuation-2cb174`; обе поверхности (кебаб+stage-rail); осталось визуал+деплой. [[no_deploy_during_live_run]]
- 🔒 [TD-canon UNLOCK button](backlog_td_canon_unlock_button.md) — LOCKED SBL без Unlock в Library.
- 📌 [PINNED: MECHANICS_AUTO_ADVANCE smoke](backlog_enable_mechanics_auto_advance_smoke.md) — reconciler off; включать с НАЧАЛА чистого эпизода. [[autonomous_factory_architecture_doctrine]]
- 🧪 [Polина concierge model + harness](backlog_next_run_polina_gemini_free.md) — kill-switch shipped; Phase 2 pending.
- 🎥 [Video direct from canon](backlog_video_direct_from_canon.md) — shot desc + LOCKED canon, skip episode_ref.
- 🔘 [Scene prop canon-anchor](backlog_scene_prop_canon_anchor.md) — ffmpeg-харвест кадра APPROVED-шота→референс сцены; q3 OPEN. [[anchor_mode_orbit_ref_only]]
- 💡 [Episode ideas](episode_ideas_location.md) — `FILMS/Sandy/episode_ideas.md` (untracked).
- 🎞️ [VGEN end_image metadata gap](backlog_td_vgen_endimage_metadata_gap.md) — render не пишет `end_image_asset_id`.
- 🎵 [Music bake animatic-selection](backlog_td_music_bake_animatic_selection.md) — bake targets newest ANY vs display APPROVED; errors swallowed.
- 🎞️ [Animatic dedup](backlog_animatic_dedup_ref_vs_video.md) — video-animatic=superset; drop ref gallery. [[backlog_shot_centric_paradigm]]
- 🎬 [Per-shot video eligibility](backlog_per_shot_video_eligibility.md) — unlock per-shot, not whole-episode.
- 🩳 [Shorts UI slicer](backlog_shorts_ui_slicer.md) — start/end/overlay + preview-picker; reuse makeShort.
- 📊 [Audience quality sensor P3](backlog_audience_quality_sensor.md) — EXEC-ANAL РАЗВЕДЧИК; P1 DONE. [[backlog_shorts_ui_slicer]]
- 📣 [EXEC-COPY publicist](backlog_exec_copy_publicist_angle.md) — search-first; 5 принципов.
- 🚨 [Canon-existence preflight](backlog_td_canon_existence_preflight.md) — phantom locations; canon-diff at brief.
- ⚔️ [episodes.metadata RMW-гонка](backlog_episode_metadata_rmw_race.md) — ~8 роутов SELECT→spread→UPDATE; нужен атомарный jsonb-merge. [[anti_additivity_principle]]
- 🛑 [EREF «No assets inserted»](backlog_td_eref_noassets_catchall.md) — provider-fail vs no-op→false fail.
- 🎬 [Stitch-gate](backlog_td_stitch_gate_music_and_exclude_retrigger.md) — нужен AUD-music + re-eval на EXCLUSION.
- 🧼 [Skill abstraction audit](backlog_skill_abstraction_audit.md) — concretes→Bible/Brief.
- 🧭 [Pipeline full surface](backlog_td_pipeline_full_process_surface.md) — все стадии manual; Casting BEFORE Brief.
- 🎭 [Casting DRAFT dead-end](backlog_td_casting_draft_deadend.md) — A+C SHIPPED; B (preflight) open.
- 🧩 [EREF node в pipeline-view](backlog_eref_pipeline_node_spec.md) — per-shot sub-chain + versioning.
- 🎨 [ART-AD Production Designer](backlog_td_artdir_breakdown_role.md) — нет breakdown между Story Editor и Storyboard.
- 🎬 [Shot-centric paradigm](backlog_shot_centric_paradigm.md) — post-прогон refactor; per-shot dossier.
- 🛂 [WCHK two bugs](backlog_td_wchk_two_bugs.md) — ordering до approve; verdict-stamp content vs metadata.
- ✂️ [Surgical revision](backlog_td_surgical_revision_after_critique.md) — re-author только flagged; anti-regress.
- 🖊️ [Script uneditable UI](backlog_td_script_uneditable_ui_plus_indicator.md) — SCR не редактируется в UI.
- ✍️ [Brief-authoring training](backlog_td_brief_authoring_training.md) — 8 правил + E09 канон.
- 📋 [Polina work-plan tracker](backlog_td_polina_workplan_tracker.md) — plan live, не write-once; 3 rules.
- 🔇 [Polina nudge read-only](backlog_td_polina_nudge_readonly_execution_gap.md) — no mutations; Mode-3 blocker; Mode-2 workaround.
- 🤥 [Polina false-completion](backlog_polina_false_completion_phrasing.md) — ⭐ врёт «запустила» без tool-call; bold-approve creative→paid gen; E28.
- 🎨 [TD-36 StudioShell ergonomics](backlog_td36_studio_shell_ergonomics.md) — 3 fixes; Director owes screenshot.
- 📋 [TD-32 rejected IMG siblings](backlog_td32_td33_continuity_and_attempts.md) — ~3-4h; TD-33 CLOSED.
- 🚨 [Observability: fails скрыты](backlog_observability_failures_not_surfaced.md) — console-only маскирует terminal; q21 readiness-preflight `validateShotReadyForGeneration` fail-loud до paid.
- 🚩 [TD-61 anchor-mode](backlog_td61_td62_pipeline_blockers.md) — regenerateVideoFromPlan не plan-driven; TD-62 CLOSED.
- 🎨 [Sandy + Anvil canon](sandy_canon_visual_identity.md) — hourglass не bear; Anvil c лицом+руками.
- ⚠️ [Preamble pollution gpt-image-2](preamble_attention_pollution_gpt_image_2.md) — hard MUST starves identity refs.
- 🎬 [Camera Orbit signature](camera_orbit_signature_policy.md) — 80%+ orbit; static нужен Plan-justification.

## ⚙️ Operational

- 🔥 [/grill-me](grill_me_skill.md) — interrogate BEFORE code; trigger «погоняй».
- [Concierge=OpenAI](concierge_uses_openai.md) — webapp direct, Anthropic для studio; [model IDs](openai_model_ids_live_source.md) developers.openai.com/api/docs/models.
- 🟢 [Inngest SELF-HOSTED](inngest_selfhost_setup.md) — `inngest start` durable SQLite, NOT dev; keys `.env.local`; sync PUT /api/inngest. [[reconciler_audit_2026-07-10]]
- 🛑 stop-stack.ps1/-Wipe (`e8716d2f`) — стоп churn: Inngest ПЕРВЫМ + парковка durable DB; UI STOP/Restart → `/api/system/servers`.
- [Supabase ref](supabase_project_ref.md) — `akstennzrnkvexjgzhxv`; [Data API GRANT](supabase_data_api_grant_rule.md) new public tables; [Migrations](migration_apply_cli_first.md) `supabase db push` CLI, never ask Director.
- [replay-pilot](replay_pilot_harness.md) — `npm run replay-pilot` full DAG перед коммитом.
- [No build while dev up](dev_workflow_no_build_during_dev.md) — corrupts `.next/`; recovery=kill+rm.
- 🚫 [No deploy during live run](no_deploy_during_live_run.md) — только Director OK + no processes. [[inngest_dev_router_unreliable_no_selfheal]]
- ⚠️ [--legacy-peer prunes optionals](npm_install_legacy_peer_prunes_optionals.md) — FULL `npm install` after pull.
- ⏱️ [EREF needs STABLE server](eref_generation_needs_stable_server.md) — ~6min/frame; build+start.
- [Mode 4 vs 1-3 chains](agent_chain_mode_4_vs_1_3.md) — factory auto-chains Mode 4; 1-3=`computeNextEvents`.
- [--env-file no override](node_env_file_does_not_override.md) — Windows; manual dotenv в скриптах.
- [Smoke: propose, don't auto-fire](smoke_tests_propose_dont_autofire.md) — ждать `go`, esp. $/long.
- [Ritual hooks live](operational_ritual_hooks_live.md) — 5 hooks §12; kill-switch `SANDY_HOOKS_OFF=1`.
- 🖥️ [Chrome Remote Desktop](remote_access_setup_parked.md) — PIN 557557; [Desktop pane=NEW session](desktop_app_terminal_pane_is_new_session.md).
- ✂️ [Harness trim](harness_trim_skills_library.md) — off-stack ECC в `~/.claude/*-library/`; restore=Move-Item.

## 🎨 Canon

- 🧊 [Стиль = 2.5D/3D cartoon, НЕ flat 2D](canon_style_is_25d_3d_cartoon_not_flat_2d.md) — ⭐ старый канон ошибочно требовал flat 2D→критик REVISE'ил корректное; исправлено 07-23 (style/sandy/виды-сзади/Инспектор). Степлер редизайн: 3D-фото→cartoon, светло-синий костюм, голова+кисти=степлеры (`b638d40c`). НЕ навязывать 2D.
- 🔄 [In-place замена канон-картинки → бампай freshness](canon_inplace_image_swap_bump_freshness.md) — ручные upload-скрипты не бампят `image_prompt.current_version`→браузер держит stale immutable; фикс=`bumpPreviewFreshness`.

## 🎯 Practice

- 🎬 [Brand bumper recipe](brand_bumper_production_recipe.md) — gpt-image-2 мульти-реф→Seedance 720p→ffmpeg iris+wordmark; текст оверлеем.
- [Verify real results](verify_real_results_not_logs.md) — never trust «COMPLETED»; open artifact.
- 🔬 [Overlay reports on SERVER LOGS](overlay_agent_reports_on_server_logs.md) — код-чтение=гипотеза; runtime wins.
- [Rethink over patches](architectural_rethink_over_patches.md) — structural→layered overview first.
- [technology.md protocol](technology_md_protocol.md) — pre-read; scan Director msgs for theses.
- [PLAN.md living anchor](plan_md_living_anchor.md) — §12 rituals; cap 2 worktrees+main; [size budget](plan_md_size_budget.md) ≤200 lines→PLAN-ARCHIVE.
- 🫙 [Sandy physics](sandy_canon_physics_corrections.md) — SEALED bulb + rubber limbs; EXTERNAL causes.
- 🎯 [Gag-bank by groups](gag_bank_proof_by_groups_not_count.md) — 60s ≈ 6–10 groups; padding=re-skins.

## 🧠 Architectural doctrines

- 🩸 [Provider fetch-no-timeout](provider_fetch_no_timeout_root_cause.md) — «стадия встаёт»=голый fetch; `fetchWithTimeout` свап не доделан; логи ПЕРЕД теориями.
- 🏗️ [Autonomous factory](autonomous_factory_architecture_doctrine.md) — ⭐ state-matrix→дирижёр→код-мышцы→гейты; мозг=10%.
- 🎛️ [Critic churn discriminator](critic_churn_discriminator.md) — ⭐ `44dffb11`: 3 оси в metrics JSONB; «runs/shot ВРЁТ»; escalate→Inbox. [[train_personnel_doctrine]]
- 🚒 [Reconciler audit](reconciler_audit_2026-07-10.md) — ⚠️ режимо-слеп, аппрувит creative (`reconcile.ts:165`); смоук AUTO_ADVANCE=OFF.
- 🔢 [Shot-identity refactor](shot_identity_refactor_decision.md) — ✅ `S{s}-E{e}-SH{n}` by-position, HALT-gate.
- 🛂 [Critic revision cap](critic_revision_cap_doctrine.md) — max 2-3×, then HALT+escalate.
- 🖼️ [Plan preview drawer](plan_preview_drawer_doctrine.md) — Plan = pre-video contract page.
- 🎓 [Train personnel](train_personnel_doctrine.md) — TD touching loadAgentInputs MUST touch `agents/exec/*.md`.
- 🎬 [Match-cut end_image](match_cut_doctrine.md) — только K+1 continues K SAME angle; else null. [[anchor_mode_orbit_ref_only]]
- 🎚️ [Orchestrator / master-session](orchestrator_master_session_paradigm.md) — ONE dirigent + worktree subagents.
- 🏭 [AI-EP conception gaps](ai_ep_conception_gaps.md) — ⭐ 12 gaps; «head=orchestrator; Polina=hands». NORTH_STAR §4.
- 🪄 [Nudge Polina](nudge_polina_dont_act_for_her.md) — proxy via team-chat; she executes+LEARNS.
- 🔌 [Inngest dev-роутер ненадёжен](inngest_dev_router_unreliable_no_selfheal.md) — хвост пачки + конкуренси; E15 root-cause.

## 📜 Recent session memos

- 🏁 [07-26 Фаза 4e ЦЕЛИКОМ в master](session_2026-07-26_multichannel_phase4e_complete.md) — ⭐ master `06f0a3b6`: publish-дефолты per-channel + Storage=2 реальных поля (MEDIA_CACHE_DIR live + drive_root_name); деплой за Директором (`start-stack.ps1 -Build`); переезд на десктоп = `docs/MACHINE-MIGRATION.md`, новых env/миграций нет; q1–q9, q10=defaults.yaml открыт.
- 📺 [07-25 Мульти-канальность Фазы 0-1 в ПРОДЕ](session_2026-07-25_multichannel_phase01.md) — ⭐ channels-паспорт (Sandy seeded), per-channel токены `YOUTUBE_REFRESH_TOKEN_<KEY>`, HALT вместо фолбэка, HoG channel_id NOT NULL; SS=студия, SS-SNN=отдельный СЕРИАЛ, Season DEPRECATED; next=Фаза 2 (activity_events.series_id + PA-фолбэк + UI рождения канала).

- 🔄 [07-24 Learning loop + HoG + loader](session_2026-07-24_learning-loop-hog-fixes.md) — ⭐ дистиллер отвергнут; обучение=in-session→repo-скиллы→git; HoG reach-мост live (30 видео); [loader hardening](backlog_skill_loader_hardening_p1.md) поймал молча-мёртвую `sandy-gag-library`; зеркала не-рантайм; время=хук inject-time. `6c0b05a0`+`87126fc4`+`bd7ef2bf`.
- 🧭 [07-20 Layer 0 ratified](session_2026-07-20_layer0-star-planet.md) — ⭐ Star/Planet были МЁРТВЫ (планета −17 эп.); Звезда v1 + Планета=Автономность (`99ea6d11`).
- 💻 [07-19 ECC restored](ecc-global-layer-missing-on-laptop.md) — ноут: `~/.claude/` восстановлен с десктопа; ключ проекта сменился; rules/session-data НЕ перенесены.
- 🎬 [07-18/19 caps + viewer rule](session_2026-07-18_19_pipeline-caps-viewer-rule.md) — cap авторинга плана + видимый HALT (`9a5724ee`).
- 🎯 [07-17 On-model gate BUILT](session_2026-07-17_onmodel-gate-built.md) — detector + decideOnModel + bounce; live-валидация должна. [[critic_churn_discriminator]]
- 🚀 [07-16 Channel LAUNCH + 4 Shorts](session_2026-07-16_channel-launch-prep-vending-shorts.md) — ⭐ канал упакован; каденция 1/день D→A→B→C. [[shorts_longform_distribution]]
- 🥇 [07-13 E28 «золотая»](session_2026-07-13_e28-gold-autonomy-diagnosis.md) — ⭐ fan-out работает; автономность 98%; метод «45→5». [[backlog_polina_false_completion_phrasing]]
- 📜 Older (06-26 [Polina cost audit](polina_cost_audit_CORRECTED_2026-06-26.md)=auto-react≈0; 07-04…07-17) → `session-data/*.tmp` + `archive/`.

## 🗂 Session resume

Latest `~/.claude/session-data/*.tmp` = continuation context; history → `archive/`.
