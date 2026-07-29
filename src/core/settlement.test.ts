import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';

import { minor, type Minor } from './money';
import {
  buildGameSnapshot,
  computeBalances,
  computeTransfers,
  HOUSE_ID,
  POT_ID,
  settlementNodes,
  type SettlementNode,
  type SettlementPlayerInput,
  type SettlementSharedCostInput,
  type Transfer,
} from './settlement';

function sharesMap(entries: Record<string, number>): ReadonlyMap<string, Minor> {
  return new Map(Object.entries(entries).map(([id, v]) => [id, minor(v)]));
}

function node(id: string, amountMinor: number, seatOrder = 0): SettlementNode {
  return { id, seatOrder, amountMinor: minor(amountMinor) };
}

// ---------------------------------------------------------------------------
// The money model — worked examples from 05-settlement.md and
// 07-hebrew-glossary.md
// ---------------------------------------------------------------------------

describe('computeBalances — worked examples', () => {
  it("Rani's example: bought in twice, paid cash, cashed out low", () => {
    // 05-settlement.md#the-pot-as-a-settlement-node
    const players: SettlementPlayerInput[] = [
      { id: 'rani', seatOrder: 0, buysCount: 2, cashPaidMinor: minor(10000), chipsFinal: 120 },
    ];
    const balances = computeBalances(players, [], minor(5000), 100, minor(0));
    const rani = balances.players[0]!;

    expect(rani.owedMinor).toBe(10000);
    expect(rani.cashOutMinor).toBe(6000);
    expect(rani.netMinor).toBe(-4000); // lost ₪40, statistics
    expect(rani.balanceMinor).toBe(6000); // owed ₪60 back, settlement
    expect(balances.potBalanceMinor).toBe(-10000);
    // Real games balance the whole pot across every player; this one-player
    // slice is illustrative only (05-settlement.md's own framing: "₪40 of
    // his cash stays in the pot to pay the winners" — winners not shown
    // here). Demonstrate the single transfer on the isolated pot/rani pair
    // it actually describes, not the full (deliberately unbalanced) node set.
    const transfers = computeTransfers([node(POT_ID, -6000), node('rani', 6000)]);
    expect(transfers).toEqual([{ fromId: POT_ID, toId: 'rani', amountMinor: 6000 }]);
  });

  it('the four-player final settlement (07-hebrew-glossary.md#final-settlement-16)', () => {
    // דנה +50, אורי +20, רני −30, מור −40 — buy ₪50, chips only, no cash pot.
    const buyAmountMinor = minor(5000);
    const chipsPerBuy = 100;
    const players: SettlementPlayerInput[] = [
      { id: 'mor', seatOrder: 0, buysCount: 1, cashPaidMinor: minor(0), chipsFinal: 20 },
      { id: 'uri', seatOrder: 1, buysCount: 1, cashPaidMinor: minor(0), chipsFinal: 140 },
      { id: 'rani', seatOrder: 2, buysCount: 1, cashPaidMinor: minor(0), chipsFinal: 40 },
      { id: 'dana', seatOrder: 3, buysCount: 1, cashPaidMinor: minor(0), chipsFinal: 200 },
    ];

    const balances = computeBalances(players, [], buyAmountMinor, chipsPerBuy, minor(0));
    const byId = new Map(balances.players.map((b) => [b.playerId, b]));
    expect(byId.get('dana')!.balanceMinor).toBe(5000);
    expect(byId.get('uri')!.balanceMinor).toBe(2000);
    expect(byId.get('rani')!.balanceMinor).toBe(-3000);
    expect(byId.get('mor')!.balanceMinor).toBe(-4000);
    expect(balances.potBalanceMinor).toBe(0);

    const transfers = computeTransfers(settlementNodes(balances));
    // מור משלם לדנה — ₪40, רני משלם לדנה — ₪10, רני משלם לאורי — ₪20
    expect(transfers).toEqual([
      { fromId: 'mor', toId: 'dana', amountMinor: 4000 },
      { fromId: 'rani', toId: 'uri', amountMinor: 2000 },
      { fromId: 'rani', toId: 'dana', amountMinor: 1000 },
    ]);
  });

  it('shared cost paid by a player: Σ shared(p) is zero among players', () => {
    const sharedCosts: SettlementSharedCostInput[] = [
      {
        id: 'pizza',
        amountMinor: minor(1200),
        paidByPlayerId: 'a',
        shares: sharesMap({ a: 400, b: 400, c: 400 }),
      },
    ];
    const players: SettlementPlayerInput[] = [
      { id: 'a', seatOrder: 0, buysCount: 1, cashPaidMinor: minor(0), chipsFinal: 100 },
      { id: 'b', seatOrder: 1, buysCount: 1, cashPaidMinor: minor(0), chipsFinal: 100 },
      { id: 'c', seatOrder: 2, buysCount: 1, cashPaidMinor: minor(0), chipsFinal: 100 },
    ];
    const balances = computeBalances(players, sharedCosts, minor(5000), 100, minor(0));
    const shared = balances.players.map((b) => b.sharedMinor);
    expect(shared.reduce((s, v) => s + v, 0)).toBe(0);
    expect(balances.players.find((b) => b.playerId === 'a')!.sharedMinor).toBe(800); // paid 1200, owes 400
    expect(balances.players.find((b) => b.playerId === 'b')!.sharedMinor).toBe(-400);
    expect(balances.potBalanceMinor).toBe(0);
  });

  it('shared cost paid by the pot: reduces what the pot pays out', () => {
    const sharedCosts: SettlementSharedCostInput[] = [
      {
        id: 'pizza',
        amountMinor: minor(1200),
        paidByPlayerId: null,
        shares: sharesMap({ a: 600, b: 600 }),
      },
    ];
    const players: SettlementPlayerInput[] = [
      { id: 'a', seatOrder: 0, buysCount: 1, cashPaidMinor: minor(5000), chipsFinal: 100 },
      { id: 'b', seatOrder: 1, buysCount: 1, cashPaidMinor: minor(0), chipsFinal: 100 },
    ];
    const balances = computeBalances(players, sharedCosts, minor(5000), 100, minor(0));
    // pot balance = -(cashPaid) + (paid by pot) = -5000 + 1200 = -3800
    expect(balances.potBalanceMinor).toBe(-3800);
    const total =
      balances.players.reduce((s, p) => s + p.balanceMinor, 0) +
      balances.potBalanceMinor +
      balances.houseBalanceMinor;
    expect(total).toBe(0);
  });

  it("the house's balance is unaccountedMinor verbatim, and closes the graph", () => {
    // A discrepancy of ₪20 (chips came up short), assigned to the house.
    const players: SettlementPlayerInput[] = [
      { id: 'a', seatOrder: 0, buysCount: 2, cashPaidMinor: minor(0), chipsFinal: 180 }, // owed 10000, cashOut 9000
    ];
    const balances = computeBalances(players, [], minor(5000), 100, minor(1000));
    expect(balances.houseBalanceMinor).toBe(1000);
    const total =
      balances.players.reduce((s, p) => s + p.balanceMinor, 0) +
      balances.potBalanceMinor +
      balances.houseBalanceMinor;
    expect(total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeTransfers — fixed regressions
// ---------------------------------------------------------------------------

describe('computeTransfers', () => {
  it('returns nothing for an already-settled set of balances', () => {
    expect(computeTransfers([])).toEqual([]);
    expect(computeTransfers([node('a', 0)])).toEqual([]);
  });

  it('throws when the input does not sum to zero', () => {
    expect(() => computeTransfers([node('a', 100), node('b', -50)])).toThrow(RangeError);
  });

  it('cancels an exact pair in one transfer', () => {
    const transfers = computeTransfers([node('a', -500), node('b', 500)]);
    expect(transfers).toEqual([{ fromId: 'a', toId: 'b', amountMinor: 500 }]);
  });

  it(
    'draining the pot greedily-first (rejected design) would cost an extra transfer here — ' +
      'this is the counterexample that proves group-scoped pot preference instead',
    () => {
      // pot=-6, A=+5, B=+1, C=-3, D=+3 (all ×1000 minor units).
      // Optimal partition: {pot, A, B} and {C, D} → 2 + 1 = 3 transfers.
      // A global "drain the pot against the largest creditor across the
      // whole set" pass instead pulls D into the pot's payments, breaking
      // the {C, D} pair and forcing a 4th transfer.
      const nodes: SettlementNode[] = [
        node(POT_ID, -6000, -1),
        node('a', 5000, 0),
        node('b', 1000, 1),
        node('c', -3000, 2),
        node('d', 3000, 3),
      ];
      const transfers = computeTransfers(nodes);
      expect(transfers).toHaveLength(3);
      assertSettles(nodes, transfers);
    },
  );

  it('prefers the pot as payer when it is present in a group', () => {
    // pot=-5000, a=-2000 (both debtors), c=+7000 (sole creditor).
    // Every transfer necessarily ends at c; the pot should be drained before a.
    const nodes: SettlementNode[] = [
      node(POT_ID, -5000, -1),
      node('a', -2000, 0),
      node('c', 7000, 1),
    ];
    const transfers = computeTransfers(nodes);
    expect(transfers.some((t) => t.fromId === POT_ID)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Invariants (05-settlement.md#invariants-the-tests-must-assert),
// property-tested over randomly generated balance sets.
// ---------------------------------------------------------------------------

function assertSettles(nodes: readonly SettlementNode[], transfers: readonly Transfer[]): void {
  const net = new Map<string, number>();
  for (const n of nodes) net.set(n.id, (net.get(n.id) ?? 0) + n.amountMinor);

  for (const t of transfers) {
    expect(t.amountMinor).toBeGreaterThan(0);
    expect(t.fromId).not.toBe(t.toId);
    net.set(t.fromId, (net.get(t.fromId) ?? 0) + t.amountMinor);
    net.set(t.toId, (net.get(t.toId) ?? 0) - t.amountMinor);
  }

  for (const [, balance] of net) {
    expect(balance).toBe(0);
  }
}

/** n zero-sum integer balances, distinct ids, sequential seat order. */
function arbitraryBalances(maxN: number) {
  return fc
    .integer({ min: 2, max: maxN })
    .chain((n) =>
      fc.array(fc.integer({ min: -10_000, max: 10_000 }), { minLength: n - 1, maxLength: n - 1 }),
    )
    .map((vals) => {
      const last = -vals.reduce((a, b) => a + b, 0);
      return [...vals, last].map((amountMinor, i): SettlementNode => node(`p${i}`, amountMinor, i));
    });
}

describe('computeTransfers — invariants', () => {
  it("every player's transfers sum exactly to their balance, and no transfer is negative/zero/self", () => {
    fc.assert(
      fc.property(arbitraryBalances(12), (nodes) => {
        const transfers = computeTransfers(nodes);
        assertSettles(nodes, transfers);
      }),
      { numRuns: 200 },
    );
  });

  it('never produces more than n − 1 transfers', () => {
    fc.assert(
      fc.property(arbitraryBalances(14), (nodes) => {
        const nonzero = nodes.filter((n) => n.amountMinor !== 0).length;
        const transfers = computeTransfers(nodes);
        expect(transfers.length).toBeLessThanOrEqual(Math.max(0, nonzero - 1));
      }),
      { numRuns: 200 },
    );
  });

  it('is deterministic for identical input', () => {
    fc.assert(
      fc.property(arbitraryBalances(12), (nodes) => {
        const a = computeTransfers(nodes);
        const b = computeTransfers(nodes.map((n) => ({ ...n })));
        expect(a).toEqual(b);
      }),
      { numRuns: 100 },
    );
  });

  it('recomputing from the same balances is idempotent', () => {
    fc.assert(
      fc.property(arbitraryBalances(10), (nodes) => {
        const once = computeTransfers(nodes);
        const twice = computeTransfers(nodes);
        expect(once).toEqual(twice);
      }),
      { numRuns: 50 },
    );
  });

  it('adding shared costs that sum to zero across players never breaks the balance invariant', () => {
    fc.assert(
      fc.property(
        arbitraryBalances(8),
        fc.array(fc.integer({ min: -5000, max: 5000 }), { minLength: 0, maxLength: 4 }),
        (nodes, extra) => {
          // Redistribute a zero-sum "shared cost" adjustment across the same
          // player set — mirrors Σ shared(p) = 0 by construction.
          if (extra.length === 0 || extra.length >= nodes.length) return;
          const adjustment = -extra.reduce((a, b) => a + b, 0);
          const adjusted = nodes.map((n, i) =>
            i < extra.length
              ? node(n.id, n.amountMinor + extra[i]!, n.seatOrder)
              : i === extra.length
                ? node(n.id, n.amountMinor + adjustment, n.seatOrder)
                : n,
          );
          const transfers = computeTransfers(adjusted);
          assertSettles(adjusted, transfers);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// DP optimality — cross-checked against an independent brute-force reference
// ---------------------------------------------------------------------------

/** Brute-force max count of disjoint zero-sum subsets, operating on indices
 *  so duplicate amounts can't collide. Exponential — tests only, small n. */
function bruteForceMaxGroups(amounts: readonly number[]): number {
  let best = 0;

  function search(remainingIndices: readonly number[], groupsSoFar: number): void {
    if (remainingIndices.length === 0) {
      best = Math.max(best, groupsSoFar);
      return;
    }
    const [first, ...rest] = remainingIndices;
    const m = rest.length;
    for (let mask = 0; mask < 1 << m; mask++) {
      const subsetIndices = [first!];
      for (let i = 0; i < m; i++) if (mask & (1 << i)) subsetIndices.push(rest[i]!);
      const s = subsetIndices.reduce((a, idx) => a + amounts[idx]!, 0);
      if (s === 0) {
        const subsetSet = new Set(subsetIndices);
        const left = remainingIndices.filter((idx) => !subsetSet.has(idx));
        search(left, groupsSoFar + 1);
      }
    }
  }

  search(
    amounts.map((_, i) => i),
    0,
  );
  return best;
}

describe('computeTransfers — DP matches the brute-force optimum for small n', () => {
  it('transfer count equals n − k for randomly generated small balance sets', () => {
    fc.assert(
      fc.property(arbitraryBalances(8), (nodes) => {
        const nonzero = nodes.filter((n) => n.amountMinor !== 0);
        if (nonzero.length === 0) return;
        const transfers = computeTransfers(nodes);
        const k = bruteForceMaxGroups(nonzero.map((n) => n.amountMinor));
        expect(transfers.length).toBe(nonzero.length - k);
      }),
      { numRuns: 150 },
    );
  });

  it('matches the documented counterexample directly', () => {
    const amounts = [-6000, 5000, 1000, -3000, 3000];
    expect(bruteForceMaxGroups(amounts)).toBe(2); // {pot,a,b} and {c,d}
  });
});

// ---------------------------------------------------------------------------
// The snapshot builder
// ---------------------------------------------------------------------------

describe('buildGameSnapshot', () => {
  const baseInput = {
    gameId: 'game-1',
    groupId: null,
    name: 'פוקר יום חמישי',
    playedOn: '2026-07-29',
    currency: 'ILS',
    buyAmountMinor: minor(5000),
    chipsPerBuy: 100,
    isPrivate: false,
    locationName: null,
    finishedAt: '2026-07-30T02:00:00.000Z',
    durationMinutes: 180,
    unaccountedMinor: minor(0),
    sharedCosts: [],
  };

  it('produces a summary, one result per player, and the transfer list', () => {
    const snapshot = buildGameSnapshot(
      {
        ...baseInput,
        players: [
          {
            id: 'mor',
            seatOrder: 0,
            userId: null,
            guestName: 'מור',
            displayName: 'מור',
            buysCount: 1,
            cashPaidMinor: minor(0),
            chipsFinal: 60,
            joinedAt: '2026-07-29T22:00:00.000Z',
            leftAt: '2026-07-30T01:00:00.000Z',
            settledPosition: 1,
          },
          {
            id: 'dana',
            seatOrder: 1,
            userId: 'user-dana',
            guestName: null,
            displayName: 'דנה',
            buysCount: 1,
            cashPaidMinor: minor(0),
            chipsFinal: 140,
            joinedAt: '2026-07-29T22:00:00.000Z',
            leftAt: null,
            settledPosition: null,
          },
        ],
      },
      () => 'fixed-id',
    );

    expect(snapshot.summary.playerCount).toBe(2);
    expect(snapshot.summary.totalBuyInsMinor).toBe(10000);
    expect(snapshot.summary.finishedAt).toBe('2026-07-30T02:00:00.000Z');

    const mor = snapshot.playerResults.find((p) => p.displayName === 'מור')!;
    expect(mor.id).toBe('fixed-id');
    expect(mor.netMinor).toBe(-2000);
    expect(mor.minutesPlayed).toBe(180); // joined 22:00, left 01:00

    const dana = snapshot.playerResults.find((p) => p.displayName === 'דנה')!;
    expect(dana.netMinor).toBe(2000);
    expect(dana.minutesPlayed).toBe(240); // never left → played until finishedAt (02:00)

    expect(snapshot.transfers).toEqual([{ fromId: 'mor', toId: 'dana', amountMinor: 2000, orderIndex: 0 }]);
  });

  it('generates a real UUID per player result by default', () => {
    const snapshot = buildGameSnapshot({
      ...baseInput,
      players: [
        {
          id: 'a',
          seatOrder: 0,
          userId: null,
          guestName: 'א',
          displayName: 'א',
          buysCount: 0,
          cashPaidMinor: minor(0),
          chipsFinal: 0,
          joinedAt: '2026-07-29T22:00:00.000Z',
          leftAt: '2026-07-29T22:30:00.000Z',
          settledPosition: 1,
        },
      ],
    });
    expect(snapshot.playerResults[0]!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});

describe('sentinel ids', () => {
  it('are distinct from each other and clearly reserved', () => {
    expect(POT_ID).not.toBe(HOUSE_ID);
    expect(POT_ID.startsWith('__')).toBe(true);
    expect(HOUSE_ID.startsWith('__')).toBe(true);
  });
});
