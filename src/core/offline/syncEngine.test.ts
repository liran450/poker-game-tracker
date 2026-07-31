import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './db';
import { FakeSyncServer, StubSyncTransport } from './stubTransport';
import { isSyncing, startPolling, subscribeSyncing, syncPull } from './syncEngine';

beforeEach(async () => {
  await Promise.all([db.games.clear(), db.events.clear(), db.outbox.clear(), db.meta.clear()]);
});

describe('syncPull', () => {
  it('merges whatever the transport returns and reports the pulled count', async () => {
    const server = new FakeSyncServer();
    server.push([
      {
        clientEventId: 'evt-1',
        gameId: 'game-1',
        playerId: 'player-1',
        actorId: 'host-1',
        clientCreatedAt: new Date(Date.UTC(2025, 0, 1)).toISOString(),
        undoneBy: null,
        type: 'buy_in_added',
        payload: {},
      },
    ]);
    const transport = new StubSyncTransport({}, server);

    const result = await syncPull(transport, 'game-1');

    expect(result.pulled).toEqual(1);
    expect(await db.events.get('evt-1')).toBeDefined();
  });

  it('marks the game as syncing for the duration of the pull, then clears it', async () => {
    const server = new FakeSyncServer();
    const transport = new StubSyncTransport({ latencyMs: 20 }, server);
    const states: boolean[] = [];
    subscribeSyncing(() => states.push(isSyncing('game-1')));

    expect(isSyncing('game-1')).toBe(false);
    await syncPull(transport, 'game-1');

    expect(states).toEqual([true, false]);
    expect(isSyncing('game-1')).toBe(false);
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Real timers, not fake ones: `syncPull` does real async Dexie/IndexedDB work
// inside the interval callback, which doesn't reliably settle under
// vitest's faked `setTimeout` — a short real interval is more honest here
// than fighting fake-timer/microtask interleaving.
describe('startPolling', () => {
  it('pulls repeatedly, not just once, and not immediately on start', async () => {
    const server = new FakeSyncServer();
    const transport = new StubSyncTransport({}, server);
    const pullSpy = vi.spyOn(transport, 'pull');

    const stop = startPolling(transport, 'game-1', 15);
    try {
      expect(pullSpy).not.toHaveBeenCalled();

      await sleep(20);
      const afterOneTick = pullSpy.mock.calls.length;
      expect(afterOneTick).toBeGreaterThanOrEqual(1);

      await sleep(60);
      expect(pullSpy.mock.calls.length).toBeGreaterThan(afterOneTick);
    } finally {
      stop();
    }
  });

  it('stops polling once the returned cleanup is called', async () => {
    const server = new FakeSyncServer();
    const transport = new StubSyncTransport({}, server);
    const pullSpy = vi.spyOn(transport, 'pull');

    const stop = startPolling(transport, 'game-1', 20);
    await sleep(40);
    stop();
    const callsAtStop = pullSpy.mock.calls.length;
    expect(callsAtStop).toBeGreaterThan(0);

    await sleep(60);
    expect(pullSpy).toHaveBeenCalledTimes(callsAtStop);
  });
});
