import { describe, it, expect } from 'vitest';
import { runUntilHalt } from '@/src/lib/utils/halt-queue';

describe('runUntilHalt', () => {
  it('processes every item when no halt occurs', async () => {
    const seen: number[] = [];
    await runUntilHalt(
      [1, 2, 3, 4, 5],
      () => false,
      async (item) => { seen.push(item); },
      2,
    );
    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('marks subsequent items as halted once the predicate flips', async () => {
    // Simulates the credits-exhausted scenario: task #1 sets the flag,
    // task #2..#N must observe halted=true and skip.
    let halted = false;
    const log: Array<{ index: number; halted: boolean }> = [];

    await runUntilHalt(
      [0, 1, 2, 3, 4, 5, 6, 7],
      () => halted,
      async (_item, index, isHalted) => {
        log.push({ index, halted: isHalted });
        // The first task flips the flag after its own work — every
        // dispatched-after-this task must see halted=true.
        if (index === 0) halted = true;
      },
      2,
    );

    // Concurrency = 2, so item 0 and item 1 both start before the flag flips.
    // After item 0 returns and sets the flag, the next dequeue checks the
    // predicate → items 2..7 should all be halted=true.
    const haltedAfterFirst = log.filter((e) => e.index >= 2);
    expect(haltedAfterFirst.length).toBeGreaterThan(0);
    expect(haltedAfterFirst.every((e) => e.halted)).toBe(true);
  });

  it('respects concurrency: at most N workers in flight', async () => {
    let inFlight = 0;
    let peak = 0;
    const work = Array.from({ length: 10 }, (_, i) => i);
    await runUntilHalt(
      work,
      () => false,
      async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
      },
      3,
    );
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('no-ops on an empty list', async () => {
    let calls = 0;
    await runUntilHalt([], () => false, async () => { calls++; }, 4);
    expect(calls).toBe(0);
  });
});
