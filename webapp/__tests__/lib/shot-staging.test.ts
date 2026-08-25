// Сторож постановочного паспорта (Директор q14/q15, 2026-08-25).
//
// Каждый тест назван по дефекту, который валидатор обязан поймать: правило без
// сторожа не считается записанным (CLAUDE.md §11 п.9).
import { describe, expect, it } from 'vitest';
import {
  expectedSizeFor,
  parseStaging,
  renderStagingForPrompt,
  validateStaging,
  type StagingSpec,
} from '../../lib/api/shot-staging';

const base: StagingSpec = {
  shot_size: 'MCU',
  crop_line: 'mid_chest',
  subject_distance_m: 2.0,
  lens_equiv_mm: 85,
  lens_look: 'portrait_tele',
  rig: 'tripod',
  camera_height: 'eye_level',
  camera_angle_deg: 0,
  dutch_deg: 0,
  camera_move: { type: 'static' },
  subject_position: 'right_third',
  looking_direction: 'screen_left',
  axis_side: 'A',
  depth_layers: null,
  key: { direction: 'camera_left_45', quality: 'hard', pattern: 'rembrandt', rim: true },
  contrast: 'high',
  color_temp: 'daylight_cool',
  dof: 'shallow',
  focus_subject: 'his eyes',
};

const codes = (s: StagingSpec, ctx = {}) => validateStaging(s, ctx).map((f) => f.code);

describe('постановочный паспорт — валидаторы', () => {
  it('исправно поставленный кадр не даёт ни одного замечания', () => {
    expect(codes(base)).toEqual([]);
  });

  it('V3 ловит «селфи с трёх метров» — риг селфи на портретной дистанции', () => {
    const bad = { ...base, rig: 'selfie' as const, subject_distance_m: 3.0 };
    expect(codes(bad)).toContain('V3');
  });

  it('V2 ловит селфи-геометрию, которую никто не заказывал', () => {
    // 0,5 м даёт расширенный нос независимо от того, что написано в подписи.
    const bad = { ...base, subject_distance_m: 0.5, lens_equiv_mm: 24, lens_look: 'wide' as const, shot_size: 'CU' as const };
    expect(codes(bad)).toContain('V2');
  });

  it('V1 ловит недостижимую геометрию: крупность не сходится с дистанцией и оптикой', () => {
    const bad = { ...base, shot_size: 'ECU' as const, subject_distance_m: 5, lens_equiv_mm: 24 };
    expect(codes(bad)).toContain('V1');
  });

  it('V4 ловит рез по суставу — ампутацию', () => {
    expect(codes({ ...base, crop_line: 'wrist' })).toContain('V4');
    expect(codes({ ...base, crop_line: 'mid_forearm' })).not.toContain('V4');
  });

  it('V5 ловит взгляд в кромку — воздух не с той стороны', () => {
    const bad = { ...base, subject_position: 'left_third', looking_direction: 'screen_left' as const };
    expect(codes(bad)).toContain('V5');
  });

  it('V6 ловит переход через ось — герои поменяются местами между кадрами', () => {
    expect(codes(base, { sceneAxis: 'B' })).toContain('V6');
    expect(codes(base, { sceneAxis: 'A' })).not.toContain('V6');
  });

  it('V7 ловит слишком быстрый облёт — варпинг', () => {
    const bad = { ...base, camera_move: { type: 'arc' as const, degrees: 90 } };
    expect(codes(bad, { durationSeconds: 5 })).toContain('V7');
    expect(codes({ ...base, camera_move: { type: 'arc' as const, degrees: 20 } }, { durationSeconds: 5 })).not.toContain('V7');
  });

  it('V8 ловит малую глубину без названного субъекта фокуса', () => {
    expect(codes({ ...base, focus_subject: null })).toContain('V8');
  });

  it('V9 ловит фронтальную заливку — плоское блёклое лицо', () => {
    const bad = { ...base, key: { direction: 'on_axis', quality: 'soft' as const, pattern: 'none' as const, rim: false } };
    expect(codes(bad, { hasFace: true })).toContain('V9');
    // Без лица в кадре свет на оси не является браком.
    expect(codes(bad, { hasFace: false })).not.toContain('V9');
  });
});

describe('постановочный паспорт — чтение и рендер', () => {
  it('читает новые поля кадра', () => {
    const s = parseStaging({ shot_size: 'CU', subject_distance_m: 1.8, rig: 'handheld' });
    expect(s?.shot_size).toBe('CU');
    expect(s?.rig).toBe('handheld');
  });

  it('СОВМЕСТИМОСТЬ: старая раскадровка без паспорта читается через camera_angle', () => {
    // До 25.08 крупность и ракурс жили в одном поле; старые доски не переснимаются.
    expect(parseStaging({ camera_angle: 'medium' })?.shot_size).toBe('MS');
    expect(parseStaging({ camera_angle: 'extreme_close_up' })?.shot_size).toBe('ECU');
    // Ракурс, доставшийся из легаси вместе с крупностью, читается обоими полями.
    const low = parseStaging({ shot_size: 'MS', camera_angle: 'low_angle' });
    expect(low?.camera_angle_deg).toBeLessThan(0);
  });

  it('легаси-РАКУРС без крупности паспортом не считается — паспорта без крупности не бывает', () => {
    // `low_angle` говорит, куда смотрит камера, и молчит о том, что в кадре.
    // Подставлять крупность наугад — ровно тот дефект, ради которого паспорт заведён;
    // сырой camera_angle при этом уезжает в промпт отдельной строкой и не теряется.
    expect(parseStaging({ camera_angle: 'low_angle' })).toBeNull();
  });

  it('шот без паспорта и без легаси отдаёт null — вызывающий обязан сказать это вслух', () => {
    expect(parseStaging({ shot_id: 'SH01' })).toBeNull();
  });

  it('в промпт уходит ЛУК, а не голое число', () => {
    const lines = renderStagingForPrompt(base).join('\n');
    expect(lines).toContain('medium close-up');
    expect(lines).toContain('portrait lens');
    expect(lines).toContain('no wide-angle distortion');
    // Схема света приходит с признаком, по которому её видно.
    expect(lines).toContain('triangle of light');
  });

  it('геометрия считается, а не угадывается', () => {
    expect(expectedSizeFor(2.0, 85)).toBe('MCU');
    expect(expectedSizeFor(0.5, 24)).toBe('MCU');
    expect(expectedSizeFor(10, 24)).toBe('ELS');
  });
});
