import type { GameEvent } from '../events';
import type { SyncPullResult, SyncPushResult, SyncTransport } from './syncTransport';

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
 * The shared backing store two or more `StubSyncTransport`s can point at to
 * simulate the one real thing they'd actually both be talking to — a game's
 * server-side event log — so a multi-device convergence test can push from
 * "device A", pull from "device B", and see the same events either way. A
 * single `StubSyncTransport` with no server given still gets a private one,
 * so every existing single-device test is unaffected.
 *
 * The cursor is this store's own append index, opaque to callers exactly
 * like the real server's bigint identity column — never a client timestamp.
 */
export class FakeSyncServer {
  private readonly eventsByGame = new Map<string, GameEvent[]>();
  private readonly seen = new Set<string>();

  push(events: readonly GameEvent[]): SyncPushResult {
    for (const event of events) {
      if (this.seen.has(event.clientEventId)) continue;
      this.seen.add(event.clientEventId);
      const existing = this.eventsByGame.get(event.gameId) ?? [];
      existing.push(event);
      this.eventsByGame.set(event.gameId, existing);
    }
    return { acceptedEventIds: events.map((event) => event.clientEventId) };
  }

  pull(gameId: string, cursor?: string): SyncPullResult {
    const all = this.eventsByGame.get(gameId) ?? [];
    const since = cursor ? Number(cursor) : 0;
    return { events: all.slice(since), cursor: String(all.length) };
  }

  hasSeen(clientEventId: string): boolean {
    return this.seen.has(clientEventId);
  }
}

/**
 * An in-memory stand-in for the real Supabase transport (step 12). It mimics
 * the one server behaviour the outbox depends on: pushing an event id it has
 * already seen is accepted again rather than rejected, which is what makes
 * retrying a push after a dropped response safe.
 */
export class StubSyncTransport implements SyncTransport {
  constructor(
    private readonly options: StubSyncTransportOptions = {},
    private readonly server: FakeSyncServer = new FakeSyncServer(),
  ) {}

  async push(events: readonly GameEvent[]): Promise<SyncPushResult> {
    const { latencyMs = 0, failureRate = 0, random = Math.random } = this.options;

    if (latencyMs > 0) await sleep(latencyMs);

    if (failureRate > 0 && random() < failureRate) {
      throw new Error('StubSyncTransport: simulated network failure');
    }

    return this.server.push(events);
  }

  async pull(gameId: string, cursor?: string): Promise<SyncPullResult> {
    const { latencyMs = 0, failureRate = 0, random = Math.random } = this.options;

    if (latencyMs > 0) await sleep(latencyMs);

    if (failureRate > 0 && random() < failureRate) {
      throw new Error('StubSyncTransport: simulated network failure');
    }

    return this.server.pull(gameId, cursor);
  }

  /** Test helper: has this event id ever been successfully pushed? */
  hasSeen(clientEventId: string): boolean {
    return this.server.hasSeen(clientEventId);
  }
}
