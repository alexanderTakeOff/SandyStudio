import { describe, it, expect } from 'vitest';
import {
  DEFAULT_GENERATION_CONFIG,
  parseCeiling,
  renderApproved,
  renderLimits,
} from '@/lib/telegram/limits';

describe('лимиты эпизода с пульта', () => {
  it('сумма читается так, как её набирают с телефона', () => {
    expect(parseCeiling('25')).toBe(25);
    expect(parseCeiling('$25')).toBe(25);
    expect(parseCeiling(' 25.5 ')).toBe(25.5);
    // Запятая на телефонной клавиатуре ближе точки, и Директор набирает одной рукой.
    expect(parseCeiling('25,5')).toBe(25.5);
  });

  it('мусор и ноль отвергаются — молчаливый ноль остановил бы работу на гейте', () => {
    expect(parseCeiling('')).toBeNull();
    expect(parseCeiling('дофига')).toBeNull();
    expect(parseCeiling('0')).toBeNull();
    expect(parseCeiling('-5')).toBeNull();
  });

  it('лишний ноль не проходит: цена опечатки здесь — реальные деньги', () => {
    expect(parseCeiling('500')).toBe(500);
    expect(parseCeiling('2500')).toBeNull();
  });

  it('состояние прямо говорит, что работа СТОИТ, если закрыта хоть одна из трёх', () => {
    const blocked = renderLimits({
      episodeCode: 'SS-S22-E02',
      ceiling: 25,
      spent: 3,
      approved: false,
      hasGenerationConfig: true,
    });
    expect(blocked).toContain('Тратить НЕЛЬЗЯ');

    // Потолок есть и бюджет утверждён, но настроек нет — гейт всё равно закрыт.
    const noConfig = renderLimits({
      episodeCode: 'SS-S22-E02',
      ceiling: 25,
      spent: 0,
      approved: true,
      hasGenerationConfig: false,
    });
    expect(noConfig).toContain('Тратить НЕЛЬЗЯ');

    const open = renderLimits({
      episodeCode: 'SS-S22-E02',
      ceiling: 25,
      spent: 0,
      approved: true,
      hasGenerationConfig: true,
    });
    expect(open).toContain('Гейт открыт');
  });

  it('подстановка умолчаний ГОВОРИТСЯ вслух — Директор должен знать, чем будут снимать', () => {
    expect(renderApproved('SS-S22-E02', 25, true)).toContain('умолчания студии');
    expect(renderApproved('SS-S22-E02', 25, false)).not.toContain('умолчания студии');
  });

  it('умолчания совпадают с тем, что стоит на живых эпизодах', () => {
    expect(DEFAULT_GENERATION_CONFIG.image.provider_id).toBe('openai-edits-multi');
    expect(DEFAULT_GENERATION_CONFIG.video.provider_id).toBe('seedance-fal-img2vid');
    expect(DEFAULT_GENERATION_CONFIG.video.aspect_ratio).toBe('9:16');
  });
});
