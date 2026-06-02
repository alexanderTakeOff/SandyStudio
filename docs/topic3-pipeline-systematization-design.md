# Topic 3 — Pipeline View Systematization (APPROVED design)

> Director-approved 2026-06-02 (q12y operating model · q9b muting · q10a critic-row · q11a honest-empty-slot · q13a scope).
> Grounded in read-only inventory workflow `wf_29ba6b95-cf9` (27 agents, completeness verdict=complete).
> This is the implementation blueprint. Fold the spec changes into `specs/system/pipeline_view.md` + `specs/glossary.md`.

## 1. Operating model (canon, q12y)

Per-artifact unit of work — the loop the pipeline MUST reflect:

```
        ┌──────── REVISE (cap N → HALT→Director) ────────┐
        ▼                                                │
[Designer: plan] → [Plan-Critic: verdict] ──PASS──▶ [Artist: generate, $] → [Output-Critic: judge] ──PASS──▶ [Director gate] → APPROVED
   writes              validates plan                    spends budget          judges ARTIFACT  │              ▲
                                                               ▲                └──REGEN (cap N)──┘         Human sign-off
                                              Cross-cut: Continuity/Gag Supervisor · Orchestrator (routes, enforces gates/caps)
```

- "Rewrite" is the REVISE edge (Author/Designer re-runs with notes as hard criteria), NOT a new role. Cap 2-3 → HALT→Director (critic-revision-cap doctrine).
- **Output-Critic** = judges the generated artifact (not the plan). Today exists only inline for EREF images (EXEC-EREF-CHECK); MISSING for video/thumbnail/final. **q13a: visualize the empty slots now; build the agents in a later sprint** (Mode-3 autonomy enabler).
- Human (Director) = creative brief north-star + approval gates + escalation target + final sign-off (LOCKED/Publish).

## 2. Role vocabulary (single word per role — fixes "5 names for one job")

| Role | Canonical word | Definition |
|---|---|---|
| Authors a plan/breakdown | **Designer** (or Author for prose) | plans, does not spend media budget |
| Validates a plan/artifact, returns verdict, never rewrites | **Critic** | replaces Reviewer / Checker / Supervisor / Validator sprawl |
| Executes the plan, calls provider, spends media budget | **Artist** | the only tier that spends |

Glossary §1.36 "Validator" → re-point to **Critic**; add Designer/Artist entries; keep Reviewer/Checker as "→ see Critic" aliases; note EXEC-GAGAD dual role (Designer in plan phase, Critic in review phases). Series-level craft leads (ART-HW/AD/MS) keep **Supervisor** — they are not per-episode plan-gates and never appear in the episode DAG.

### Rename map (display label)
| Agent | → Canonical display | Role-word |
|---|---|---|
| EXEC-SREV | **Script Critic** (subtitle "Story Editor") | Critic |
| EXEC-WCHK | **Continuity Critic** (subtitle "Script Supervisor") | Critic |
| EXEC-EPREV | **Reference Critic** | Critic |
| EXEC-VPREV | **Video Critic** | Critic |
| EXEC-GAGAD | **Gag Critic** (review phases) / **Gag Designer** (plan phase) | Critic/Designer |
| EXEC-THUMB | **Key Art Artist** (was mislabeled "Key Art Designer" — it RENDERS) | Artist |
| EXEC-EREF-DESIGNER | **Reference Designer** | Designer |
| EXEC-VANIM | **Video Designer** | Designer |
| EXEC-THUMB-DESIGNER | **Key Art Designer** | Designer |

## 3. Stage model — 19 ordered rows (was 15)

Tier rule (systematic, not per-stage taste): **Artist/Author/Editor + hard-gate = PRIMARY; Designer(plan) + Critic(verdict) = MUTED**.

| # | stage id | family | role | label (subtitle) | tier | agent(s) | actions |
|---|---|---|---|---|---|---|---|
| 1 | `brief` | — | input | Brief | PRIMARY | Director | View · Edit |
| 2 | `screenwriter` | script | Author | Writer | PRIMARY | EXEC-SW | View · Retrigger · Edit |
| 3 | `script_critic` | script | Critic | Script Critic (Story Editor) | MUTED | EXEC-SREV | View verdict · Retrigger |
| 4 | `storyboarder` | storyboard | Author | Storyboard Artist | PRIMARY | EXEC-SB | View · Retrigger · Edit |
| 5 | `continuity_critic` | storyboard | Critic | Continuity Critic (Script Supervisor) | MUTED | EXEC-WCHK | View verdict · Retrigger |
| 6 | `reference_designer` | reference | Designer | Reference Designer | MUTED | EXEC-EREF-DESIGNER | View plan · Retrigger · Edit plan |
| 7 | `reference_critic` | reference | Critic | Reference Critic | MUTED | EXEC-EPREV (+GAGAD eref) | View verdict (V01-V09) · Retrigger |
| 8 | `episode_references` | reference | Artist | Reference Artist | PRIMARY | EXEC-EREF | Preview · Approve · Retrigger · Change provider |
| 9 | `music_generator` | audio | Artist | Composer | PRIMARY | EXEC-MGEN | Preview · Retrigger |
| 10 | `animatic` | video | Editor | Editor | PRIMARY | EXEC-EDIT | Preview · Retrigger |
| 11 | `shot_designer` | video | Designer | Video Designer | MUTED | EXEC-VANIM | View plan · Retrigger · Edit plan |
| 12 | `shot_critic` | video | Critic | Video Critic | MUTED | EXEC-VPREV (+GAGAD vanim) | View verdict (V01-V13) · Retrigger |
| 13 | `visual_generator` | video | Artist | Video Artist | PRIMARY | EXEC-VGEN | Preview · Approve · Retrigger · Change provider |
| 14 | `final_cut` | video | Editor | Online Editor | PRIMARY | EXEC-STITCH | Preview · Retrigger |
| 15 | `copywriter` | distribution | Author | Publicist | PRIMARY | EXEC-COPY | View · Retrigger · Edit |
| 16 | `thumbnail_designer` | key-art | Designer | Key Art Designer | MUTED | EXEC-THUMB-DESIGNER | View plan · Retrigger · Edit plan |
| 17 | `thumbnail_creator` | key-art | Artist | Key Art Artist | PRIMARY | EXEC-THUMB | Preview · Approve · Retrigger |
| 18 | `publisher` | distribution | Publisher | Distribution | PRIMARY (hard gate) | EXEC-PUB | Publish (Director-only) · View log |
| 19 | `analytics_collector` | distribution | Analyst | Audience Analyst | PRIMARY | EXEC-ANAL | View metrics · Retrigger |

New rows vs today: `reference_designer`, `reference_critic`, `shot_critic`, `thumbnail_designer`. Rename `shot_planning`→`shot_designer`. GAGAD folds INTO the relevant critic row by phase. Keep legacy `PipelineStageId` ids for back-compat.

**Empty-slot honesty (q11a):** key-art family shows a `thumbnail_critic` slot rendered as "Critic — не заполнен / not staffed" (no agent yet). Reflects the real gap; agent EXEC-THUMB-CRIT is a future sprint.

## 4. Behavior (q9b + q10a + workstation)

- **MUTED rows** collapse to a thin sub-line indented under the PRIMARY they serve (Critic tucks under the artifact it gates). Expand on click. Reduced visual weight. Respect `prefers-reduced-motion`.
- **q10a — Critic = its own MUTED row in the DAG** AND its verdict also surfaces inside the Artist's workstation.
- **Revision/regen loops** rendered as a small loop affordance on the Designer↔Critic and Artist↔Output-Critic edges (even if just an icon + "↻ revise ≤N").
- **🔑 Click a stage line → right side opens that agent's WORKSTATION, NOT the activity feed.** Workstation = that stage's asset(s) preview + the Critic verdict (which V-checks passed/failed) + actions `[Edit] [Retrigger] [Approve] [Change provider]` wired to existing endpoints. This is the StageWorkspacePanel (folds in old q2). Activity feed stays in the assistant/chat surface, not here.

## 5. Implementation scope (q13a) — files + build order

Build order (spine first, then UI, then labels/spec):
1. **`webapp/lib/api/pipeline-stages.ts`** — add 4 ids to `PipelineStageId`; rename `shot_planning`→`shot_designer` (keep legacy alias); add `tier: 'primary'|'muted'` to row def + snapshot; 19-row `ROW_DEFINITIONS` in order above; extend `STAGE_FROM_ASSET` (SPC-ref_plan→reference_designer, EPREV REV→reference_critic, SPC-shot_plan→shot_designer, VPREV REV→shot_critic, SPC-thumb_plan→thumbnail_designer) + `STAGE_FROM_AGENT` (add the 5 + GAGAD by phase); add `latest_verdict?` (PASS/REVISE/FAIL) to snapshot from the REV asset body; add empty `thumbnail_critic` slot marker.
2. **Pipeline View** `webapp/app/(studio)/episodes/[id]/page.tsx` + new `webapp/components/pipeline/StageWorkspacePanel.tsx` + a muted-row sub-component — tier rendering (collapse/indent muted, expand on click) + click-stage→workstation drawer (assets + verdict + actions). Reuse existing trigger/approve/content endpoints.
3. **`webapp/lib/api/agent-names.ts`** + registry display labels — apply §2 rename map (friendly subtitles kept).
4. **`specs/glossary.md`** — §2 vocabulary (Critic canonicalization, Designer/Artist, GAGAD dual role).
5. **`specs/system/pipeline_view.md`** — 19-stage model + tiers + workstation + Designer→Critic→Artist uniform pattern; API `stages[]` gains `tier` + `latest_verdict`.
6. **Tests/fixtures** — update pipeline-stages snapshots to 19 rows; legacy ids preserved.

Out of scope (later sprint): actual AI Output-Critic agents (video/thumbnail/final) + EXEC-THUMB-CRIT. This build only makes the graph honest+visible + workstation.

## 6. Done criteria
- tsc clean · vitest green · replay-pilot 30/30.
- Pipeline View shows 19 stages, muted Designers/Critics collapsed under their PRIMARY, expand on click.
- Click any stage → right-side workstation with assets + critic verdict + actions (NOT activity feed).
- Glossary + pipeline_view.md updated same change. No raw hex (semantic tokens, uiux.md).
