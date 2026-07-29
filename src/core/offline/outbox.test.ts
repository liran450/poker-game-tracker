import { beforeEach, describe, expect, it } from 'vitest';
import { fold, type GameEvent } from '../events';
import { db } from './db';
import { appendEvent, flushOutbox, getOutboxSummary, loadGameEvents } from './outbox';
import { StubSyncTransport } from './stubTransport';

let seq = 0;
function ts(offsetSeconds: number): string {
  return new Date(Date.UTC(2025, 0, 1) + offsetSeconds * 1000).toISOString();
}

function buyIn(overrides: Partial<GameEvent> = {}): GameEvent {
  seq += 1;
  return {
    clientEventId: overrides.clientEventId ?? `evt-${seq}`,
    gameId: overrides.gameId ?? 'game-1',
    playerId: overrides.playerId ?? 'player-1',
    actorId: overrides.actorId ?? 'host-1',
    clientCreatedAt: overrides.clientCreatedAt ?? ts(seq),
    undoneBy: overrides.undoneBy ?? null,
    type: 'buy_in_added',
    payload: {},
  };
}

function playerAdded(overrides: Partial<GameEvent> = {}): GameEvent {
  seq += 1;
  return {
    clientEventId: overrides.clientEventId ?? `evt-${seq}`,
    gameId: overrides.gameId ?? 'game-1',
    playerId: overrides.playerId ?? 'player-1',
    actorId: overrides.actorId ?? 'host-1',
    clientCreatedAt: overrides.clientCreatedAt ?? ts(seq),
    undoneBy: overrides.undoneBy ?? null,
    type: 'player_added',
    payload: { userId: null, guestName: 'Player 1', nickname: null, seatOrder: 0 },
  };
}

beforeEach(async () => {
  await Promise.all([db.games.clear(), db.events.clear(), db.outbox.clear()]);
  seq = 0;
});

describe('appendEvent', () => {
  it('writes the event to the log and enqueues it in the outbox', async () => {
    const event = buyIn();
    await appendEvent(event);

    expect(await loadGameEvents('game-1')).toEqual([event]);
    expect(await getOutboxSummary('game-1')).toEqual({ pendingCount: 1, failedCount: 0 });
  });

  it('is a no-op on a duplicate clientEventId — the exact exit criterion', async () => {
    const event = buyIn();
    await appendEvent(event);
    await appendEvent(event);
    await appendEvent(event);

    expect(await loadGameEvents('game-1')).toHaveLength(1);
    expect(await getOutboxSummary('game-1')).toEqual({ pendingCount: 1, failedCount: 0 });
  });

  it('bumps the cached game record so a games list can order by recency', async () => {
    await appendEvent(buyIn({ gameId: 'game-1' }));
    const cached = await db.games.get('game-1');
    expect(cached).toBeDefined();
  });
});

describe('out-of-order arrival', () => {
  it('converges to the same fold regardless of the order events were appended in', async () => {
    const forwardEvents = [
      playerAdded({ gameId: 'forward' }),
      buyIn({ gameId: 'forward' }),
      buyIn({ gameId: 'forward' }),
      buyIn({ gameId: 'forward' }),
      buyIn({ gameId: 'forward' }),
    ];
    // Same shape, distinct clientEventIds (a real client never reuses one
    // across games) so both games can be appended independently.
    const backwardEvents = [
      playerAdded({ gameId: 'backward' }),
      buyIn({ gameId: 'backward' }),
      buyIn({ gameId: 'backward' }),
      buyIn({ gameId: 'backward' }),
      buyIn({ gameId: 'backward' }),
    ];

    for (const event of forwardEvents) {
      await appendEvent(event);
    }
    for (const event of [...backwardEvents].reverse()) {
      await appendEvent(event);
    }

    const forwardState = fold(await loadGameEvents('forward'));
    const backwardState = fold(await loadGameEvents('backward'));

    expect(backwardState.players.get('player-1')?.buysCount).toBe(
      forwardState.players.get('player-1')?.buysCount,
    );
    expect(forwardState.players.get('player-1')?.buysCount).toBe(4);
  });
});

describe('flushOutbox', () => {
  it('pushes pending entries and clears them from the outbox on success', async () => {
    await appendEvent(buyIn());
    await appendEvent(buyIn());
    const transport = new StubSyncTransport();

    const result = await flushOutbox(transport, 'game-1');

    expect(result).toEqual({ pushed: 2, failedCount: 0 });
    expect(await getOutboxSummary('game-1')).toEqual({ pendingCount: 0, failedCount: 0 });
  });

  it('marks entries failed on a thrown push, without duplicating them', async () => {
    const event = buyIn();
    await appendEvent(event);
    const transport = new StubSyncTransport({ failureRate: 1 });

    const result = await flushOutbox(transport, 'game-1');

    expect(result).toEqual({ pushed: 0, failedCount: 1 });
    expect(await getOutboxSummary('game-1')).toEqual({ pendingCount: 0, failedCount: 1 });
    expect(await db.outbox.count()).toBe(1);
  });

  it('a failed push is retried and does not duplicate — the exact exit criterion', async () => {
    const event = buyIn();
    await appendEvent(event);

    let shouldFail = true;
    const transport = new StubSyncTransport({
      random: () => (shouldFail ? 0 : 1), // < failureRate fails; >= passes
      failureRate: 0.5,
    });

    const first = await flushOutbox(transport, 'game-1');
    expect(first).toEqual({ pushed: 0, failedCount: 1 });
    expect(await db.outbox.count()).toBe(1);

    shouldFail = false;
    const second = await flushOutbox(transport, 'game-1');
    expect(second).toEqual({ pushed: 1, failedCount: 0 });
    expect(await db.outbox.count()).toBe(0);
    expect(transport.hasSeen(event.clientEventId)).toBe(true);
  });

  it('is a no-op when the outbox is empty', async () => {
    const transport = new StubSyncTransport();
    expect(await flushOutbox(transport)).toEqual({ pushed: 0, failedCount: 0 });
  });
});

describe('persistence across a simulated reload', () => {
  it('restores the exact folded state and the pending outbox after "reopening" the db', async () => {
    await appendEvent(playerAdded());
    await appendEvent(buyIn());
    await appendEvent(buyIn());
    const stuckEvent = buyIn();
    await appendEvent(stuckEvent);
    await flushOutbox(new StubSyncTransport({ failureRate: 1 }), 'game-1');

    // Simulate killing the tab and reopening: a fresh Dexie handle onto the
    // same IndexedDB database, not the same in-memory `db` singleton.
    const { AppDatabase } = await import('./db');
    const reopened = new AppDatabase(db.name);
    await reopened.open();

    const events = await reopened.events.where('gameId').equals('game-1').toArray();
    expect(fold(events).players.get('player-1')?.buysCount).toBe(3);

    const outbox = await reopened.outbox.where('gameId').equals('game-1').toArray();
    expect(outbox).toHaveLength(4);
    expect(outbox.every((entry) => entry.status === 'failed')).toBe(true);

    reopened.close();
  });
});
