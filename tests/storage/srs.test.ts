import { describe, it, expect } from 'vitest';
import { scoreToQuality, calculateNextReview } from '../../src/lib/storage/srs';

describe('scoreToQuality', () => {
  it('maps 95–100 to quality 5 (perfect)', () => {
    expect(scoreToQuality(100)).toBe(5);
    expect(scoreToQuality(95)).toBe(5);
  });

  it('maps 85–94 to quality 4', () => {
    expect(scoreToQuality(94)).toBe(4);
    expect(scoreToQuality(85)).toBe(4);
  });

  it('maps 75–84 to quality 3', () => {
    expect(scoreToQuality(84)).toBe(3);
    expect(scoreToQuality(75)).toBe(3);
  });

  it('maps 60–74 to quality 2', () => {
    expect(scoreToQuality(74)).toBe(2);
    expect(scoreToQuality(60)).toBe(2);
  });

  it('maps 40–59 to quality 1', () => {
    expect(scoreToQuality(59)).toBe(1);
    expect(scoreToQuality(40)).toBe(1);
  });

  it('maps 0–39 to quality 0 (complete forgetting)', () => {
    expect(scoreToQuality(39)).toBe(0);
    expect(scoreToQuality(0)).toBe(0);
  });
});

describe('calculateNextReview', () => {
  const DEFAULT_EF = 2.5;

  describe('first review (reviewCount = 0)', () => {
    it('sets interval to 1 day on success (quality >= 3)', () => {
      const result = calculateNextReview(3, { interval: 0, easeFactor: DEFAULT_EF, reviewCount: 0 });
      expect(result.interval).toBe(1);
      expect(result.reviewCount).toBe(1);
    });

    it('resets and sets interval to 1 day on failure (quality < 3)', () => {
      const result = calculateNextReview(2, { interval: 0, easeFactor: DEFAULT_EF, reviewCount: 0 });
      expect(result.interval).toBe(1);
      expect(result.reviewCount).toBe(0);
    });
  });

  describe('second review (reviewCount = 1)', () => {
    it('sets interval to 6 days on success', () => {
      const result = calculateNextReview(4, { interval: 1, easeFactor: DEFAULT_EF, reviewCount: 1 });
      expect(result.interval).toBe(6);
      expect(result.reviewCount).toBe(2);
    });
  });

  describe('subsequent reviews (reviewCount >= 2)', () => {
    it('multiplies interval by easeFactor', () => {
      const result = calculateNextReview(4, { interval: 6, easeFactor: DEFAULT_EF, reviewCount: 2 });
      expect(result.interval).toBe(Math.round(6 * DEFAULT_EF));
      expect(result.reviewCount).toBe(3);
    });
  });

  describe('lapse (quality < 3)', () => {
    it('resets interval to 1 and reviewCount to 0', () => {
      const result = calculateNextReview(1, { interval: 15, easeFactor: DEFAULT_EF, reviewCount: 5 });
      expect(result.interval).toBe(1);
      expect(result.reviewCount).toBe(0);
    });

    it('reduces easeFactor on lapse', () => {
      const result = calculateNextReview(1, { interval: 6, easeFactor: DEFAULT_EF, reviewCount: 2 });
      expect(result.easeFactor).toBeLessThan(DEFAULT_EF);
    });

    it('floors easeFactor at 1.3', () => {
      const result = calculateNextReview(0, { interval: 1, easeFactor: 1.3, reviewCount: 0 });
      expect(result.easeFactor).toBeGreaterThanOrEqual(1.3);
    });
  });

  describe('easeFactor update (SM-2 formula)', () => {
    it('increases easeFactor for quality 5', () => {
      const result = calculateNextReview(5, { interval: 6, easeFactor: DEFAULT_EF, reviewCount: 2 });
      expect(result.easeFactor).toBeGreaterThan(DEFAULT_EF);
    });

    it('keeps easeFactor roughly stable for quality 4', () => {
      const result = calculateNextReview(4, { interval: 6, easeFactor: DEFAULT_EF, reviewCount: 2 });
      // EF + (0.1 - 1*(0.08 + 1*0.02)) = EF + 0
      expect(result.easeFactor).toBeCloseTo(DEFAULT_EF, 5);
    });

    it('decreases easeFactor for quality 3', () => {
      const result = calculateNextReview(3, { interval: 6, easeFactor: DEFAULT_EF, reviewCount: 2 });
      expect(result.easeFactor).toBeLessThan(DEFAULT_EF);
    });
  });

  describe('nextReviewAt', () => {
    it('returns an ISO timestamp in the future', () => {
      const before = new Date();
      const result = calculateNextReview(4, { interval: 6, easeFactor: DEFAULT_EF, reviewCount: 2 });
      const reviewDate = new Date(result.nextReviewAt);
      expect(reviewDate.getTime()).toBeGreaterThan(before.getTime());
    });
  });
});
