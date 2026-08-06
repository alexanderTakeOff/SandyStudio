// ──────────────────────────────────────────────────────────────────────────────
// __tests__/lib/api/channel-stages.test.ts
//
// Главное, что закрепляют эти тесты, — правило Директора (06.08): КАНАЛ
// ОПЦИОНАЛЕН. «Не каждый сериал будет иметь или нуждаться в канале». Серия без
// канала — законное состояние: не ошибка, не HALT, не пустой экран, и главное —
// производство идёт как ни в чём не бывало.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import { blocksProduction, buildChannelSnapshot } from '@/lib/api/channel-stages';

const NOW = Date.parse('2026-08-06T12:00:00Z');

const fullChannel = {
  id: 'ch-1',
  name: 'Sandy the Hourglass',
  credential_key: 'SANDY',
  youtube_channel_id: 'UC123',
  metadata: { publish_defaults: { category_id: '23' }, branding: { short_tags: ['sandy'] } },
};

describe('buildChannelSnapshot — серия без канала', () => {
  it('состояние not_applicable, а не «ошибка» и не «пусто»', () => {
    const snap = buildChannelSnapshot({ channel: null, nowMs: NOW });
    expect(snap.state).toBe('not_applicable');
    expect(snap.channelId).toBeNull();
  });

  it('нечему не хватать — ни блокеров, ни замечаний', () => {
    const snap = buildChannelSnapshot({ channel: null, nowMs: NOW });
    expect(snap.publishBlockers).toEqual([]);
    expect(snap.notes).toEqual([]);
  });

  it('производство НЕ блокируется — правило записано в коде, а не подразумевается', () => {
    expect(blocksProduction(buildChannelSnapshot({ channel: null, nowMs: NOW }))).toBe(false);
  });
});

describe('buildChannelSnapshot — канал есть', () => {
  it('полный паспорт → ready, блокеров нет', () => {
    const snap = buildChannelSnapshot({
      channel: fullChannel,
      latestAudience: { captured_at: '2026-08-06T09:00:00Z', views: 10993, subscribers: 12 },
      nowMs: NOW,
    });
    expect(snap.state).toBe('ready');
    expect(snap.publishBlockers).toEqual([]);
    expect(snap.readiness.hasPassport).toBe(true);
    expect(snap.readiness.hasCredentials).toBe(true);
    expect(snap.readiness.audienceAgeHours).toBeCloseTo(3, 1);
  });

  it('нет ключа доступа → incomplete, и блокер про ЗАЛИВКУ, не про съёмку', () => {
    const snap = buildChannelSnapshot({
      channel: { ...fullChannel, credential_key: null },
      nowMs: NOW,
    });
    expect(snap.state).toBe('incomplete');
    expect(snap.publishBlockers.join(' ')).toContain('заливка невозможна');
  });

  it('нет id площадки → публиковать некуда', () => {
    const snap = buildChannelSnapshot({
      channel: { ...fullChannel, youtube_channel_id: null },
      nowMs: NOW,
    });
    expect(snap.publishBlockers.join(' ')).toContain('публиковать некуда');
  });

  it('даже incomplete-канал не блокирует ПРОИЗВОДСТВО', () => {
    const snap = buildChannelSnapshot({ channel: { id: 'ch-2' }, nowMs: NOW });
    expect(snap.state).toBe('incomplete');
    expect(blocksProduction(snap)).toBe(false);
  });

  it('замечания отделены от блокеров — смешанные, они учат игнорировать оба', () => {
    const snap = buildChannelSnapshot({
      channel: { ...fullChannel, metadata: {} },
      nowMs: NOW,
    });
    // Упаковки и брендинга нет — но публиковать это не мешает.
    expect(snap.publishBlockers).toEqual([]);
    expect(snap.state).toBe('ready');
    expect(snap.notes.join(' ')).toContain('упаковка по умолчанию не задана');
    expect(snap.notes.join(' ')).toContain('брендинг канала не заполнен');
  });

  it('устаревший снимок аудитории — замечание с числом, а не молчание', () => {
    const snap = buildChannelSnapshot({
      channel: fullChannel,
      latestAudience: { captured_at: '2026-08-01T12:00:00Z' },
      nowMs: NOW,
    });
    expect(snap.readiness.hasAudienceData).toBe(true);
    expect(snap.notes.join(' ')).toContain('старше 120 ч');
  });

  it('снимков нет вовсе — сказано прямо: рост измерять нечем', () => {
    const snap = buildChannelSnapshot({ channel: fullChannel, nowMs: NOW });
    expect(snap.readiness.hasAudienceData).toBe(false);
    expect(snap.notes.join(' ')).toContain('рост измерять нечем');
  });

  it('битая дата снимка не роняет функцию', () => {
    const snap = buildChannelSnapshot({
      channel: fullChannel,
      latestAudience: { captured_at: 'позавчера' },
      nowMs: NOW,
    });
    expect(snap.readiness.audienceAgeHours).toBeNull();
    expect(snap.state).toBe('ready');
  });
});
