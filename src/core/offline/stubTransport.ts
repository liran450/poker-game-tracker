import type { GameEvent } from '../events';
import type { SyncPushResult, SyncTransport } from './syncTransport';

export interface StubSyncTransportOptions {
  /** Simulated round-trip latency in ms. Default 0 — instant, for most tests. */
  readonly latencyMs?: number;
  /** Probability in [0, 1) that a push throws instead of resolving. Default 0. */
  readonly failureRate?: number;
  /** Injectable RNG so failure behaviour is deterministic in tests. */
  readonly random?: () => number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * An in-memory stand-in for the real Supabase transport (step 12). It mimics
 * the one server behaviour the outbox depends on: pushing an event id it has
 * already seen is accepted again rather than rejected, which is what makes
 * retrying a push after a dropped response safe.
 */
export class StubSyncTransport implements SyncTransport {
  private readonly seen = new Set<string>();

  constructor(private readonly options: StubSyncTransportOptions = {}) {}

  async push(events: readonly GameEvent[]): Promise<SyncPushResult> {
    const { latencyMs = 0, failureRate = 0, random = Math.random } = this.options;

    if (latencyMs > 0) await sleep(latencyMs);

    if (failureRate > 0 && random() < failureRate) {
      throw new Error('StubSyncTransport: simulated network failure');
    }

    for (const event of events) {
      this.seen.add(event.clientEventId);
    }

    return { acceptedEventIds: events.map((event) => event.clientEventId) };
  }

  /** Test helper: has this event id ever been successfully pushed? */
  hasSeen(clientEventId: string): boolean {
    return this.seen.has(clientEventId);
  }
}
