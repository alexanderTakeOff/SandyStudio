// ──────────────────────────────────────────────────────────────────────────────
// lib/api/eref-spatial-coverage.ts
//
// Spatial Coverage Manifest — derives per-shot spatial direction from
// storyboard fields BEFORE EREF runs gpt-image-1 so each reference frame is
// visibly placed at a different viewpoint inside the same location.
//
// Why this exists (2026-05-12 Director directive via PA observation):
//   Without this layer, EREF treats `location: perfume_counter_bar` as "the
//   location image" and every shot of that location collapses onto the same
//   flat plate. The Storyboard Artist's camera_angle/camera_movement work and
//   the human director's spatial intent are lost at gpt-image-1 time.
//
// What this layer does NOT do (yet):
//   - It does NOT replace the Storyboard Artist's per-shot camera vocab —
//     storyboard remains the canonical source.
//   - It does NOT yet persist as a separate `STA-spatial_coverage` asset.
//     A full asset + UI is a follow-up. The MVP runs the derivation inside
//     the EREF runner before composing prompts.
//   - It does NOT auto-generate a sub-area when the storyboard never gave
//     one — it lifts whatever signal is present (sub_area, camera_angle,
//     camera_movement, characters role) into a structured per-shot anchor.
//
// MVP heuristic for spatial_anchor / camera_direction:
//   1. If storyboard already provided `location.sub_area`, use it verbatim.
//   2. Otherwise derive a soft anchor by composing camera_angle + shot_role
//      ("wide-establishing", "closeup-reaction", "medium-action") so adjacent
//      shots in the same location at least describe different framings.
//   3. camera_direction maps from camera_movement vocabulary to a one-line
//      cinematographer-readable phrase ("retreating from subject", "rotating
//      around subject", "fixed framing"). Falls back to "static framing"
//      when camera_movement is absent.
//   4. variation_note flags repeated anchors within the same location and
//      tells gpt-image-1 to choose a visibly different vantage point.
// ──────────────────────────────────────────────────────────────────────────────

export interface SpatialShotInput {
  shot_id: string;
  location: string;
  location_sub_area?: string;
  camera_angle?: string;
  camera_movement?: string;
  camera_motivation?: string;
  shot_role?: string;
  characters_present: string[];
}

export interface SpatialShotEntry {
  shot_id: string;
  location: string;
  spatial_anchor: string;
  camera_direction: string;
  variation_note: string;
}

const MOVEMENT_TO_DIRECTION: Readonly<Record<string, string>> = {
  static_locked_off: 'fixed framing locked off — no camera motion',
  slight_handheld_drift: 'barely-perceptible handheld waver, framing essentially still',
  slow_push_in: 'slow forward dolly — viewer moves toward the subject',
  slight_push_in: 'small forward dolly — gentle approach toward subject',
  slow_push_in_close: 'continuous forward dolly into a tight framing',
  dolly_with_subject: 'camera tracks alongside the subject as they move',
  slow_pullback: 'slow backward dolly — viewer retreats, framing widens',
  slow_pullback_reveal: 'slow pullback that reveals new context behind',
  slow_pullback_to_two_shot: 'slow pullback ending in a symmetric two-shot',
  slow_dolly_back: 'smooth backward dolly that widens the gap between subjects',
  whip_pan_recover: 'whip-pan reactive swing then snap back to centred framing',
  accelerating_zoom: 'zoom-in that ramps up speed — tempo lift',
  rack_zoom_kaleidoscope: 'wide reveal combined with rotational kaleidoscope effect',
  rapid_shake_static_burst: 'short handheld shake bursts in roughly six-frame increments',
  dutch_tilt_rotation: 'slow dutch tilt off-horizontal — axis rotating',
  slow_orbit_around_subject: 'camera arcs slowly around the subject — world rotates around them',
  orbit_pullback: 'orbital motion combined with backward dolly — rotation and distance stack',
};

function inferAnchor(shot: SpatialShotInput): string {
  if (shot.location_sub_area && shot.location_sub_area.trim().length > 0) {
    return shot.location_sub_area;
  }
  const role = (shot.shot_role ?? 'action').toLowerCase();
  const angle = (shot.camera_angle ?? 'medium').toLowerCase();
  const subject = shot.characters_present[0] ?? null;
  if (role === 'reaction' && subject) {
    return `tight framing on ${subject}`;
  }
  if (role === 'establishing') {
    return `wide vantage over the location`;
  }
  if (angle === 'wide' || angle === 'extreme_wide') {
    return `wide spatial framing covering the action area`;
  }
  if (angle === 'close_up' || angle === 'extreme_close_up') {
    return `tight framing on ${subject ?? 'the focal element'}`;
  }
  if (angle === 'over_shoulder' && subject) {
    return `over-shoulder vantage anchored on ${subject}`;
  }
  return `${role} framing — vary spatially from neighbouring shots`;
}

function inferDirection(shot: SpatialShotInput): string {
  const m = shot.camera_movement?.toLowerCase();
  if (m && MOVEMENT_TO_DIRECTION[m]) return MOVEMENT_TO_DIRECTION[m]!;
  if (m && m.length > 0) return `${m.replace(/_/g, ' ')} (movement) — interpret per cinematographer convention`;
  return 'static framing — no camera motion implied';
}

/**
 * Derive a Spatial Coverage Manifest entry per shot.
 *
 * Pure function — no I/O. Idempotent. Order-preserving.
 * The `variation_note` field counts how many earlier shots share the same
 * location and (when relevant) the same anchor, so gpt-image-1 receives an
 * explicit instruction to choose a fresh vantage point.
 */
export function deriveSpatialCoverage(shots: readonly SpatialShotInput[]): SpatialShotEntry[] {
  const seenAnchorsByLocation = new Map<string, Map<string, number>>();
  const result: SpatialShotEntry[] = [];

  for (const shot of shots) {
    const anchor = inferAnchor(shot);
    const direction = inferDirection(shot);

    const perLoc = seenAnchorsByLocation.get(shot.location) ?? new Map<string, number>();
    const prevCount = perLoc.get(anchor) ?? 0;
    perLoc.set(anchor, prevCount + 1);
    seenAnchorsByLocation.set(shot.location, perLoc);

    const totalInLocation = Array.from(perLoc.values()).reduce((a, b) => a + b, 0);
    const isRepeat = prevCount > 0;
    let variation_note: string;
    if (totalInLocation === 1) {
      variation_note = `First shot inside "${shot.location}". Establish the spatial frame; later shots must vary from this vantage.`;
    } else if (isRepeat) {
      variation_note =
        `Anchor "${anchor}" already used in this location for shot #${totalInLocation - 1}. ` +
        `Use a visibly DIFFERENT vantage point within the same location (e.g. opposite side of the counter, reverse angle, along-counter view, behind-shelf perspective) so the audience reads it as the same place but a new direction.`;
    } else {
      variation_note =
        `Shot #${totalInLocation} in this location. Previous anchors covered other vantages — keep "${anchor}" but compose so the frame does NOT replicate any earlier shot's exact angle.`;
    }

    result.push({
      shot_id: shot.shot_id,
      location: shot.location,
      spatial_anchor: anchor,
      camera_direction: direction,
      variation_note,
    });
  }

  return result;
}

/**
 * Render a single SpatialShotEntry as the camera/spatial block to inject into
 * the gpt-image-1 prompt. Returns an array of lines so the caller can splice
 * it into a multi-line prompt without committing to a final separator.
 */
export function formatSpatialBlockForPrompt(entry: SpatialShotEntry): string[] {
  return [
    'Camera & spatial direction (must inform composition — DO NOT default to the same flat angle for every shot of this location):',
    `- Spatial anchor inside the location: ${entry.spatial_anchor}`,
    `- Camera direction: ${entry.camera_direction}`,
    `- Variation rule: ${entry.variation_note}`,
  ];
}
