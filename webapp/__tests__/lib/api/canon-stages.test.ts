// ──────────────────────────────────────────────────────────────────────────────
// __tests__/lib/api/canon-stages.test.ts
//
// Канон серии был единственной сущностью студии без состояния НИГДЕ, и его
// отказ диагностировался как отказ ЭПИЗОДА: пустой канон роняет Reference
// Artist на префлайте, и Директор видит красный эпизод там, где болен сериал.
// Эти тесты закрепляют, что отказ теперь называется на своём уровне.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import { buildCanonSnapshot, canonPlateState, type CanonAssetLike } from '@/lib/api/canon-stages';

const plate = (over: Partial<CanonAssetLike> & { file_type: string }): CanonAssetLike => ({
  id: over.file_type,
  status: 'DRAFT',
  ...over,
});

describe('canonPlateState — ось «ассет × стадия»: text → image → verdict → LOCK', () => {
  it('пустая плита стоит на первой стадии и ждёт картинку только после текста', () => {
    const s = canonPlateState(plate({ file_type: 'SBL-character_sandy' }));
    expect(s.stage).toBe('text');
    expect(s.blockedAt).toBe('text');
    expect(s.hasText).toBe(false);
  });

  it('текст есть, картинки нет — стоит на text и ждёт image', () => {
    const s = canonPlateState(plate({ file_type: 'SBL-character_sandy', content: 'колба запечатана' }));
    expect(s.stage).toBe('text');
    expect(s.blockedAt).toBe('image');
  });

  it('картинка есть, вердикта нет — дошла до image, ждёт verdict', () => {
    const s = canonPlateState(
      plate({ file_type: 'SBL-style_2d', content: 'стиль', drive_path: '/api/media/x.png' }),
    );
    expect(s.stage).toBe('image');
    expect(s.blockedAt).toBe('verdict');
  });

  it('APPROVED без LOCK — путь пройден до последней двери', () => {
    const s = canonPlateState(
      plate({ file_type: 'SBL-style_2d', status: 'APPROVED', content: 'x', drive_file_id: 'd1' }),
    );
    expect(s.stage).toBe('verdict');
    expect(s.blockedAt).toBe('locked');
  });

  it('LOCKED — конец пути, ничего не ждёт', () => {
    const s = canonPlateState(
      plate({ file_type: 'SBL-character_sandy', status: 'LOCKED', content: 'x', staging_path: '/p.png' }),
    );
    expect(s.stage).toBe('locked');
    expect(s.blockedAt).toBeNull();
  });

  it('вердикт читается и из описания, и из тела — та же форма, что у конвейера', () => {
    expect(canonPlateState(plate({ file_type: 'SBL-x', description: '… verdict REVISE · cost' })).verdict).toBe('REVISE');
    expect(canonPlateState(plate({ file_type: 'SBL-x', content: '{"verdict": "FAIL"}' })).verdict).toBe('FAIL');
    expect(canonPlateState(plate({ file_type: 'SBL-x', description: 'verdict PASS_WITH_UNCERTAINTY' })).verdict).toBe('PASS');
  });

  it('род плиты выводится из слага', () => {
    expect(canonPlateState(plate({ file_type: 'SBL-character_a' })).kind).toBe('character');
    expect(canonPlateState(plate({ file_type: 'SBL-style_b' })).kind).toBe('style');
    expect(canonPlateState(plate({ file_type: 'SBL-location_c' })).kind).toBe('location');
    expect(canonPlateState(plate({ file_type: 'SBL-object_d' })).kind).toBe('object');
    expect(canonPlateState(plate({ file_type: 'SBL-mystery' })).kind).toBe('other');
  });
});

describe('buildCanonSnapshot — отказ называется на языке СЕРИИ', () => {
  const locked = (ft: string) => plate({ file_type: ft, status: 'LOCKED', content: 'x', drive_path: '/p.png' });

  it('серии без канона говорит именно это, а не «эпизод сломан»', () => {
    const snap = buildCanonSnapshot([]);
    expect(snap.total).toBe(0);
    expect(snap.productionReady).toBe(false);
    expect(snap.blockers[0]).toContain('канона нет вовсе');
  });

  it('порог производства — LOCKED персонаж И LOCKED стиль, тот же что в префлайте', () => {
    const onlyCharacter = buildCanonSnapshot([locked('SBL-character_sandy')]);
    expect(onlyCharacter.productionReady).toBe(false);
    expect(onlyCharacter.blockers.join(' ')).toContain('LOCKED стиля');

    const both = buildCanonSnapshot([locked('SBL-character_sandy'), locked('SBL-style_2d')]);
    expect(both.productionReady).toBe(true);
    expect(both.blockers).toEqual([]);
  });

  it('локаций и объектов для порога недостаточно — они не заменяют персонажа и стиль', () => {
    const snap = buildCanonSnapshot([locked('SBL-location_hall'), locked('SBL-object_anvil')]);
    expect(snap.productionReady).toBe(false);
    expect(snap.blockers.join(' ')).toContain('LOCKED персонажа');
  });

  it('счётчик считает ЗАПЕРТЫЕ плиты, а не заведённые', () => {
    const snap = buildCanonSnapshot([
      locked('SBL-character_sandy'),
      locked('SBL-style_2d'),
      plate({ file_type: 'SBL-location_hall', content: 'зал' }),
    ]);
    expect(snap.total).toBe(3);
    expect(snap.locked).toBe(2);
  });

  it('недоведённые плиты названы поимённо с тем, чего каждая ждёт', () => {
    const snap = buildCanonSnapshot([
      locked('SBL-character_sandy'),
      locked('SBL-style_2d'),
      plate({ file_type: 'SBL-location_hall', content: 'зал' }),
    ]);
    const line = snap.blockers.join(' ');
    expect(line).toContain('location_hall');
    expect(line).toContain('image');
    // Порог производства при этом ПРОЙДЕН: недоведённая локация не блокирует старт.
    expect(snap.productionReady).toBe(true);
  });

  it('не-канонные ассеты игнорируются — знание о префиксе живёт в модуле', () => {
    const snap = buildCanonSnapshot([
      locked('SBL-character_sandy'),
      locked('SBL-style_2d'),
      plate({ file_type: 'IMG-episode_ref_s15_e36_sh01', status: 'APPROVED' }),
      plate({ file_type: 'VID-final_cut', status: 'APPROVED' }),
    ]);
    expect(snap.total).toBe(2);
  });

  it('плиты отсортированы по слагу — порядок не зависит от порядка выборки', () => {
    const snap = buildCanonSnapshot([locked('SBL-style_2d'), locked('SBL-character_sandy')]);
    expect(snap.plates.map((p) => p.slug)).toEqual(['character_sandy', 'style_2d']);
  });
});
