import type { GameEvent } from '../events';
import { db, type AppDatabase } from './db';
import type { SyncTransport } from './syncTransport';

function pullCursorKey(gameId: string): string {
  return `pullCursor:${gameId}`;
}

/**
 * The write path: append to the log, apply optimistically (the caller folds
 * afterwards), enqueue in the outbox. Idempotent — appending an event whose
 * `clientEventId` is already known only touches the events table (a same-value
 * put), never re-enqueues or resets outbox state for it.
 */
export async function appendEvent(event: GameEvent, database: AppDatabase = db): Promise<void> {
  await database.transaction('rw', database.games, database.events, database.outbox, async () => {
    const alreadyKnown = (await database.events.get(event.clientEventId)) !== undefined;
    await database.events.put(event);
    if (!alreadyKnown) {
      await database.outbox.add({
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
    const existingGame = await database.games.get(event.gameId);
    await database.games.put({ ...existingGame, id: event.gameId, updatedAt: new Date().toISOString() });
  });
}

/** Reads are local-only, never network-dependent. Order doesn't matter — the fold sorts. */
export async function loadGameEvents(gameId: string): Promise<GameEvent[]> {
  return db.events.where('gameId').equals(gameId).toArray();
}

/**
 * Undo (03-data-model.md#undo): appends the inverse event and stamps
 * `undoneBy` on the original in one transaction, so a crash between the two
 * writes can't happen. Both the inverse and the (now-corrected) original are
 * put in the outbox — the original needs re-queueing because its
 * `undoneBy` change has to reach the server even if the original event
 * already left the outbox on an earlier successful push.
 *
 * If the original event is missing locally (shouldn't happen — it's an
 * append-only log — but a step-12 merge from another device could plausibly
 * race this), the inverse still gets appended: fold() computes the same net
 * state either way for the commutative/toggle event types this is used for
 * (see `isGenericallyReversible`), so the only thing lost is the audit log's
 * collapsed rendering of the pair.
 */
export async function appendUndoEvent(
  inverseEvent: GameEvent,
  originalEventId: string,
  undoneByEventId: string,
): Promise<void> {
  await db.transaction('rw', db.games, db.events, db.outbox, async () => {
    const original = await db.events.get(originalEventId);
    const updatedOriginal: GameEvent | undefined = original
      ? { ...original, undoneBy: undoneByEventId }
      : undefined;

    await db.events.put(inverseEvent);
    if (updatedOriginal) await db.events.put(updatedOriginal);

    await db.outbox.put({
      clientEventId: inverseEvent.clientEventId,
      gameId: inverseEvent.gameId,
      event: inverseEvent,
      status: 'pending',
      attempts: 0,
      lastError: null,
      enqueuedAt: new Date().toISOString(),
    });

    if (updatedOriginal) {
      const queuedEntry = await db.outbox.get(originalEventId);
      await db.outbox.put({
        clientEventId: originalEventId,
        gameId: updatedOriginal.gameId,
        event: updatedOriginal,
        status: 'pending',
        attempts: queuedEntry?.attempts ?? 0,
        lastError: null,
        enqueuedAt: queuedEntry?.enqueuedAt ?? new Date().toISOString(),
      });
    }

    const existingGame = await db.games.get(inverseEvent.gameId);
    await db.games.put({ ...existingGame, id: inverseEvent.gameId, updatedAt: new Date().toISOString() });
  });
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
export async function flushOutbox(
  transport: SyncTransport,
  gameId?: string,
  database: AppDatabase = db,
): Promise<FlushResult> {
  const entries = await (
    gameId ? database.outbox.where('gameId').equals(gameId) : database.outbox.toCollection()
  ).toArray();
  if (entries.length === 0) return { pushed: 0, failedCount: 0 };

  try {
    const result = await transport.push(entries.map((entry) => entry.event));
    const accepted = new Set(result.acceptedEventIds);
    const acceptedIds = entries.filter((entry) => accepted.has(entry.clientEventId)).map((entry) => entry.clientEventId);
    await database.outbox.bulkDelete(acceptedIds);
    return { pushed: acceptedIds.length, failedCount: entries.length - acceptedIds.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await database.transaction('rw', database.outbox, async () => {
      for (const entry of entries) {
        await database.outbox.put({
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

export interface PullResult {
  readonly pulled: number;
}

/**
 * Pulls whatever the server has for `gameId` since the last cursor this
 * device saw and merges it into the local log. `db.events.bulkPut` is
 * idempotent on `clientEventId` — an event already known locally (this
 * device's own, already round-tripped) is simply overwritten with the same
 * value, and one arriving from another device (or a since-deposed host,
 * 02-architecture.md#offline-first) is added — `fold()` doesn't care which
 * device authored an event or what order they arrive in, only their
 * `clientCreatedAt`. The cursor is opaque and only ever compared to itself
 * (see `SyncTransport`), so it's stored as-is; a fresh device with no stored
 * cursor pulls everything.
 */
export async function pullGameEvents(
  transport: SyncTransport,
  gameId: string,
  database: AppDatabase = db,
): Promise<PullResult> {
  const key = pullCursorKey(gameId);
  const stored = await database.meta.get(key);
  const result = await transport.pull(gameId, stored?.value);

  if (result.events.length > 0) {
    await database.events.bulkPut(result.events);
    const existingGame = await database.games.get(gameId);
    await database.games.put({ ...existingGame, id: gameId, updatedAt: new Date().toISOString() });
  }
  await database.meta.put({ key, value: result.cursor });

  return { pulled: result.events.length };
}
