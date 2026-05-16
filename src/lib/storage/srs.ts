/**
 * SM-2 Spaced Repetition Algorithm Implementation
 * Reference: https://en.wikipedia.org/wiki/Spaced_repetition
 */

export interface SRSState {
  interval: number;    // Days until next review
  easeFactor: number;  // E-Factor (2.5 default)
  reviewCount: number; // Number of successful reviews
}

export interface SRSResult extends SRSState {
  nextReviewAt: string; // ISO timestamp
}

/**
 * Maps a 0-100 score to the SM-2 0-5 quality scale.
 * 5: perfect response
 * 4: correct response after hesitation
 * 3: correct response recalled with difficulty
 * 2: incorrect response; seemed easy to recall
 * 1: incorrect response; remembered
 * 0: complete forgetfulness
 */
export function scoreToQuality(score: number): number {
  if (score >= 95) return 5;
  if (score >= 85) return 4;
  if (score >= 75) return 3;
  if (score >= 60) return 2;
  if (score >= 40) return 1;
  return 0;
}

/**
 * Calculates the next SRS state based on performance.
 */
export function calculateNextReview(
  quality: number,
  previous: SRSState,
): SRSResult {
  let { interval, easeFactor, reviewCount } = previous;

  // If quality is below 3, the learner failed. Reset interval but keep ease factor (or reduce it).
  if (quality < 3) {
    reviewCount = 0;
    interval = 1;
  } else {
    if (reviewCount === 0) {
      interval = 1;
    } else if (reviewCount === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    reviewCount++;
  }

  // Update ease factor: EF' := EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

  // Floor ease factor at 1.3
  if (easeFactor < 1.3) easeFactor = 1.3;

  const nextReviewAt = new Date();
  nextReviewAt.setUTCDate(nextReviewAt.getUTCDate() + interval);

  return {
    interval,
    easeFactor,
    reviewCount,
    nextReviewAt: nextReviewAt.toISOString(),
  };
}
