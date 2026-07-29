import type { GameEvent } from '../events';

/**
 * The seam step 12 swaps a real Supabase implementation behind. A push either
 * resolves — naming which of the submitted events the server accepted — or
 * throws, meaning nothing was acknowledged and the whole batch stays pending.
 *
 * There is no partial-failure-without-throwing case: the server rejecting one
 * event outright (not just deduplicating it) is not a scenario this domain
 * has, since every event here is either a commutative increment or a
 * last-writer-wins set — see 02-architecture.md#offline-first.
 */
export interface SyncPushResult {
  readonly acceptedEventIds: readonly string[];
}

export interface SyncTransport {
  push(events: readonly GameEvent[]): Promise<SyncPushResult>;
}
