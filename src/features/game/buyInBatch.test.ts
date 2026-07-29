import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameEvent } from '@core/events';
import { createBuyInBatchStore } from './buyInBatch';

function fakeEvent(playerId: string, type: 'buy_in_added' | 'buy_in_removed'): GameEvent {
  return {
    clientEventId: crypto.randomUUID(),
    gameId: 'g1',
    playerId,
    actorId: 'a1',
    clientCreatedAt: new Date().toISOString(),
    undoneBy: null,
    type,
    payload: {},
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('buyInBatch store', () => {
  it('a single tap produces one entry with delta +1', () => {
    const store = createBuyInBatchStore(3000);
    store.getState().addTap('mor', 1, fakeEvent('mor', 'buy_in_added'));

    const { entries } = store.getState();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ playerId: 'mor', deltaBuys: 1 });
    expect(entries[0]?.events).toHaveLength(1);
  });

  it('rapid taps on the same player coalesce into one entry', () => {
    const store = createBuyInBatchStore(3000);
    store.getState().addTap('mor', 1, fakeEvent('mor', 'buy_in_added'));
    store.getState().addTap('mor', 1, fakeEvent('mor', 'buy_in_added'));
    store.getState().addTap('mor', 1, fakeEvent('mor', 'buy_in_added'));

    const { entries } = store.getState();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.deltaBuys).toBe(3);
    expect(entries[0]?.events).toHaveLength(3);
  });

  it('a + then a − on the same player nets to zero but keeps both events', () => {
    const store = createBuyInBatchStore(3000);
    store.getState().addTap('mor', 1, fakeEvent('mor', 'buy_in_added'));
    store.getState().addTap('mor', -1, fakeEvent('mor', 'buy_in_removed'));

    const { entries } = store.getState();
    expect(entries[0]?.deltaBuys).toBe(0);
    expect(entries[0]?.events).toHaveLength(2);
  });

  it('taps on two different rows produce two entries — the batch-bar case', () => {
    const store = createBuyInBatchStore(3000);
    store.getState().addTap('mor', 1, fakeEvent('mor', 'buy_in_added'));
    store.getState().addTap('uri', 1, fakeEvent('uri', 'buy_in_added'));
    store.getState().addTap('uri', 1, fakeEvent('uri', 'buy_in_added'));

    const { entries } = store.getState();
    expect(entries.map((e) => e.playerId).sort()).toEqual(['mor', 'uri']);
    expect(entries.find((e) => e.playerId === 'uri')?.deltaBuys).toBe(2);
  });

  it('the window closes itself after inactivity, clearing every entry', () => {
    const store = createBuyInBatchStore(3000);
    store.getState().addTap('mor', 1, fakeEvent('mor', 'buy_in_added'));
    expect(store.getState().entries).toHaveLength(1);

    vi.advanceTimersByTime(3000);

    expect(store.getState().entries).toHaveLength(0);
  });

  it('a new tap extends (resets) the window rather than letting it expire', () => {
    const store = createBuyInBatchStore(3000);
    store.getState().addTap('mor', 1, fakeEvent('mor', 'buy_in_added'));

    vi.advanceTimersByTime(2000);
    store.getState().addTap('mor', 1, fakeEvent('mor', 'buy_in_added'));
    vi.advanceTimersByTime(2000); // 4000ms since first tap, but only 2000ms since the second

    expect(store.getState().entries).toHaveLength(1); // still open
    expect(store.getState().entries[0]?.deltaBuys).toBe(2);

    vi.advanceTimersByTime(1000); // now 3000ms since the second tap
    expect(store.getState().entries).toHaveLength(0);
  });

  it('clear() dismisses the window immediately, e.g. after undo or a manual confirm', () => {
    const store = createBuyInBatchStore(3000);
    store.getState().addTap('mor', 1, fakeEvent('mor', 'buy_in_added'));

    store.getState().clear();

    expect(store.getState().entries).toHaveLength(0);
    vi.advanceTimersByTime(5000);
    expect(store.getState().entries).toHaveLength(0); // no stray timer firing later
  });

  it('tapCount increases per tap and resets on clear/expiry, driving the UI remount key', () => {
    const store = createBuyInBatchStore(3000);
    expect(store.getState().tapCount).toBe(0);
    store.getState().addTap('mor', 1, fakeEvent('mor', 'buy_in_added'));
    expect(store.getState().tapCount).toBe(1);
    store.getState().addTap('mor', 1, fakeEvent('mor', 'buy_in_added'));
    expect(store.getState().tapCount).toBe(2);

    vi.advanceTimersByTime(3000);
    expect(store.getState().tapCount).toBe(0);
  });
});
