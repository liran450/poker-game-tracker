import Dexie, { type EntityTable } from 'dexie';
import type { GameEvent } from '../events';

/**
 * A local index of known games, so a games list can render without a fold.
 * `id` and `updatedAt` are all `appendEvent` guarantees on its own (it bumps
 * `updatedAt` on every event, merging over whatever else is already there);
 * everything else is written once by `createGame` (step 6) and never
 * event-sourced — a game's name, stakes and currency are ordinary mutable
 * fields, not a fold, matching `games` in 03-data-model.md.
 */
export interface CachedGameRecord {
  readonly id: string;
  readonly updatedAt: string;
  readonly name?: string;
  readonly buyAmountMinor?: number;
  readonly chipsPerBuy?: number;
  readonly currencyCode?: string;
  readonly isPrivate?: boolean;
  readonly createdAt?: string;
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

/**
 * Local play-history for the add-players sheet's quick-add list, standing in
 * for "group members sorted by frequency played with" until step 14 supplies
 * real groups (docs/build/PLAN.md#step-6). Keyed by the name as typed.
 */
export interface RecentPlayerRecord {
  readonly name: string;
  readonly playCount: number;
  readonly lastPlayedAt: string;
}

/** Singleton device-local key/value facts — e.g. the local actor id (below). */
export interface MetaRecord {
  readonly key: string;
  readonly value: string;
}

export class AppDatabase extends Dexie {
  games!: EntityTable<CachedGameRecord, 'id'>;
  events!: EntityTable<GameEvent, 'clientEventId'>;
  outbox!: EntityTable<OutboxEntry, 'clientEventId'>;
  recentPlayers!: EntityTable<RecentPlayerRecord, 'name'>;
  meta!: EntityTable<MetaRecord, 'key'>;

  constructor(name = 'poker-game-tracker') {
    super(name);
    this.version(1).stores({
      games: 'id, updatedAt',
      events: 'clientEventId, gameId, clientCreatedAt',
      outbox: 'clientEventId, gameId, status, enqueuedAt',
      recentPlayers: 'name, playCount',
      meta: 'key',
    });
  }
}

export const db = new AppDatabase();
