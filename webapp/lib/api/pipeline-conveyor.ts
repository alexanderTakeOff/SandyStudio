// ──────────────────────────────────────────────────────────────────────────────
// lib/api/pipeline-conveyor.ts
//
// ЯЗЫК «КТО РАБОТАЕТ» — и он умирает вместе с конвейером.
//
// Здесь всё, что выводит состояние из `jobs.agent_id`: карта агент→стадия, живые
// и завершённые работы по кадру, роли (designer / critic / artist) и их палитра.
// Вынесено из `pipeline-stages.ts` в Ф2 новой парадигмы (2026-08-07) не ради
// красоты, а чтобы разделить файл ПО СРОКУ ЖИЗНИ: витрина стадий переживает смену
// парадигмы, ролевой язык — нет.
//
// Почему это вообще подлежит сносу: в новой модели работу ведёт один ум, а не
// двадцать ролей. Строки `jobs` он не создаёт — таблица требует `agent_id` и
// `inngest_event`, то есть она агент-образна по конструкции. Стадия при этом
// выводится из префикса `file_type` ассета и в этом слое не нуждается вовсе:
// прямой путь красит конвейер без единой строки `jobs` уже сегодня.
//
// Ф6 удаляет этот файл целиком вместе с UI, который его читает
// (`components/timeline`, `components/pipeline`, `AnimaticPlayer`). Ничего из
// него в новый мир не переносится — переносится ВОПРОС «идёт ли сейчас работа»,
// и ответ на него будет давать не карта ролей.
//
// Зависимость строго в одну сторону: обречённое читает переживающее, никогда
// наоборот. Если однажды `pipeline-stages.ts` начнёт импортировать отсюда —
// значит разделение сломано.
// ──────────────────────────────────────────────────────────────────────────────

import type { PipelineStageId } from './pipeline-stages';
import { STAGE_FROM_AGENT } from './pipeline-stages';

// ──────────────────────────────────────────────────────────────────────────────
// Per-shot LIVE work phase (EpisodeTimeline q4a — 2026-06-22).
//
// The timeline strip colours each shot cell by the work happening on THAT shot
// right now: a RUNNING/QUEUED job whose `input_snapshot.shotId` matches the cell.
// We reuse STAGE_FROM_AGENT (the single source of truth for agent→stage) and
// fold its stages into two visible groups the Director cares about:
//   - 'design'  — the reference is being produced (Reference Designer/Critic/Artist)
//   - 'animate' — the video is being produced (Video Designer/Critic/Artist)
// Colour + pulse live entirely in the UI; this module only classifies.
// ──────────────────────────────────────────────────────────────────────────────

/** Visible per-shot work group for the live timeline overlay. */
export type WorkPhase = 'design' | 'animate';

/** Stages that mean "the reference is being made" → blue. */
const DESIGN_STAGE_IDS: ReadonlySet<PipelineStageId> = new Set<PipelineStageId>([
  'reference_designer', // EXEC-EREF-DESIGNER
  'reference_critic',   // EXEC-EPREV
  'episode_references', // EXEC-EREF
]);

/** Stages that mean "the video is being made" → violet. */
const ANIMATE_STAGE_IDS: ReadonlySet<PipelineStageId> = new Set<PipelineStageId>([
  'shot_designer',    // EXEC-VANIM
  'shot_critic',      // EXEC-VPREV
  'visual_generator', // EXEC-VGEN
]);

/**
 * Map an agent id to its live work phase for the timeline overlay, or null if
 * the agent is not part of either per-shot group. Derived from STAGE_FROM_AGENT
 * so the agent→group mapping has exactly one source of truth.
 */
export function workPhaseForAgent(agentId: string): WorkPhase | null {
  const stage = STAGE_FROM_AGENT[agentId];
  if (!stage) return null;
  if (ANIMATE_STAGE_IDS.has(stage)) return 'animate';
  if (DESIGN_STAGE_IDS.has(stage)) return 'design';
  return null;
}

/** Minimal job shape needed to attribute live work to a shot. */
export interface JobForShotPhase {
  agent_id: string;
  status: string;
  input_snapshot: unknown;
}

/** Read the canonical shot_id the factory stamps into every per-shot job. */
function snapshotShotId(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const sid = (snapshot as { shotId?: unknown }).shotId;
  return typeof sid === 'string' && sid.length > 0 ? sid : null;
}

/**
 * Pure: build `shot_id → active WorkPhase` from the episode's jobs. Only
 * RUNNING/QUEUED jobs count (work happening right now). When both a design and
 * an animate job are live for the same shot, 'animate' wins — Director priority
 * q4a (video-artist over designer). The returned shot_id values are the
 * canonical form matching `AnimaticContract.shot_list[].shot_id`.
 */
export function activeWorkPhaseByShot(
  jobs: ReadonlyArray<JobForShotPhase>,
): Map<string, WorkPhase> {
  const map = new Map<string, WorkPhase>();
  for (const j of jobs) {
    if (j.status !== 'RUNNING' && j.status !== 'QUEUED') continue;
    const phase = workPhaseForAgent(j.agent_id);
    if (!phase) continue;
    const shotId = snapshotShotId(j.input_snapshot);
    if (!shotId) continue;
    // 'animate' is dominant — never let a 'design' job downgrade it.
    if (map.get(shotId) === 'animate') continue;
    map.set(shotId, phase);
  }
  return map;
}

// ──────────────────────────────────────────────────────────────────────────────
// Unified work-state language (2026-07-02) — one visual vocabulary shared by the
// References and Video pipelines (they are the SAME shape: Designer → Critic →
// Artist). The three questions a glance must answer:
//   1. WHICH object?  → References vs Video (answered by POSITION: the object's
//      button / the cell's R·V indicator — NOT by colour).
//   2. WHICH stage / WHO is working?  → answered by COLOUR (role), below.
//   3. Is it working?  → answered by the PULSE (running) vs solid (settled).
// Colour = role (designer / critic / both / artist-generating); position = object.
// ──────────────────────────────────────────────────────────────────────────────

/** Who is working on a shot right now — finer than WorkPhase (which is object). */
export type WorkRole = 'designer' | 'critic' | 'artist';

/** Stage → role, for the two per-shot pipelines (references + video). */
const ROLE_OF_STAGE: Partial<Record<PipelineStageId, WorkRole>> = {
  reference_designer: 'designer',
  reference_critic: 'critic',
  episode_references: 'artist',
  shot_designer: 'designer',
  shot_critic: 'critic',
  visual_generator: 'artist',
};

/** Map an agent id to its work ROLE (designer/critic/artist), or null. */
export function workRoleForAgent(agentId: string): WorkRole | null {
  const stage = STAGE_FROM_AGENT[agentId];
  if (!stage) return null;
  return ROLE_OF_STAGE[stage] ?? null;
}

/** Live work on one shot: which object + which roles are running right now. */
export interface ShotWork {
  object: WorkPhase;
  roles: WorkRole[];
}

/**
 * Pure: build `shot_id → { object, roles }` from the episode's jobs. Only
 * RUNNING/QUEUED jobs count. Extends `activeWorkPhaseByShot` with role detail so
 * the timeline can answer "who's working" (designer / critic / both / artist),
 * not just "which object". 'animate' remains the dominant object (q4a priority).
 */
export function activeWorkByShot(
  jobs: ReadonlyArray<JobForShotPhase>,
): Map<string, ShotWork> {
  const acc = new Map<string, { object: WorkPhase; roles: Set<WorkRole> }>();
  for (const j of jobs) {
    if (j.status !== 'RUNNING' && j.status !== 'QUEUED') continue;
    const object = workPhaseForAgent(j.agent_id);
    const role = workRoleForAgent(j.agent_id);
    if (!object || !role) continue;
    const shotId = snapshotShotId(j.input_snapshot);
    if (!shotId) continue;
    const cur = acc.get(shotId);
    if (cur) {
      if (object === 'animate') cur.object = 'animate'; // animate dominant
      cur.roles.add(role);
    } else {
      acc.set(shotId, { object, roles: new Set([role]) });
    }
  }
  const out = new Map<string, ShotWork>();
  for (const [k, v] of acc) out.set(k, { object: v.object, roles: [...v.roles] });
  return out;
}

/**
 * Pure: build `shot_id → { object, roles }` for shots whose designer / critic /
 * artist job has COMPLETED and which have NO active (RUNNING/QUEUED) job right
 * now. Powers the D7 "persistent trail" — a settled, non-pulsing glow that keeps
 * a finished shot visibly marked instead of snapping back to neutral the instant
 * its job leaves the RUNNING set (Director: «glow гаснет мгновенно, хочу след»).
 * Live work always wins (checked first at the call-site), and a shot claimed by
 * `activeWorkByShot` is excluded here so the two maps never both own one shot.
 */
export function completedWorkByShot(
  jobs: ReadonlyArray<JobForShotPhase>,
): Map<string, ShotWork> {
  // Shots with any live job belong to activeWorkByShot — exclude them so the
  // completed trail never fights the live pulse.
  const liveShots = new Set<string>();
  for (const j of jobs) {
    if (j.status !== 'RUNNING' && j.status !== 'QUEUED') continue;
    if (!workRoleForAgent(j.agent_id)) continue;
    const shotId = snapshotShotId(j.input_snapshot);
    if (shotId) liveShots.add(shotId);
  }
  const acc = new Map<string, { object: WorkPhase; roles: Set<WorkRole> }>();
  for (const j of jobs) {
    if (j.status !== 'COMPLETED') continue;
    const object = workPhaseForAgent(j.agent_id);
    const role = workRoleForAgent(j.agent_id);
    if (!object || !role) continue;
    const shotId = snapshotShotId(j.input_snapshot);
    if (!shotId || liveShots.has(shotId)) continue;
    const cur = acc.get(shotId);
    if (cur) {
      if (object === 'animate') cur.object = 'animate'; // animate dominant
      cur.roles.add(role);
    } else {
      acc.set(shotId, { object, roles: new Set([role]) });
    }
  }
  const out = new Map<string, ShotWork>();
  for (const [k, v] of acc) out.set(k, { object: v.object, roles: [...v.roles] });
  return out;
}

/**
 * Role detection for a set of live roles → a stable `token` + human `label`.
 * The COLOUR is no longer emitted here — under the kebab colour grammar
 * (2026-07-25) hue = family × role (see `stageRamp`/`rampStop` below), composed
 * at the call-site from this token. Node-safe (unit-testable).
 */
export function workRolePalette(
  roles: readonly WorkRole[],
): { label: string; token: 'designer' | 'critic' | 'both' | 'artist' } {
  const hasDesigner = roles.includes('designer');
  const hasCritic = roles.includes('critic');
  if (hasDesigner && hasCritic) return { token: 'both', label: 'Designer + Critic' };
  if (hasCritic) return { token: 'critic', label: 'Critic' };
  if (hasDesigner) return { token: 'designer', label: 'Designer' };
  return { token: 'artist', label: 'Generating' };
}