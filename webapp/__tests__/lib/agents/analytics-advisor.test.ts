import { describe, it, expect } from 'vitest';
import {
  buildAdvice,
  confidenceFor,
  qualitySignal,
  viralitySignal,
  holeCards,
  biggestDrop,
  pastGate,
  DEFAULT_ADVISOR_CONFIG,
  type VideoMetric,
} from '@/lib/agents/analytics-advisor';

const short = (over: Partial<VideoMetric> = {}): VideoMetric => ({
  videoId: 'v1',
  kind: 'short',
  title: 'S',
  views: 0,
  avgViewPercentage: 0,
  avgViewDurationSeconds: 0,
  likes: 0,
  comments: 0,
  ...over,
});

describe('metric roles', () => {
  it('quality signal is % viewed (length-normalized), clamped', () => {
    expect(qualitySignal(short({ avgViewPercentage: 82 }))).toBe(82);
    expect(qualitySignal(short({ avgViewPercentage: 140 }))).toBe(100);
  });

  it('virality = loops + shares, NOT likes', () => {
    expect(viralitySignal(short({ loops: 30, shares: 5, likes: 999 }))).toBe(35);
    expect(viralitySignal(short({ likes: 999 }))).toBe(0);
  });
});

describe('exposure gate (views as gate, not quality)', () => {
  it('below the gate → confidence none, however high the completion', () => {
    const m = short({ views: 40, avgViewPercentage: 95 });
    expect(confidenceFor(m, DEFAULT_ADVISOR_CONFIG)).toBe('none');
  });
  it('scales with views once past the gate', () => {
    expect(confidenceFor(short({ views: 100 }), DEFAULT_ADVISOR_CONFIG)).toBe('flag');
    expect(confidenceFor(short({ views: 1000 }), DEFAULT_ADVISOR_CONFIG)).toBe('low');
    expect(confidenceFor(short({ views: 3000 }), DEFAULT_ADVISOR_CONFIG)).toBe('medium');
  });
  it('pastGate filters to readable videos', () => {
    const ms = [short({ views: 10 }), short({ views: 500 })];
    expect(pastGate(ms, DEFAULT_ADVISOR_CONFIG)).toHaveLength(1);
  });
});

describe('holes axis', () => {
  it('emits a hypothesis card for every untested category', () => {
    const cards = holeCards(['living', 'inanimate', 'environmental'], ['living']);
    expect(cards).toHaveLength(2);
    expect(cards[0].axis).toBe('holes');
    expect(cards[0].testNext).toMatch(/Ship one/);
    expect(cards.every((c) => c.confidence === 'flag')).toBe(true);
  });
});

describe('scout mode / silence threshold', () => {
  it('with tiny N emits holes + flags but NO mandate to "make more"', () => {
    const rep = buildAdvice({
      metrics: [short({ videoId: 'a', views: 120, avgViewPercentage: 90 })],
      taxonomy: ['living', 'inanimate'],
      shippedCategories: [],
    });
    expect(rep.mode).toBe('scout');
    const amp = rep.cards.find((c) => c.axis === 'amplify_gag');
    // present but as an observe-only flag, never a mandate
    expect(amp?.confidence).toBe('flag');
    expect(amp?.headline).toMatch(/observe/i);
    expect(rep.confidenceNote).toMatch(/no "make more of X" yet|Scout mode/i);
  });

  it('flips to optimize once the sample clears the floor', () => {
    const metrics = Array.from({ length: 25 }, (_, i) =>
      short({ videoId: `v${i}`, views: 500, avgViewPercentage: 60 + (i % 5) }),
    );
    const rep = buildAdvice({ metrics, taxonomy: ['living'], shippedCategories: ['living'], config: DEFAULT_ADVISOR_CONFIG });
    expect(rep.mode).toBe('optimize');
    expect(rep.sampleSize).toBe(25);
  });
});

describe('long-form retention drop', () => {
  it('finds the biggest fall position', () => {
    const d = biggestDrop([1, 0.95, 0.9, 0.4, 0.38]);
    expect(d).not.toBeNull();
    expect(d!.atRatio).toBeCloseTo(0.75, 2); // index 3 of 4
  });
  it('null for a flat/short curve', () => {
    expect(biggestDrop([0.5])).toBeNull();
    expect(biggestDrop([0.5, 0.6, 0.7])).toBeNull();
  });
  it('skips the universal opening-seconds bounce', () => {
    // 100 samples: steep universal bounce in the first 3% (1 → 0.6), then a real
    // story problem at ~50% (0.55 → 0.35). The naive version blamed the opening.
    const curve = Array.from({ length: 101 }, (_, i) => {
      if (i === 0) return 1;
      if (i <= 3) return 0.6; // opening bounce: fall of 0.4 at atRatio 0.01
      if (i < 50) return 0.55;
      return 0.35; // the real drop at atRatio ~0.5
    });
    const d = biggestDrop(curve);
    expect(d).not.toBeNull();
    expect(d!.atRatio).toBeGreaterThan(0.4); // NOT the opening bounce
  });
  it('null when every fall is below the noise threshold', () => {
    // Gentle monotone decay — no localized story problem to flag.
    const curve = Array.from({ length: 60 }, (_, i) => 1 - i * 0.004);
    expect(biggestDrop(curve)).toBeNull();
  });
  it('smoothing keeps a sharp real drop detectable on a long curve', () => {
    const curve = Array.from({ length: 90 }, (_, i) => (i < 60 ? 0.8 : 0.5));
    const d = biggestDrop(curve);
    expect(d).not.toBeNull();
    expect(d!.atRatio).toBeCloseTo(60 / 89, 1);
  });
});
