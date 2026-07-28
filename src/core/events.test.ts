 
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';

import {
  EVENT_TYPES,
  fold,
  emptyState,
  createUndoEvent,
  generateClientEventId,
  gameEventSchema,
  type EventType,
  type GameEvent,
  type GameEventOf,
  type GameState,
} from './events';

// ---------------------------------------------------------------------------
// Helpers — build events with minimal boilerplate
// ---------------------------------------------------------------------------

let _seq = 0;
function nextId(): string {
  _seq += 1;
  return `evt-${String(_seq).padStart(6, '0')}`;
}

function ts(offset: number): string {
  return new Date(Date.UTC(2025, 0, 1) + offset * 1000).toISOString();
}

function makeEvent<T extends EventType>(
  type: T,
  payload: GameEvent extends infer E
    ? E extends { type: T; payload: infer P }
      ? P
      : never
    : never,
  overrides: Partial<{
    clientEventId: string;
    gameId: string;
    playerId: string | null;
    actorId: string;
    clientCreatedAt: string;
    undoneBy: string | null;
  }> = {},
): GameEventOf<T> {
  return {
    clientEventId: overrides.clientEventId ?? nextId(),
    gameId: overrides.gameId ?? 'game-1',
    playerId: overrides.playerId ?? null,
    actorId: overrides.actorId ?? 'host-1',
    clientCreatedAt: overrides.clientCreatedAt ?? ts(_seq),
    undoneBy: overrides.undoneBy ?? null,
    type,
    payload,
  } as unknown as GameEventOf<T>;
}

function addPlayer(
  playerId: string,
  opts: Partial<{ userId: string | null; guestName: string | null; seatOrder: number; clientCreatedAt: string }> = {},
): GameEventOf<'player_added'> {
  const overrides: Parameters<typeof makeEvent>[2] & { playerId: string } = { playerId };
  if (opts.clientCreatedAt !== undefined) overrides.clientCreatedAt = opts.clientCreatedAt;
  return makeEvent('player_added', {
    userId: opts.userId ?? null,
    guestName: opts.guestName ?? `Guest ${playerId}`,
    nickname: null,
    seatOrder: opts.seatOrder ?? 0,
  }, overrides);
}

function buyIn(playerId: string): GameEventOf<'buy_in_added'> {
  return makeEvent('buy_in_added', {}, { playerId });
}

function setCashPaid(playerId: string, amountMinor: number): GameEventOf<'cash_paid_set'> {
  return makeEvent('cash_paid_set', { amountMinor }, { playerId });
}

function setChips(playerId: string, chips: number): GameEventOf<'chips_set'> {
  return makeEvent('chips_set', { chips }, { playerId });
}

function settlePlayer(
  playerId: string,
  chipsFinal: number,
): GameEventOf<'player_settled'> {
  return makeEvent('player_settled', {
    chipsFinal,
    settledAt: ts(_seq),
  }, { playerId });
}

// ---------------------------------------------------------------------------
// EVENT_TYPES — single source of truth
// ---------------------------------------------------------------------------

describe('EVENT_TYPES', () => {
  it('has exactly 31 entries', () => {
    expect(EVENT_TYPES).toHaveLength(31);
  });

  it('contains no duplicates', () => {
    const set = new Set(EVENT_TYPES);
    expect(set.size).toBe(EVENT_TYPES.length);
  });

  it('every entry is a non-empty lowercase snake_case string', () => {
    for (const t of EVENT_TYPES) {
      expect(t).toMatch(/^[a-z][a-z_]*$/);
    }
  });
});

// ---------------------------------------------------------------------------
// emptyState
// ---------------------------------------------------------------------------

describe('emptyState', () => {
  it('returns the correct initial state', () => {
    const state = emptyState();
    expect(state.status).toBe('setup');
    expect(state.hostId).toBeNull();
    expect(state.players.size).toBe(0);
    expect(state.sharedCosts.size).toBe(0);
    expect(state.viewers.size).toBe(0);
    expect(state.joinRequests.size).toBe(0);
    expect(state.claims.size).toBe(0);
    expect(state.transfers.size).toBe(0);
    expect(state.unaccountedMinor).toBe(0);
    expect(state.startedAt).toBeNull();
    expect(state.endedAt).toBeNull();
  });

  it('folding an empty list returns emptyState', () => {
    const state = fold([]);
    expect(state).toEqual(emptyState());
  });
});

// ---------------------------------------------------------------------------
// fold — basic fixture tests
// ---------------------------------------------------------------------------

describe('fold — fixture tests', () => {
  it('player_added creates a player entry', () => {
    const events = [addPlayer('p1', { guestName: 'Alice', seatOrder: 1 })];
    const state = fold(events);
    expect(state.players.size).toBe(1);
    const p = state.players.get('p1')!;
    expect(p.guestName).toBe('Alice');
    expect(p.seatOrder).toBe(1);
    expect(p.buysCount).toBe(0);
    expect(p.isRemoved).toBe(false);
    expect(p.isSettled).toBe(false);
  });

  it('buy_in_added increments buysCount', () => {
    const events = [
      addPlayer('p1'),
      buyIn('p1'),
      buyIn('p1'),
      buyIn('p1'),
    ];
    const state = fold(events);
    expect(state.players.get('p1')!.buysCount).toBe(3);
  });

  it('buy_in_removed decrements buysCount', () => {
    const events = [
      addPlayer('p1'),
      buyIn('p1'),
      buyIn('p1'),
      makeEvent('buy_in_removed', {}, { playerId: 'p1' }),
    ];
    const state = fold(events);
    expect(state.players.get('p1')!.buysCount).toBe(1);
  });

  it('cash_paid_set and chips_set update player values', () => {
    const events = [
      addPlayer('p1'),
      setCashPaid('p1', 5000),
      setChips('p1', 120),
    ];
    const state = fold(events);
    expect(state.players.get('p1')!.cashPaidMinor).toBe(5000);
    expect(state.players.get('p1')!.chipsFinal).toBe(120);
  });

  it('player_settled marks settlement, player_reopened clears it', () => {
    const events = [
      addPlayer('p1'),
      buyIn('p1'),
      settlePlayer('p1', 80),
    ];
    let state = fold(events);
    expect(state.players.get('p1')!.isSettled).toBe(true);
    expect(state.players.get('p1')!.chipsFinal).toBe(80);
    expect(state.players.get('p1')!.settledAt).not.toBeNull();

    const reopenEvents = [
      ...events,
      makeEvent('player_reopened', {}, { playerId: 'p1' }),
    ];
    state = fold(reopenEvents);
    expect(state.players.get('p1')!.isSettled).toBe(false);
    expect(state.players.get('p1')!.chipsFinal).toBeNull();
    expect(state.players.get('p1')!.settledAt).toBeNull();
  });

  it('player_removed sets isRemoved', () => {
    const events = [
      addPlayer('p1'),
      makeEvent('player_removed', {}, { playerId: 'p1' }),
    ];
    const state = fold(events);
    expect(state.players.get('p1')!.isRemoved).toBe(true);
  });

  it('player_renamed updates guestName', () => {
    const events = [
      addPlayer('p1', { guestName: 'Alice' }),
      makeEvent('player_renamed', { name: 'Bob' }, { playerId: 'p1' }),
    ];
    const state = fold(events);
    expect(state.players.get('p1')!.guestName).toBe('Bob');
  });

  it('nickname_set updates nickname', () => {
    const events = [
      addPlayer('p1'),
      makeEvent('nickname_set', { nickname: 'Ace' }, { playerId: 'p1' }),
    ];
    const state = fold(events);
    expect(state.players.get('p1')!.nickname).toBe('Ace');
  });

  it('game lifecycle: setup → active → settling → finished', () => {
    const events: GameEvent[] = [
      makeEvent('game_started', {}),
      makeEvent('game_settling', {}),
      makeEvent('game_ended', {}),
    ];
    const state = fold(events);
    expect(state.status).toBe('finished');
    expect(state.startedAt).not.toBeNull();
    expect(state.endedAt).not.toBeNull();
  });

  it('game_reopened returns to active', () => {
    const events: GameEvent[] = [
      makeEvent('game_started', {}),
      makeEvent('game_ended', {}),
      makeEvent('game_reopened', {}),
    ];
    const state = fold(events);
    expect(state.status).toBe('active');
    expect(state.endedAt).toBeNull();
  });

  it('host_changed and host_taken_over update hostId', () => {
    const events: GameEvent[] = [
      makeEvent('host_changed', { newHostId: 'user-A' }),
    ];
    expect(fold(events).hostId).toBe('user-A');

    const events2: GameEvent[] = [
      makeEvent('host_changed', { newHostId: 'user-A' }),
      makeEvent('host_taken_over', { previousHostId: 'user-A' }, { actorId: 'user-B' }),
    ];
    expect(fold(events2).hostId).toBe('user-B');
  });

  it('viewer_added / viewer_removed', () => {
    const events: GameEvent[] = [
      makeEvent('viewer_added', { userId: 'v1' }),
      makeEvent('viewer_added', { userId: 'v2' }),
      makeEvent('viewer_removed', { userId: 'v1' }),
    ];
    const state = fold(events);
    expect(state.viewers.has('v1')).toBe(false);
    expect(state.viewers.has('v2')).toBe(true);
  });

  it('shared_cost_added / shared_cost_updated / shared_cost_removed', () => {
    const events: GameEvent[] = [
      makeEvent('shared_cost_added', {
        costId: 'c1',
        label: 'Pizza',
        amountMinor: 5000,
        paidByPlayerId: null,
        splitMode: 'equal' as const,
        shares: {},
      }),
      makeEvent('shared_cost_updated', {
        costId: 'c1',
        label: 'Pizza + drinks',
        amountMinor: 8000,
        paidByPlayerId: 'p1',
        splitMode: 'custom' as const,
        shares: { p1: 3000, p2: 5000 },
      }),
    ];
    let state = fold(events);
    const cost = state.sharedCosts.get('c1')!;
    expect(cost.label).toBe('Pizza + drinks');
    expect(cost.amountMinor).toBe(8000);
    expect(cost.paidByPlayerId).toBe('p1');
    expect(cost.shares.get('p1')).toBe(3000);

    const events2 = [
      ...events,
      makeEvent('shared_cost_removed', { costId: 'c1' }),
    ];
    state = fold(events2);
    expect(state.sharedCosts.size).toBe(0);
  });

  it('join_requested / join_approved / join_rejected', () => {
    const events: GameEvent[] = [
      makeEvent('join_requested', {
        requestId: 'jr1',
        userId: 'u1',
        requestedName: 'Alice',
        requestedRole: 'player' as const,
        source: 'link' as const,
      }),
      makeEvent('join_requested', {
        requestId: 'jr2',
        userId: 'u2',
        requestedName: 'Bob',
        requestedRole: 'viewer' as const,
        source: 'in_app' as const,
      }),
      makeEvent('join_approved', { requestId: 'jr1', playerId: 'p1' }),
      makeEvent('join_rejected', { requestId: 'jr2' }),
    ];
    const state = fold(events);
    expect(state.joinRequests.get('jr1')!.status).toBe('approved');
    expect(state.joinRequests.get('jr2')!.status).toBe('rejected');
  });

  it('claim_requested / claim_approved / claim_rejected', () => {
    const events: GameEvent[] = [
      addPlayer('p1'),
      makeEvent('claim_requested', {
        claimId: 'cl1',
        gamePlayerId: 'p1',
        claimantUserId: 'u1',
      }),
      makeEvent('claim_approved', {
        claimId: 'cl1',
        gamePlayerId: 'p1',
        claimantUserId: 'u1',
      }),
    ];
    const state = fold(events);
    expect(state.claims.get('cl1')!.status).toBe('approved');
    expect(state.players.get('p1')!.userId).toBe('u1');
  });

  it('unaccounted_set', () => {
    const events: GameEvent[] = [
      makeEvent('unaccounted_set', { amountMinor: 300 }),
    ];
    expect(fold(events).unaccountedMinor).toBe(300);
  });

  it('transfer_edited', () => {
    const events: GameEvent[] = [
      makeEvent('transfer_edited', {
        transferId: 't1',
        fromPlayerId: 'p1',
        toPlayerId: 'p2',
        amountMinor: 5000,
      }),
    ];
    const state = fold(events);
    const t = state.transfers.get('t1')!;
    expect(t.fromPlayerId).toBe('p1');
    expect(t.toPlayerId).toBe('p2');
    expect(t.amountMinor).toBe(5000);
    expect(t.isManual).toBe(true);
  });

  it('note and player_invited are log-only — no state change', () => {
    const base = [addPlayer('p1')];
    const withNote = [
      ...base,
      makeEvent('note', { text: 'hello' }),
      makeEvent('player_invited', { userId: 'u1', invitedBy: 'host-1' }),
    ];
    const s1 = fold(base);
    const s2 = fold(withNote);
    expect(s1.players.size).toBe(s2.players.size);
    expect(s1.status).toBe(s2.status);
  });
});

// ---------------------------------------------------------------------------
// fold — idempotent application (duplicates ignored)
// ---------------------------------------------------------------------------

describe('fold — idempotent application', () => {
  it('duplicate events produce the same state as a single copy', () => {
    const events = [
      addPlayer('p1'),
      buyIn('p1'),
      setCashPaid('p1', 5000),
    ];
    const single = fold(events);
    const doubled = fold([...events, ...events]);
    expectStatesEqual(single, doubled);
  });

  it('property: fold(events) === fold(events ++ events)', () => {
    fc.assert(
      fc.property(
        arbitraryGameScenario(),
        (events) => {
          const once = fold(events);
          const twice = fold([...events, ...events]);
          expectStatesEqual(once, twice);
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// fold — commutativity (order-independence)
// ---------------------------------------------------------------------------

describe('fold — commutativity', () => {
  it('shuffling a known event list produces the same state', () => {
    const events: GameEvent[] = [
      addPlayer('p1', { clientCreatedAt: ts(1) }),
      addPlayer('p2', { clientCreatedAt: ts(2) }),
      buyIn('p1'),
      buyIn('p2'),
      buyIn('p1'),
      setCashPaid('p1', 10000),
      setChips('p2', 80),
      makeEvent('game_started', {}),
    ];

    const original = fold(events);

    for (let i = 0; i < 10; i++) {
      const shuffled = shuffle([...events]);
      const result = fold(shuffled);
      expectStatesEqual(original, result);
    }
  });

  it('property: for any permutation of events, fold converges to the same state', () => {
    fc.assert(
      fc.property(
        arbitraryGameScenario(),
        (events) => {
          const reference = fold(events);
          const shuffled = fold(shuffle([...events]));
          expectStatesEqual(reference, shuffled);
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// Undo — restores prior state; undo-of-undo doesn't resurrect
// ---------------------------------------------------------------------------

describe('undo', () => {
  it('undoing an event restores prior state', () => {
    const base = [
      addPlayer('p1'),
      buyIn('p1'),
    ];
    const beforeState = fold(base);

    const extraBuy = buyIn('p1');
    const afterState = fold([...base, extraBuy]);
    expect(afterState.players.get('p1')!.buysCount).toBe(
      beforeState.players.get('p1')!.buysCount + 1,
    );

    const undo = createUndoEvent(extraBuy, 'host-1');
    const mutated: GameEvent = { ...extraBuy, undoneBy: undo.undoneByEventId };
    const undoneState = fold([...base, mutated, undo.inverseEvent]);

    expect(undoneState.players.get('p1')!.buysCount).toBe(
      beforeState.players.get('p1')!.buysCount,
    );
  });

  it('undo of an undo does NOT resurrect the original', () => {
    const base = [addPlayer('p1')];
    const buy = buyIn('p1');

    const undo1 = createUndoEvent(buy, 'host-1');
    const buyWithUndo: GameEvent = { ...buy, undoneBy: undo1.undoneByEventId };

    const undo2 = createUndoEvent(undo1.inverseEvent, 'host-1');
    const inverseWithUndo: GameEvent = {
      ...undo1.inverseEvent,
      undoneBy: undo2.undoneByEventId,
    };

    const state = fold([
      ...base,
      buyWithUndo,
      inverseWithUndo,
      undo2.inverseEvent,
    ]);

    // The original buy had undoneBy set, so it stays excluded even after
    // its inverse is itself undone. The undo-of-undo's inverse event
    // exists in the log but the original buy is NOT resurrected.
    expect(state.players.get('p1')!.buysCount).toBe(0);
  });

  it('undoing player_added removes the player from state', () => {
    const add = addPlayer('p1');
    const undo = createUndoEvent(add, 'host-1');
    const mutated: GameEvent = { ...add, undoneBy: undo.undoneByEventId };
    const state = fold([mutated, undo.inverseEvent]);
    expect(state.players.size).toBe(0);
  });

  it('undoing game_started restores setup status', () => {
    const start = makeEvent('game_started', {});
    const beforeStart = fold([]);
    expect(beforeStart.status).toBe('setup');

    const afterStart = fold([start]);
    expect(afterStart.status).toBe('active');

    const undo = createUndoEvent(start, 'host-1');
    const mutated: GameEvent = { ...start, undoneBy: undo.undoneByEventId };
    const restored = fold([mutated, undo.inverseEvent]);
    expect(restored.status).toBe('setup');
  });
});

// ---------------------------------------------------------------------------
// Zod schema — boundary validation
// ---------------------------------------------------------------------------

describe('gameEventSchema', () => {
  it('validates a well-formed player_added event', () => {
    const event = addPlayer('p1');
    const result = gameEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('validates a well-formed note event', () => {
    const event = makeEvent('note', { text: 'hello' });
    const result = gameEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('rejects an event with an unknown type', () => {
    const bad = { ...addPlayer('p1'), type: 'not_real' };
    const result = gameEventSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects an event missing required envelope fields', () => {
    const event = addPlayer('p1');
    const { clientEventId: _, ...rest } = event; // eslint-disable-line @typescript-eslint/no-unused-vars
    const result = gameEventSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// generateClientEventId
// ---------------------------------------------------------------------------

describe('generateClientEventId', () => {
  it('returns a UUID-format string', () => {
    const id = generateClientEventId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('returns unique values', () => {
    const ids = Array.from({ length: 100 }, () => generateClientEventId());
    expect(new Set(ids).size).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Full game scenario — a realistic game round-trip
// ---------------------------------------------------------------------------

describe('full game scenario', () => {
  it('runs a complete game lifecycle', () => {
    const events: GameEvent[] = [
      makeEvent('host_changed', { newHostId: 'host-1' }),
      addPlayer('p1', { userId: 'host-1', guestName: 'Alice', seatOrder: 0, clientCreatedAt: ts(100) }),
      addPlayer('p2', { guestName: 'Bob', seatOrder: 1, clientCreatedAt: ts(101) }),
      addPlayer('p3', { guestName: 'Charlie', seatOrder: 2, clientCreatedAt: ts(102) }),
      buyIn('p1'),
      buyIn('p2'),
      buyIn('p3'),
      buyIn('p1'),
      makeEvent('game_started', {}),
      setCashPaid('p1', 10000),
      setCashPaid('p2', 5000),
      setCashPaid('p3', 5000),
      makeEvent('shared_cost_added', {
        costId: 'c1',
        label: 'Food',
        amountMinor: 6000,
        paidByPlayerId: 'p1',
        splitMode: 'equal' as const,
        shares: { p1: 2000, p2: 2000, p3: 2000 },
      }),
      makeEvent('game_settling', {}),
      settlePlayer('p1', 150),
      settlePlayer('p2', 80),
      settlePlayer('p3', 70),
      makeEvent('game_ended', {}),
    ];

    const state = fold(events);

    expect(state.status).toBe('finished');
    expect(state.hostId).toBe('host-1');
    expect(state.players.size).toBe(3);

    const p1 = state.players.get('p1')!;
    expect(p1.buysCount).toBe(2);
    expect(p1.cashPaidMinor).toBe(10000);
    expect(p1.chipsFinal).toBe(150);
    expect(p1.isSettled).toBe(true);

    const p2 = state.players.get('p2')!;
    expect(p2.buysCount).toBe(1);
    expect(p2.cashPaidMinor).toBe(5000);
    expect(p2.chipsFinal).toBe(80);

    expect(state.sharedCosts.size).toBe(1);
    expect(state.startedAt).not.toBeNull();
    expect(state.endedAt).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

function expectStatesEqual(a: GameState, b: GameState): void {
  expect(a.status).toBe(b.status);
  expect(a.hostId).toBe(b.hostId);
  expect(a.unaccountedMinor).toBe(b.unaccountedMinor);
  expect(a.startedAt).toBe(b.startedAt);
  expect(a.endedAt).toBe(b.endedAt);
  expect(a.players.size).toBe(b.players.size);
  for (const [id, pa] of a.players) {
    const pb = b.players.get(id);
    expect(pb).toBeDefined();
    expect(pa.buysCount).toBe(pb!.buysCount);
    expect(pa.cashPaidMinor).toBe(pb!.cashPaidMinor);
    expect(pa.chipsFinal).toBe(pb!.chipsFinal);
    expect(pa.isSettled).toBe(pb!.isSettled);
    expect(pa.isRemoved).toBe(pb!.isRemoved);
    expect(pa.guestName).toBe(pb!.guestName);
    expect(pa.nickname).toBe(pb!.nickname);
    expect(pa.userId).toBe(pb!.userId);
  }
  expect(a.sharedCosts.size).toBe(b.sharedCosts.size);
  expect(a.viewers.size).toBe(b.viewers.size);
  expect(a.joinRequests.size).toBe(b.joinRequests.size);
  expect(a.claims.size).toBe(b.claims.size);
  expect(a.transfers.size).toBe(b.transfers.size);
}

/**
 * Arbitrary game scenario generator for property tests.
 * Generates a plausible sequence: add some players, then random actions on them.
 */
function arbitraryGameScenario(): fc.Arbitrary<GameEvent[]> {
  return fc.integer({ min: 1, max: 5 }).chain((numPlayers) => {
    const playerIds = Array.from({ length: numPlayers }, (_, i) => `p${String(i + 1)}`);

    const playerAddEvents = playerIds.map((pid, i) =>
      makeEvent('player_added', {
        userId: null,
        guestName: `Guest ${pid}`,
        nickname: null,
        seatOrder: i,
      }, {
        playerId: pid,
        clientEventId: `add-${pid}`,
        clientCreatedAt: ts(i),
      }),
    );

    const actionArb = fc.oneof(
      fc.constantFrom(...playerIds).map((pid) => {
        const id = nextId();
        return makeEvent('buy_in_added', {}, {
          playerId: pid,
          clientEventId: id,
          clientCreatedAt: ts(100 + _seq),
        });
      }),
      fc.record({
        pid: fc.constantFrom(...playerIds),
        amount: fc.integer({ min: 0, max: 100000 }),
      }).map(({ pid, amount }) => {
        const id = nextId();
        return makeEvent('cash_paid_set', { amountMinor: amount }, {
          playerId: pid,
          clientEventId: id,
          clientCreatedAt: ts(100 + _seq),
        });
      }),
      fc.record({
        pid: fc.constantFrom(...playerIds),
        chips: fc.integer({ min: 0, max: 1000 }),
      }).map(({ pid, chips }) => {
        const id = nextId();
        return makeEvent('chips_set', { chips }, {
          playerId: pid,
          clientEventId: id,
          clientCreatedAt: ts(100 + _seq),
        });
      }),
      fc.constant(null).map(() => {
        const id = nextId();
        return makeEvent('game_started', {}, {
          clientEventId: id,
          clientCreatedAt: ts(100 + _seq),
        });
      }),
    );

    return fc.array(actionArb, { minLength: 0, maxLength: 15 }).map(
      (actions) => [...playerAddEvents, ...actions],
    );
  });
}
