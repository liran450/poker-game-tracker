import Dexie, { type EntityTable } from 'dexie';
import type { GameEvent } from '../events';

/**
 * A local index of known games, so a games list can render without a fold.
 * Deliberately thin — the setup screen (step 6) owns what a game *is*; this
 * just tracks which game ids exist locally and when they last changed, which
 * is enough to order a list and to key the outbox against.
 */
export interface CachedGameRecord {
  readonly id: string;
  readonly updatedAt: string;
}

export type OutboxStatus = 'pending' | 'failed';

/**
 * One outbox row per not-yet-acknowledged event, keyed by the event's own
 * `clientEventId` — the same id that makes server-side pushes idempotent
 * makes local re-enqueueing idempotent too, for free.
 */
export interface OutboxEntry {
  readonly clientEventId: string;
  readonly gameId: string;
  readonly event: GameEvent;
  readonly status: OutboxStatus;
  readonly attempts: number;
  readonly lastError: string | null;
  readonly enqueuedAt: string;
}

export class AppDatabase extends Dexie {
  games!: EntityTable<CachedGameRecord, 'id'>;
  events!: EntityTable<GameEvent, 'clientEventId'>;
  outbox!: EntityTable<OutboxEntry, 'clientEventId'>;

  constructor(name = 'poker-game-tracker') {
    super(name);
    this.version(1).stores({
      games: 'id, updatedAt',
      events: 'clientEventId, gameId, clientCreatedAt',
      outbox: 'clientEventId, gameId, status, enqueuedAt',
    });
  }
}

export const db = new AppDatabase();
