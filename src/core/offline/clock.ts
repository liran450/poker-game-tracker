let lastMs = 0;

/**
 * A strictly-increasing `clientCreatedAt` for this device. `fold()`
 * (core/events.ts) sorts by `clientCreatedAt` and only falls back to the
 * (random, causally-meaningless) `clientEventId` when two events tie —
 * millisecond-resolution `Date.now()` ties easily for two appends in the same
 * tick (e.g. `settlePlayer` immediately followed by `editSettledChips`, or a
 * loop seating several players), which can silently reorder them. Stamping
 * from a monotonic counter instead of the raw clock removes the tie at the
 * source, without touching the fold's comparator — which stays exactly as
 * simple and provably-correct as core/events.ts requires.
 */
export function nextTimestamp(): string {
  lastMs = Math.max(Date.now(), lastMs + 1);
  return new Date(lastMs).toISOString();
}
