/**
 * Bounded-concurrency worker pool that honors an early-halt predicate.
 *
 * Two desirable properties:
 *  1. Items run with at most `concurrency` workers in flight (default 4),
 *     so we don't fan out N parallel provider calls when one would do.
 *  2. Between every dequeue, each worker re-checks `shouldHalt()`. When the
 *     flag flips, the remaining items receive `halted = true` and the worker
 *     callback is expected to short-circuit (typically emitting `skipped`).
 *
 * The bare `Promise.all` pattern fails property (2): all tasks start before
 * the first await resolves, so a flag set inside task #1 cannot stop tasks
 * #2..#N that are already past their guard. A pool-with-cursor closes the
 * gap — each worker pulls the next index *after* its previous task returned,
 * at which point the halt check runs again.
 */
export async function runUntilHalt<T>(
  items: readonly T[],
  shouldHalt: () => boolean,
  fn: (item: T, index: number, halted: boolean) => Promise<void>,
  concurrency = 4,
): Promise<void> {
  if (items.length === 0) return;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      // Re-check the halt flag right before we dispatch each item. Workers
      // already in the middle of fn() naturally complete their current task
      // (no fan-out cancellation), but the next item they pick up sees the
      // updated flag.
      const halted = shouldHalt();
      await fn(items[i], i, halted);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, worker));
}
