import type { GameEvent } from '../events';
import { db } from './db';
import type { SyncTransport } from './syncTransport';

/**
 * The write path: append to the log, apply optimistically (the caller folds
 * afterwards), enqueue in the outbox. Idempotent — appending an event whose
 * `clientEventId` is already known only touches the events table (a same-value
 * put), never re-enqueues or resets outbox state for it.
 */
export async function appendEvent(event: GameEvent): Promise<void> {
  await db.transaction('rw', db.games, db.events, db.outbox, async () => {
    const alreadyKnown = (await db.events.get(event.clientEventId)) !== undefined;
    await db.events.put(event);
    if (!alreadyKnown) {
      await db.outbox.add({
        clientEventId: event.clientEventId,
        gameId: event.gameId,
        event,
        status: 'pending',
        attempts: 0,
        lastError: null,
        enqueuedAt: new Date().toISOString(),
      });
    }
    // Merge, not overwrite: `createGame` (step 6) writes the game's real
    // fields once, before any events exist for it, and every later bump must
    // preserve them rather than clobbering the row back down to an id.
    const existingGame = await db.games.get(event.gameId);
    await db.games.put({ ...existingGame, id: event.gameId, updatedAt: new Date().toISOString() });
  });
}

/** Reads are local-only, never network-dependent. Order doesn't matter — the fold sorts. */
export async function loadGameEvents(gameId: string): Promise<GameEvent[]> {
  return db.events.where('gameId').equals(gameId).toArray();
}

export interface OutboxSummary {
  readonly pendingCount: number;
  readonly failedCount: number;
}

export async function getOutboxSummary(gameId?: string): Promise<OutboxSummary> {
  const entries = await (gameId ? db.outbox.where('gameId').equals(gameId) : db.outbox.toCollection()).toArray();
  return {
    pendingCount: entries.filter((entry) => entry.status === 'pending').length,
    failedCount: entries.filter((entry) => entry.status === 'failed').length,
  };
}

export interface FlushResult {
  readonly pushed: number;
  readonly failedCount: number;
}

/**
 * Pushes every queued event for a game (or every game, if omitted) through the
 * transport in one batch. A rejected/thrown push marks every entry in the
 * batch `failed` with an incremented attempt count and leaves it in the
 * outbox for the next retry — never duplicated, since the outbox key is the
 * event's own `clientEventId` and a retry re-uses the same row.
 */
export async function flushOutbox(transport: SyncTransport, gameId?: string): Promise<FlushResult> {
  const entries = await (gameId ? db.outbox.where('gameId').equals(gameId) : db.outbox.toCollection()).toArray();
  if (entries.length === 0) return { pushed: 0, failedCount: 0 };

  try {
    const result = await transport.push(entries.map((entry) => entry.event));
    const accepted = new Set(result.acceptedEventIds);
    const acceptedIds = entries.filter((entry) => accepted.has(entry.clientEventId)).map((entry) => entry.clientEventId);
    await db.outbox.bulkDelete(acceptedIds);
    return { pushed: acceptedIds.length, failedCount: entries.length - acceptedIds.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.transaction('rw', db.outbox, async () => {
      for (const entry of entries) {
        await db.outbox.put({
          ...entry,
          status: 'failed',
          attempts: entry.attempts + 1,
          lastError: message,
        });
      }
    });
    return { pushed: 0, failedCount: entries.length };
  }
}
