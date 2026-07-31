import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fold, type GameEvent } from '../events';
import { AppDatabase, db } from './db';
import { appendEvent, flushOutbox, getOutboxSummary, loadGameEvents, pullGameEvents } from './outbox';
import { FakeSyncServer, StubSyncTransport } from './stubTransport';

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
  await Promise.all([db.games.clear(), db.events.clear(), db.outbox.clear(), db.meta.clear()]);
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

describe('pullGameEvents', () => {
  it('merges server-only events into the local log and advances the cursor', async () => {
    const server = new FakeSyncServer();
    const remoteEvent = buyIn({ gameId: 'game-1' });
    server.push([remoteEvent]);
    const transport = new StubSyncTransport({}, server);

    const result = await pullGameEvents(transport, 'game-1');

    expect(result).toEqual({ pulled: 1 });
    expect(await loadGameEvents('game-1')).toEqual([remoteEvent]);
    expect((await db.meta.get('pullCursor:game-1'))?.value).toBe('1');
  });

  it('pulls only what arrived since the stored cursor, not the whole log again', async () => {
    const server = new FakeSyncServer();
    server.push([buyIn({ gameId: 'game-1' })]);
    const transport = new StubSyncTransport({}, server);
    await pullGameEvents(transport, 'game-1');

    const secondEvent = buyIn({ gameId: 'game-1' });
    server.push([secondEvent]);
    const second = await pullGameEvents(transport, 'game-1');

    expect(second).toEqual({ pulled: 1 });
    expect(await loadGameEvents('game-1')).toHaveLength(2);
  });

  it('is a no-op when the server has nothing new', async () => {
    const transport = new StubSyncTransport();
    expect(await pullGameEvents(transport, 'game-1')).toEqual({ pulled: 0 });
    expect(await loadGameEvents('game-1')).toEqual([]);
  });
});

describe('multi-device convergence (docs/build/PLAN.md step 12 exit criteria)', () => {
  let deviceA: AppDatabase;
  let deviceB: AppDatabase;

  beforeEach(async () => {
    deviceA = new AppDatabase('outbox-test-device-a');
    deviceB = new AppDatabase('outbox-test-device-b');
    await deviceA.open();
    await deviceB.open();
  });

  afterEach(async () => {
    deviceA.close();
    deviceB.close();
    await Promise.all([deviceA.delete(), deviceB.delete()]);
  });

  it('two devices editing the same game concurrently converge, including +1 buy-in from both', async () => {
    const server = new FakeSyncServer();
    const transportA = new StubSyncTransport({}, server);
    const transportB = new StubSyncTransport({}, server);
    const gameId = 'shared-game';

    const player = playerAdded({ gameId });
    await appendEvent(player, deviceA);
    await flushOutbox(transportA, gameId, deviceA);
    await pullGameEvents(transportB, gameId, deviceB);

    // Both devices now see the player. Each device adds its own buy-in
    // concurrently, offline from each other, then both sync.
    await appendEvent(buyIn({ gameId, playerId: player.playerId, actorId: 'device-a' }), deviceA);
    await appendEvent(buyIn({ gameId, playerId: player.playerId, actorId: 'device-b' }), deviceB);

    await flushOutbox(transportA, gameId, deviceA);
    await flushOutbox(transportB, gameId, deviceB);

    // Each device pulls what the other pushed.
    await pullGameEvents(transportA, gameId, deviceA);
    await pullGameEvents(transportB, gameId, deviceB);

    const stateA = fold(await deviceA.events.where('gameId').equals(gameId).toArray());
    const stateB = fold(await deviceB.events.where('gameId').equals(gameId).toArray());

    expect(stateA.players.get(player.playerId!)?.buysCount).toBe(2);
    expect(stateB.players.get(player.playerId!)?.buysCount).toBe(2);
  });

  it('events pushed by a deposed host are still accepted and merged', async () => {
    const server = new FakeSyncServer();
    const oldHostTransport = new StubSyncTransport({}, server);
    const newHostTransport = new StubSyncTransport({}, server);
    const gameId = 'takeover-game';

    const player = playerAdded({ gameId, actorId: 'old-host' });
    await appendEvent(player, deviceA);
    await flushOutbox(oldHostTransport, gameId, deviceA);
    await pullGameEvents(newHostTransport, gameId, deviceB);

    // deviceB takes over — appends a host_taken_over event and continues
    // playing, all pushed by the *new* host's transport.
    const takeover: GameEvent = {
      clientEventId: 'evt-takeover',
      gameId,
      playerId: null,
      actorId: 'new-host',
      clientCreatedAt: ts(1000),
      undoneBy: null,
      type: 'host_taken_over',
      payload: { previousHostId: 'old-host' },
    };
    await appendEvent(takeover, deviceB);
    await flushOutbox(newHostTransport, gameId, deviceB);

    // The *old* (now-deposed) host's device was mid-air with one more
    // buy-in appended just before losing control, and pushes it late —
    // through its own transport, not the new host's.
    const lateBuyIn = buyIn({ gameId, playerId: player.playerId, actorId: 'old-host' });
    await appendEvent(lateBuyIn, deviceA);
    const lateResult = await flushOutbox(oldHostTransport, gameId, deviceA);

    expect(lateResult).toEqual({ pushed: 1, failedCount: 0 });
    expect(server.hasSeen(lateBuyIn.clientEventId)).toBe(true);

    // The new host pulls and sees the deposed host's late event merged in.
    await pullGameEvents(newHostTransport, gameId, deviceB);
    const stateB = fold(await deviceB.events.where('gameId').equals(gameId).toArray());
    expect(stateB.players.get(player.playerId!)?.buysCount).toBe(1);
    expect(stateB.hostId).toBe('new-host');
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

describe('airplane mode for the length of a game, then reconnect (PLAN.md step 12)', () => {
  it('produces the identical final state once every queued event finally lands', async () => {
    const server = new FakeSyncServer();
    const offline = new StubSyncTransport({ failureRate: 1 }, server);

    const events = [
      playerAdded(),
      playerAdded({ playerId: 'player-2' }),
      buyIn(),
      buyIn(),
      buyIn({ playerId: 'player-2' }),
    ];
    for (const event of events) await appendEvent(event);

    // "Airplane mode": every push attempt fails, and the outbox keeps every event
    // queued rather than losing or duplicating any of them.
    const offlineAttempt = await flushOutbox(offline, 'game-1');
    expect(offlineAttempt).toEqual({ pushed: 0, failedCount: events.length });
    expect(await getOutboxSummary('game-1')).toEqual({ pendingCount: 0, failedCount: events.length });

    // A couple more events while still offline — an ordinary night's usage, not a
    // special case the retry path needs to know about.
    const moreEvents = [buyIn({ playerId: 'player-2' }), buyIn()];
    for (const event of moreEvents) await appendEvent(event);
    await flushOutbox(offline, 'game-1');
    expect(await getOutboxSummary('game-1')).toEqual({
      pendingCount: 0,
      failedCount: events.length + moreEvents.length,
    });

    // "Reconnect": a fresh transport (a new device session, same idea as a real
    // app reconnecting) pointed at the same server succeeds and drains the outbox.
    const online = new StubSyncTransport({}, server);
    const onlineAttempt = await flushOutbox(online, 'game-1');
    expect(onlineAttempt).toEqual({ pushed: events.length + moreEvents.length, failedCount: 0 });
    expect(await getOutboxSummary('game-1')).toEqual({ pendingCount: 0, failedCount: 0 });

    // The server's own copy of the log folds to exactly the same state as what
    // was built up locally the whole time it was offline.
    const localState = fold(await loadGameEvents('game-1'));
    const serverState = fold(server.pull('game-1').events);
    expect(serverState).toEqual(localState);
    expect(localState.players.get('player-1')?.buysCount).toBe(3);
    expect(localState.players.get('player-2')?.buysCount).toBe(2);
  });
});
