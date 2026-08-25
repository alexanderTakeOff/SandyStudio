// ──────────────────────────────────────────────────────────────────────────────
// lib/api/shot-staging.ts
//
// ПОСТАНОВОЧНЫЙ ПАСПОРТ КАДРА — единственный источник истины о том, ГДЕ стоит
// камера, КАКОЙ оптикой снимает, КАК расставлены герои и ОТКУДА бьёт свет.
//
// Почему это существует (Директор, 2026-08-25): «в pipeline пропущен этап —
// постановка кадра». Станции `reference_designer` / `shot_designer` были, но
// пустые: раскадровка отдавала `camera_angle`, где крупность и ракурс жили в
// ОДНОМ поле, и ни слова о дистанции. Модель добирала недостающее из статистики
// подписей — а там крупные планы лиц это телефон с вытянутой руки. Отсюда
// «селфи с трёх метров»: с 40–60 см основание носа шире примерно на треть
// (JAMA 2018), то есть селфи-лук — ГЕОМЕТРИЯ, а не стиль.
//
// Два закона, ради которых модуль написан:
//   1. КРУПНОСТЬ БЕЗ ДИСТАНЦИИ — НЕ КАДР. Перспективу задаёт только положение
//      камеры; фокусное лишь выбирает, какая крупность получится с этой точки.
//   2. ЧИСЛО ВАЛИДИРУЕТ, ЛУК ДОЕЗЖАЕТ. Ни один провайдер не трактует мм и
//      диафрагмы физически. Числа живут здесь ради V1–V9; в модель уходит
//      словесный эквивалент вместе с признаком, по которому его видно.
//
// Термины: `specs/glossary.md §11`. Ремесло: скилл `shot-staging`.
// ──────────────────────────────────────────────────────────────────────────────

export type ShotSize = 'ECU' | 'BCU' | 'CU' | 'MCU' | 'MS' | 'MLS' | 'FS' | 'LS' | 'ELS';
export type LensLook = 'ultrawide' | 'wide' | 'normal' | 'portrait_tele' | 'tele' | 'macro';
export type Rig =
  | 'tripod' | 'handheld' | 'gimbal' | 'crane' | 'drone'
  | 'selfie' | 'selfie_stick' | 'pov' | 'body_cam';
export type CameraHeight = 'ground' | 'hip' | 'chest' | 'eye_level' | 'high' | 'overhead';
export type CameraMoveType =
  | 'static' | 'pan' | 'tilt' | 'dolly' | 'truck' | 'pedestal'
  | 'arc' | 'crane' | 'whip' | 'tracking';
export type ScreenDirection = 'screen_left' | 'screen_right' | 'to_camera' | 'away';
export type Dof = 'shallow' | 'medium' | 'deep';
export type LightQuality = 'hard' | 'soft';
export type LightPattern = 'butterfly' | 'loop' | 'rembrandt' | 'split' | 'none';
export type Contrast = 'high' | 'medium' | 'flat';

/** Риги, при которых селфи-геометрия ЗАКОНА, а не брак. */
const CLOSE_RIGS: ReadonlySet<Rig> = new Set(['selfie', 'selfie_stick', 'pov', 'body_cam']);

/** Рез ПО суставу читается как ампутация — эти ориентиры запрещены. */
const JOINT_CROPS: ReadonlySet<string> = new Set([
  'wrist', 'elbow', 'knee', 'ankle', 'neck', 'chin', 'waist',
]);

export interface CameraMove {
  type: CameraMoveType;
  direction?: string | null;
  speed?: string | null;
  /** Событие, с которого движение начинается («он опустил бумагу»). */
  start_on?: string | null;
  /** Для дуги: градус облёта. >30° на 5 секунд даёт варпинг. */
  degrees?: number | null;
}

export interface KeyLight {
  /** `on_axis` при лице в кадре = плоское блёклое лицо (V9). */
  direction: string;
  quality?: LightQuality | null;
  pattern?: LightPattern | null;
  /** Контровой: без него фигура «влипает» в фон. */
  rim?: boolean | null;
}

export interface StagingSpec {
  shot_size: ShotSize;
  crop_line?: string | null;
  subject_distance_m?: number | null;
  lens_equiv_mm?: number | null;
  lens_look?: LensLook | null;
  rig?: Rig | null;
  camera_height?: CameraHeight | null;
  camera_angle_deg?: number | null;
  dutch_deg?: number | null;
  camera_move?: CameraMove | null;
  subject_position?: string | null;
  looking_direction?: ScreenDirection | null;
  axis_side?: string | null;
  depth_layers?: { fg?: string | null; mg?: string | null; bg?: string | null } | null;
  key?: KeyLight | null;
  contrast?: Contrast | null;
  color_temp?: string | null;
  dof?: Dof | null;
  focus_subject?: string | null;
}

/**
 * СОВМЕСТИМОСТЬ. До 2026-08-25 крупность и ракурс жили в одном поле
 * `camera_angle`. Старые раскадровки не переснимаются — их значения читаются
 * как крупность там, где это крупность, и как ракурс там, где ракурс.
 */
const LEGACY_SIZE: Readonly<Record<string, ShotSize>> = {
  wide: 'LS',
  medium_wide: 'MLS',
  medium: 'MS',
  close_up: 'CU',
  extreme_close_up: 'ECU',
};
const LEGACY_ANGLE_DEG: Readonly<Record<string, number>> = {
  low_angle: -20,
  top_down: 90,
};

type RawShot = Record<string, unknown>;

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Собрать паспорт из полей шота. Новые поля главнее; чего нет — добирается из
 * легаси `camera_angle`, а не выдумывается. `null` возвращается только когда у
 * шота нет НИ новых полей, НИ распознаваемого легаси — тогда вызывающий обязан
 * сказать это вслух, а не подставить умолчание.
 */
export function parseStaging(shot: RawShot): StagingSpec | null {
  const legacy = str(shot.camera_angle)?.toLowerCase() ?? '';
  const size =
    (str(shot.shot_size)?.toUpperCase() as ShotSize | undefined) ?? LEGACY_SIZE[legacy] ?? null;
  if (!size) return null;

  const rawMove = shot.camera_move as RawShot | undefined;
  const move: CameraMove | null =
    rawMove && typeof rawMove === 'object' && str(rawMove.type)
      ? {
          type: String(rawMove.type) as CameraMoveType,
          direction: str(rawMove.direction),
          speed: str(rawMove.speed),
          start_on: str(rawMove.start_on),
          degrees: num(rawMove.degrees),
        }
      : null;

  const rawKey = shot.key as RawShot | undefined;
  const key: KeyLight | null =
    rawKey && typeof rawKey === 'object' && str(rawKey.direction)
      ? {
          direction: String(rawKey.direction),
          quality: (str(rawKey.quality) as LightQuality | null) ?? null,
          pattern: (str(rawKey.pattern) as LightPattern | null) ?? null,
          rim: typeof rawKey.rim === 'boolean' ? rawKey.rim : null,
        }
      : null;

  const rawDepth = shot.depth_layers as RawShot | undefined;

  return {
    shot_size: size,
    crop_line: str(shot.crop_line),
    subject_distance_m: num(shot.subject_distance_m),
    lens_equiv_mm: num(shot.lens_equiv_mm),
    lens_look: (str(shot.lens_look) as LensLook | null) ?? null,
    rig: (str(shot.rig) as Rig | null) ?? null,
    camera_height: (str(shot.camera_height) as CameraHeight | null) ?? null,
    camera_angle_deg: num(shot.camera_angle_deg) ?? LEGACY_ANGLE_DEG[legacy] ?? null,
    dutch_deg: num(shot.dutch_deg) ?? (legacy === 'dutch' ? 15 : null),
    camera_move: move,
    subject_position: str(shot.subject_position),
    looking_direction: (str(shot.looking_direction) as ScreenDirection | null) ?? null,
    axis_side: str(shot.axis_side),
    depth_layers:
      rawDepth && typeof rawDepth === 'object'
        ? { fg: str(rawDepth.fg), mg: str(rawDepth.mg), bg: str(rawDepth.bg) }
        : null,
    key,
    contrast: (str(shot.contrast) as Contrast | null) ?? null,
    color_temp: str(shot.color_temp),
    dof: (str(shot.dof) as Dof | null) ?? null,
    focus_subject: str(shot.focus_subject),
  };
}

export interface StagingFinding {
  code: `V${number}`;
  severity: 'FAIL' | 'WARN';
  message: string;
}

/**
 * V1–V9 — валидаторы, читаемые ДО денег. Каждый убивает НАЗВАННЫЙ класс брака;
 * проверка без своего дефекта сюда не попадает.
 *
 * `hasFace` — есть ли в кадре лицо (V9 без лица не имеет смысла).
 * `sceneAxis` — сторона оси, уже занятая другими кадрами этой сцены (V6).
 */
export function validateStaging(
  s: StagingSpec,
  ctx: { hasFace?: boolean; sceneAxis?: string | null; durationSeconds?: number | null } = {},
): StagingFinding[] {
  const out: StagingFinding[] = [];
  const dist = s.subject_distance_m;

  // V1 — дистанция и оптика должны давать заявленную крупность.
  if (dist != null && s.lens_equiv_mm != null) {
    const expected = expectedSizeFor(dist, s.lens_equiv_mm);
    if (expected && !sizeWithinTolerance(s.shot_size, expected)) {
      out.push({
        code: 'V1',
        severity: 'FAIL',
        message: `Геометрия не сходится: ${s.subject_distance_m} м на ${s.lens_equiv_mm} мм даёт ${expected}, а заявлено ${s.shot_size}. Меняй дистанцию или фокусное, не подпись.`,
      });
    }
  }

  // V2 — близкая дистанция обязана быть заказанной ригом.
  if (dist != null && dist < 0.8 && !(s.rig && CLOSE_RIGS.has(s.rig))) {
    out.push({
      code: 'V2',
      severity: 'FAIL',
      message: `Дистанция ${dist} м даёт селфи-геометрию (нос шире примерно на треть), но риг «${s.rig ?? 'не задан'}» её не заказывал. Либо риг из селфи-семейства, либо отойди.`,
    });
  }

  // V3 — селфи невозможно с портретной дистанции. Дефект имени «селфи с трёх метров».
  if (s.rig && CLOSE_RIGS.has(s.rig)) {
    if (dist != null && dist > 1.2) {
      out.push({
        code: 'V3',
        severity: 'FAIL',
        message: `Риг «${s.rig}» с дистанции ${dist} м невозможен: рука не длиннее 0,6 м, палка — 1,2 м. Это «селфи с трёх метров».`,
      });
    }
    if (s.lens_look && s.lens_look !== 'wide' && s.lens_look !== 'ultrawide') {
      out.push({
        code: 'V3',
        severity: 'FAIL',
        message: `Риг «${s.rig}» требует широкого лука, заявлен «${s.lens_look}».`,
      });
    }
  }

  // V4 — рез по суставу читается как ампутация.
  if (s.crop_line && JOINT_CROPS.has(s.crop_line.toLowerCase().replace(/^mid[_-]/, ''))) {
    const bare = s.crop_line.toLowerCase();
    if (!bare.startsWith('mid')) {
      out.push({
        code: 'V4',
        severity: 'FAIL',
        message: `Линия реза «${s.crop_line}» проходит по суставу — читается как ампутация. Режь МЕЖДУ суставами (mid_chest, mid_thigh, mid_forearm).`,
      });
    }
  }

  // V5 — воздух по взгляду.
  if (s.looking_direction && s.subject_position) {
    const looksLeft = s.looking_direction === 'screen_left';
    const looksRight = s.looking_direction === 'screen_right';
    const atLeft = /left/i.test(s.subject_position);
    const atRight = /right/i.test(s.subject_position);
    if ((looksLeft && atLeft) || (looksRight && atRight)) {
      out.push({
        code: 'V5',
        severity: 'FAIL',
        message: `Герой в «${s.subject_position}» смотрит «${s.looking_direction}» — взгляд упирается в кромку. Воздух ставится ПО направлению взгляда.`,
      });
    }
  }

  // V6 — ось действия постоянна внутри сцены.
  if (ctx.sceneAxis && s.axis_side && ctx.sceneAxis !== s.axis_side) {
    out.push({
      code: 'V6',
      severity: 'FAIL',
      message: `Сторона оси «${s.axis_side}» против «${ctx.sceneAxis}» у соседних кадров сцены — герои поменяются местами (правило 180°).`,
    });
  }

  // V7 — одно движение; дуга не круче 30° за 5 секунд.
  if (s.camera_move) {
    const d = s.camera_move.degrees;
    const secs = ctx.durationSeconds ?? 5;
    if (s.camera_move.type === 'arc' && d != null && d / Math.max(secs, 1) > 6) {
      out.push({
        code: 'V7',
        severity: 'FAIL',
        message: `Облёт ${d}° за ${secs} с — быстрее 30°/5 с, кадр поплывёт варпингом. Уменьши градус или удлини кадр.`,
      });
    }
  }

  // V8 — малая глубина без названного субъекта фокуса.
  if (s.dof === 'shallow' && !s.focus_subject) {
    out.push({
      code: 'V8',
      severity: 'FAIL',
      message: 'Малая глубина заявлена, а субъект фокуса не назван — резкость уедет не туда.',
    });
  }

  // V9 — фронтальная заливка при лице в кадре.
  if (ctx.hasFace !== false && s.key && /on[_-]?axis|frontal|camera[_-]?axis/i.test(s.key.direction)) {
    out.push({
      code: 'V9',
      severity: 'FAIL',
      message: 'Ключевой свет на оси камеры при лице в кадре — теней нет, лицо плоское и блёклое. Сместить минимум на 45°.',
    });
  }

  return out;
}

/** Порядок крупностей от самой тесной к самой общей — для допуска V1. */
const SIZE_LADDER: readonly ShotSize[] = ['ECU', 'BCU', 'CU', 'MCU', 'MS', 'MLS', 'FS', 'LS', 'ELS'];

function sizeWithinTolerance(declared: ShotSize, expected: ShotSize): boolean {
  const a = SIZE_LADDER.indexOf(declared);
  const b = SIZE_LADDER.indexOf(expected);
  if (a < 0 || b < 0) return true;
  return Math.abs(a - b) <= 1; // соседняя ступень — допустимая погрешность кадрирования
}

/**
 * Какую крупность физически даёт пара «дистанция × фокусное» (эквивалент 35 мм).
 * Считается по вертикальному полю зрения: сколько метров объекта влезает в кадр.
 */
export function expectedSizeFor(distanceM: number, lensMm: number): ShotSize | null {
  if (distanceM <= 0 || lensMm <= 0) return null;
  // Вертикальный размер кадра на дистанции: h = distance * (24мм сенсора / f).
  const coveredM = distanceM * (24 / lensMm);
  if (coveredM < 0.12) return 'ECU';
  if (coveredM < 0.28) return 'BCU';
  if (coveredM < 0.45) return 'CU';
  if (coveredM < 0.75) return 'MCU';
  if (coveredM < 1.1) return 'MS';
  if (coveredM < 1.6) return 'MLS';
  if (coveredM < 2.3) return 'FS';
  if (coveredM < 5) return 'LS';
  return 'ELS';
}

const SIZE_PHRASE: Readonly<Record<ShotSize, string>> = {
  ECU: 'extreme close-up',
  BCU: 'big close-up',
  CU: 'close-up',
  MCU: 'medium close-up',
  MS: 'medium shot',
  MLS: 'medium long shot',
  FS: 'full shot',
  LS: 'wide shot',
  ELS: 'extreme wide shot',
};

const LENS_PHRASE: Readonly<Record<LensLook, string>> = {
  ultrawide: 'ultra-wide lens, strong wide-angle distortion',
  wide: 'wide-angle lens, slight barrel distortion',
  normal: 'normal lens, neutral perspective',
  portrait_tele: 'portrait lens, natural face proportions, no wide-angle distortion, compressed background',
  tele: 'telephoto lens, flattened perspective, compressed background layers',
  macro: 'macro lens, extremely shallow focus',
};

const RIG_PHRASE: Readonly<Record<Rig, string>> = {
  tripod: 'locked-off on a tripod',
  handheld: 'handheld, subtle natural shake',
  gimbal: 'smooth gimbal move',
  crane: 'crane-mounted',
  drone: 'aerial drone shot',
  selfie: "selfie held at arm's length, the subject's own arm visible at the frame edge",
  selfie_stick: 'shot on a selfie stick, camera about a metre away',
  pov: 'first-person POV, hands entering from the bottom of frame',
  body_cam: 'chest-mounted body cam, wide angle, torso motion',
};

/**
 * РЕНДЕР ПАСПОРТА В ПРОМПТ. Числа сюда не попадают голыми: миллиметры и
 * градусы модель не считает, она воспроизводит статистику подписей. Уходит лук
 * ВМЕСТЕ с признаком, по которому его видно.
 */
export function renderStagingForPrompt(s: StagingSpec): string[] {
  const lines: string[] = [];

  const framing = [SIZE_PHRASE[s.shot_size]];
  if (s.crop_line) framing.push(`framed at ${s.crop_line.replace(/_/g, '-')}`);
  lines.push(`- Framing: ${framing.join(', ')}`);

  const optics: string[] = [];
  if (s.subject_distance_m != null) optics.push(`camera about ${s.subject_distance_m} m from the subject`);
  if (s.lens_look) {
    optics.push(s.lens_equiv_mm ? `${s.lens_equiv_mm}mm ${LENS_PHRASE[s.lens_look]}` : LENS_PHRASE[s.lens_look]);
  }
  if (optics.length) lines.push(`- Lens: ${optics.join(', ')}`);

  const placement: string[] = [];
  if (s.camera_height) placement.push(`camera at ${s.camera_height.replace(/_/g, ' ')} height`);
  if (s.camera_angle_deg != null && s.camera_angle_deg !== 0) {
    placement.push(s.camera_angle_deg < 0 ? 'looking up at the subject' : 'looking down at the subject');
  } else if (s.camera_height) {
    placement.push('lens level, not tilted');
  }
  if (s.dutch_deg) placement.push(`horizon tilted about ${Math.abs(s.dutch_deg)} degrees`);
  if (s.rig) placement.push(RIG_PHRASE[s.rig]);
  if (placement.length) lines.push(`- Camera: ${placement.join(', ')}`);

  if (s.camera_move) {
    const m = s.camera_move;
    // «Статика» означает НЕТ ПРОЕЗДА, а не «камера неподвижна»: у рига в руке
    // всегда есть собственное покачивание, и «camera does not move» вместе с
    // селфи — противоречие, которое модель разрешает в пользу манекена
    // (поймано прогоном SH02 S22, 25.08).
    const handheldRig = s.rig != null && (CLOSE_RIGS.has(s.rig) || s.rig === 'handheld');
    const staticPhrase = handheldRig
      ? 'no camera travel — only the natural sway of the hand holding it'
      : 'locked-off static shot, camera does not move';
    const move = [m.speed, m.type === 'static' ? staticPhrase : m.type, m.direction]
      .filter(Boolean)
      .join(' ');
    const gated = m.start_on ? `${move}; the camera does not start moving until ${m.start_on}` : move;
    lines.push(`- Movement (ONE only): ${gated}`);
  }

  const blocking: string[] = [];
  if (s.subject_position) blocking.push(`subject in the ${s.subject_position.replace(/_/g, ' ')}`);
  if (s.looking_direction) {
    blocking.push(
      s.looking_direction === 'to_camera'
        ? 'looking straight into the lens'
        : `looking ${s.looking_direction.replace(/_/g, '-')}, open space on that side`,
    );
  }
  if (s.depth_layers) {
    const d = s.depth_layers;
    const layers = [d.fg && `${d.fg} in the foreground`, d.mg && `${d.mg} in the midground`, d.bg && `${d.bg} in the background`].filter(Boolean);
    if (layers.length) blocking.push(layers.join(', '));
  }
  if (blocking.length) lines.push(`- Blocking: ${blocking.join('; ')}`);

  if (s.key) {
    const light = [`key light ${s.key.direction.replace(/_/g, ' ')}`];
    if (s.key.quality) light.push(`${s.key.quality} quality`);
    if (s.key.pattern && s.key.pattern !== 'none') {
      light.push(
        s.key.pattern === 'rembrandt'
          ? 'Rembrandt pattern, a triangle of light on the shadowed cheek'
          : `${s.key.pattern} lighting pattern`,
      );
    }
    if (s.key.rim) light.push('rim light separating the subject from the background');
    if (s.contrast) light.push(s.contrast === 'flat' ? 'flat even lighting' : `${s.contrast}-contrast`);
    if (s.color_temp) light.push(s.color_temp.replace(/_/g, ' '));
    lines.push(`- Light: ${light.join(', ')}`);
  }

  if (s.dof) {
    const focus = [s.dof === 'shallow' ? 'shallow depth of field' : s.dof === 'deep' ? 'deep focus, everything sharp' : 'moderate depth of field'];
    if (s.focus_subject) focus.push(`focus on ${s.focus_subject} — the sharpest point in frame`);
    lines.push(`- Focus: ${focus.join(', ')}`);
  }

  return lines;
}
