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

/**
 * `cursor` is opaque to everything except the transport that issued it — the
 * real implementation uses the server's own monotonic event id, never a
 * client timestamp (two events can share a `clientCreatedAt` to the
 * millisecond; the server's identity column can't collide). The caller
 * persists it and passes it back on the next `pull` for that game; omit it
 * for a full pull (a brand-new local device, or a game opened for the first
 * time).
 */
export interface SyncPullResult {
  readonly events: readonly GameEvent[];
  readonly cursor: string;
}

export interface SyncTransport {
  push(events: readonly GameEvent[]): Promise<SyncPushResult>;
  pull(gameId: string, cursor?: string): Promise<SyncPullResult>;
}
