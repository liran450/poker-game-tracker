import { beforeEach, describe, expect, it } from 'vitest';
import { fold } from '../events';
import { minor } from '../money';
import { POT_ID } from '../settlement';
import { db } from './db';
import {
  addBuyIn,
  addManualTransfer,
  addPlayersToGame,
  addSharedCost,
  beginSettlement,
  createGame,
  deleteTransfer,
  editSettledChips,
  editTransfer,
  finalizeGame,
  recomputeTransfers,
  removeBuyIn,
  removePlayer,
  removeSharedCost,
  renamePlayer,
  reopenGame,
  reopenPlayer,
  setCashPaid,
  settlePlayer,
  setUnaccounted,
  undoEvent,
  updateSharedCost,
  type NewGameInput,
} from './gameActions';
import { loadGameEvents } from './outbox';

const baseInput: NewGameInput = {
  name: 'פוקר — 26.07.26',
  buyAmountMinor: minor(5000),
  chipsPerBuy: 100,
  currencyCode: 'ILS',
  isPrivate: false,
  playerNames: ['מור', 'אורי', 'רני', 'דנה'],
};

beforeEach(async () => {
  await Promise.all([
    db.games.clear(),
    db.events.clear(),
    db.outbox.clear(),
    db.recentPlayers.clear(),
    db.meta.clear(),
    db.snapshots.clear(),
  ]);
});

describe('createGame', () => {
  it('seats every player and starts the game entirely through appended events', async () => {
    const { gameId } = await createGame(baseInput);

    const events = await loadGameEvents(gameId);
    // Every mutation is an event: 4 player_added + host_changed + game_started.
    expect(events).toHaveLength(6);
    expect(events.every((e) => e.gameId === gameId)).toBe(true);

    const state = fold(events);
    expect(state.status).toBe('active');
    expect(state.hostId).not.toBeNull();
    expect(state.players.size).toBe(4);
    expect([...state.players.values()].map((p) => p.guestName).sort()).toEqual(
      ['אורי', 'דנה', 'מור', 'רני'].sort(),
    );
  });

  it('writes the game record with the real fields, not just an id', async () => {
    const { gameId } = await createGame(baseInput);
    const cached = await db.games.get(gameId);
    expect(cached).toMatchObject({
      id: gameId,
      name: baseInput.name,
      buyAmountMinor: 5000,
      chipsPerBuy: 100,
      currencyCode: 'ILS',
      isPrivate: false,
    });
  });

  it('records every seated name in local play history', async () => {
    await createGame(baseInput);
    const recent = await db.recentPlayers.toArray();
    expect(recent.map((r) => r.name).sort()).toEqual(['אורי', 'דנה', 'מור', 'רני'].sort());
  });

  it('assigns increasing seat orders in the given order', async () => {
    const { gameId } = await createGame(baseInput);
    const state = fold(await loadGameEvents(gameId));
    const bySeat = [...state.players.values()].sort((a, b) => a.seatOrder - b.seatOrder);
    expect(bySeat.map((p) => p.guestName)).toEqual(['מור', 'אורי', 'רני', 'דנה']);
  });

  it('creates a game with zero players (setup must be skippable)', async () => {
    const { gameId } = await createGame({ ...baseInput, playerNames: [] });
    const state = fold(await loadGameEvents(gameId));
    expect(state.players.size).toBe(0);
    expect(state.status).toBe('active');
  });
});

describe('addPlayersToGame', () => {
  it('seats a late joiner with a seat order after the existing roster', async () => {
    const { gameId } = await createGame(baseInput);
    await addPlayersToGame(gameId, ['שי']);

    const state = fold(await loadGameEvents(gameId));
    expect(state.players.size).toBe(5);
    const shai = [...state.players.values()].find((p) => p.guestName === 'שי');
    expect(shai?.seatOrder).toBe(4);
  });

  it('is a no-op for an empty name list', async () => {
    const { gameId } = await createGame(baseInput);
    await addPlayersToGame(gameId, []);
    const state = fold(await loadGameEvents(gameId));
    expect(state.players.size).toBe(4);
  });
});

describe('removePlayer', () => {
  it('soft-deletes: the row is marked removed, not erased from the log', async () => {
    const { gameId } = await createGame(baseInput);
    const state = fold(await loadGameEvents(gameId));
    const mor = [...state.players.values()].find((p) => p.guestName === 'מור')!;

    await removePlayer(gameId, mor.id);

    const after = fold(await loadGameEvents(gameId));
    expect(after.players.get(mor.id)?.isRemoved).toBe(true);
    expect(after.players.size).toBe(4); // still in the log
  });
});

describe('renamePlayer', () => {
  it('changes the guest name via an appended event', async () => {
    const { gameId } = await createGame(baseInput);
    const state = fold(await loadGameEvents(gameId));
    const mor = [...state.players.values()].find((p) => p.guestName === 'מור')!;

    await renamePlayer(gameId, mor.id, 'הכריש');

    const after = fold(await loadGameEvents(gameId));
    expect(after.players.get(mor.id)?.guestName).toBe('הכריש');
  });
});

async function firstPlayerId(gameId: string): Promise<string> {
  const state = fold(await loadGameEvents(gameId));
  return [...state.players.values()].find((p) => p.guestName === 'מור')!.id;
}

describe('the buy-in counter', () => {
  it('addBuyIn is a one-tap commutative increment', async () => {
    const { gameId } = await createGame(baseInput);
    const mor = await firstPlayerId(gameId);

    await addBuyIn(gameId, mor);
    await addBuyIn(gameId, mor);
    await addBuyIn(gameId, mor);

    const state = fold(await loadGameEvents(gameId));
    expect(state.players.get(mor)?.buysCount).toBe(3);
  });

  it('removeBuyIn decrements', async () => {
    const { gameId } = await createGame(baseInput);
    const mor = await firstPlayerId(gameId);
    await addBuyIn(gameId, mor);
    await addBuyIn(gameId, mor);
    await removeBuyIn(gameId, mor);

    const state = fold(await loadGameEvents(gameId));
    expect(state.players.get(mor)?.buysCount).toBe(1);
  });
});

describe('undoEvent', () => {
  it('undoing a buy-in reverts the count and marks the original undoneBy in the log', async () => {
    const { gameId } = await createGame(baseInput);
    const mor = await firstPlayerId(gameId);

    const added = await addBuyIn(gameId, mor);
    expect(fold(await loadGameEvents(gameId)).players.get(mor)?.buysCount).toBe(1);

    await undoEvent(added);

    const events = await loadGameEvents(gameId);
    const state = fold(events);
    expect(state.players.get(mor)?.buysCount).toBe(0);

    const original = events.find((e) => e.clientEventId === added.clientEventId);
    expect(original?.undoneBy).not.toBeNull();
  });

  it('undoing a batch of taps (some +, some −) nets back to the starting count', async () => {
    const { gameId } = await createGame(baseInput);
    const mor = await firstPlayerId(gameId);

    const e1 = await addBuyIn(gameId, mor);
    const e2 = await addBuyIn(gameId, mor);
    const e3 = await removeBuyIn(gameId, mor);
    expect(fold(await loadGameEvents(gameId)).players.get(mor)?.buysCount).toBe(1);

    await undoEvent(e1);
    await undoEvent(e2);
    await undoEvent(e3);

    expect(fold(await loadGameEvents(gameId)).players.get(mor)?.buysCount).toBe(0);
  });
});

describe('cash paid, settle and reopen', () => {
  it('setCashPaid records the amount handed to the pot', async () => {
    const { gameId } = await createGame(baseInput);
    const mor = await firstPlayerId(gameId);

    await setCashPaid(gameId, mor, minor(5000));

    expect(fold(await loadGameEvents(gameId)).players.get(mor)?.cashPaidMinor).toBe(5000);
  });

  it('settlePlayer closes a row with its final chip count', async () => {
    const { gameId } = await createGame(baseInput);
    const mor = await firstPlayerId(gameId);
    await addBuyIn(gameId, mor);

    await settlePlayer(gameId, mor, 120);

    const player = fold(await loadGameEvents(gameId)).players.get(mor);
    expect(player?.isSettled).toBe(true);
    expect(player?.chipsFinal).toBe(120);
  });

  it('reopenPlayer un-settles a closed row', async () => {
    const { gameId } = await createGame(baseInput);
    const mor = await firstPlayerId(gameId);
    await settlePlayer(gameId, mor, 100);

    await reopenPlayer(gameId, mor);

    expect(fold(await loadGameEvents(gameId)).players.get(mor)?.isSettled).toBe(false);
  });

  it('editSettledChips corrects the count without reopening the row', async () => {
    const { gameId } = await createGame(baseInput);
    const mor = await firstPlayerId(gameId);
    await settlePlayer(gameId, mor, 100);

    await editSettledChips(gameId, mor, 110);

    const player = fold(await loadGameEvents(gameId)).players.get(mor);
    expect(player?.isSettled).toBe(true);
    expect(player?.chipsFinal).toBe(110);
  });
});

describe('shared costs', () => {
  it('addSharedCost, updateSharedCost and removeSharedCost round-trip through the fold', async () => {
    const { gameId } = await createGame(baseInput);
    const mor = await firstPlayerId(gameId);

    await addSharedCost(gameId, {
      label: 'פיצה',
      amountMinor: minor(12000),
      paidByPlayerId: mor,
      splitMode: 'equal',
      shares: { [mor]: 12000 },
    });

    const afterAdd = fold(await loadGameEvents(gameId));
    expect(afterAdd.sharedCosts.size).toBe(1);
    const cost = [...afterAdd.sharedCosts.values()][0]!;
    expect(cost.label).toBe('פיצה');

    await updateSharedCost(gameId, cost.id, {
      label: 'פיצה וקולה',
      amountMinor: minor(15000),
      paidByPlayerId: mor,
      splitMode: 'equal',
      shares: { [mor]: 15000 },
    });
    const afterUpdate = fold(await loadGameEvents(gameId));
    expect(afterUpdate.sharedCosts.get(cost.id)?.label).toBe('פיצה וקולה');
    expect(afterUpdate.sharedCosts.get(cost.id)?.amountMinor).toBe(15000);

    await removeSharedCost(gameId, cost.id);
    const afterRemove = fold(await loadGameEvents(gameId));
    expect(afterRemove.sharedCosts.size).toBe(0);
  });
});

describe('setUnaccounted', () => {
  it('records the "assign to the house" amount', async () => {
    const { gameId } = await createGame(baseInput);
    await setUnaccounted(gameId, minor(2000));
    expect(fold(await loadGameEvents(gameId)).unaccountedMinor).toBe(2000);
  });
});

// ---------------------------------------------------------------------------
// Ending the game
// ---------------------------------------------------------------------------

/** Seats and settles the four-player worked example from 07-hebrew-glossary.md
 *  (דנה +50, אורי +20, רני −30, מור −40), so the safeguard is balanced and
 *  `beginSettlement` doesn't throw on an unbalanced pot. */
async function createBalancedFinishedGame(): Promise<{
  gameId: string;
  ids: { mor: string; uri: string; rani: string; dana: string };
}> {
  const { gameId } = await createGame(baseInput);
  const state = fold(await loadGameEvents(gameId));
  const byName = (name: string) =>
    [...state.players.values()].find((p) => p.guestName === name)!.id;
  const ids = { mor: byName('מור'), uri: byName('אורי'), rani: byName('רני'), dana: byName('דנה') };

  for (const id of Object.values(ids)) await addBuyIn(gameId, id);
  await settlePlayer(gameId, ids.mor, 20);
  await settlePlayer(gameId, ids.uri, 140);
  await settlePlayer(gameId, ids.rani, 40);
  await settlePlayer(gameId, ids.dana, 200);

  return { gameId, ids };
}

describe('beginSettlement', () => {
  it('transitions to settling and seeds the computed transfer list as real events', async () => {
    const { gameId, ids } = await createBalancedFinishedGame();

    await beginSettlement(gameId);

    const state = fold(await loadGameEvents(gameId));
    expect(state.status).toBe('settling');
    const transfers = [...state.transfers.values()].filter((t) => t.amountMinor > 0);
    // מור→דנה ₪40, רני→אורי ₪20, רני→דנה ₪10 — the exact fixture from settlement.test.ts.
    expect(transfers).toHaveLength(3);
    expect(transfers.reduce((s, t) => s + t.amountMinor, 0)).toBe(7000);
    expect(transfers.every((t) => t.fromPlayerId === ids.mor || t.fromPlayerId === ids.rani)).toBe(true);
  });
});

describe('editing transfers during settlement', () => {
  it('editTransfer overwrites a seeded transfer in place (same transferId, last-writer-wins)', async () => {
    const { gameId } = await createBalancedFinishedGame();
    await beginSettlement(gameId);
    const before = [...fold(await loadGameEvents(gameId)).transfers.values()].find(
      (t) => t.amountMinor > 0,
    )!;

    await editTransfer(gameId, before.id, before.fromPlayerId, before.toPlayerId, minor(1));

    const after = fold(await loadGameEvents(gameId)).transfers.get(before.id);
    expect(after?.amountMinor).toBe(1);
    expect(after?.isManual).toBe(true);
  });

  it('addManualTransfer adds a new row without touching existing ones', async () => {
    const { gameId, ids } = await createBalancedFinishedGame();
    await beginSettlement(gameId);
    const before = [...fold(await loadGameEvents(gameId)).transfers.values()];

    await addManualTransfer(gameId, ids.mor, ids.dana, minor(500));

    const after = [...fold(await loadGameEvents(gameId)).transfers.values()].filter(
      (t) => t.amountMinor > 0,
    );
    expect(after).toHaveLength(before.filter((t) => t.amountMinor > 0).length + 1);
  });

  it('deleteTransfer zeroes the row instead of removing it from the log', async () => {
    const { gameId } = await createBalancedFinishedGame();
    await beginSettlement(gameId);
    const target = [...fold(await loadGameEvents(gameId)).transfers.values()].find(
      (t) => t.amountMinor > 0,
    )!;

    await deleteTransfer(gameId, target.id, target.fromPlayerId, target.toPlayerId);

    const events = await loadGameEvents(gameId);
    expect(events.some((e) => e.type === 'transfer_edited' && e.payload.transferId === target.id)).toBe(
      true,
    );
    expect(fold(events).transfers.get(target.id)?.amountMinor).toBe(0);
  });

  it('recomputeTransfers zeroes every current row and reseeds fresh ones', async () => {
    const { gameId } = await createBalancedFinishedGame();
    await beginSettlement(gameId);
    const current = [...fold(await loadGameEvents(gameId)).transfers.values()].map((t) => ({
      id: t.id,
      fromPlayerId: t.fromPlayerId,
      toPlayerId: t.toPlayerId,
    }));

    await recomputeTransfers(gameId, current);

    const state = fold(await loadGameEvents(gameId));
    for (const c of current) {
      expect(state.transfers.get(c.id)?.amountMinor).toBe(0);
    }
    const fresh = [...state.transfers.values()].filter((t) => t.amountMinor > 0);
    expect(fresh).toHaveLength(3);
  });

  it('can route a transfer through the pot sentinel', async () => {
    const { gameId, ids } = await createBalancedFinishedGame();
    await beginSettlement(gameId);

    await addManualTransfer(gameId, POT_ID, ids.dana, minor(100));

    const state = fold(await loadGameEvents(gameId));
    expect([...state.transfers.values()].some((t) => t.fromPlayerId === POT_ID)).toBe(true);
  });
});

describe('finalizeGame', () => {
  it('writes the snapshot before appending game_ended, using the settlement-screen transfer list verbatim', async () => {
    const { gameId } = await createBalancedFinishedGame();
    await beginSettlement(gameId);
    const seeded = [...fold(await loadGameEvents(gameId)).transfers.values()].filter(
      (t) => t.amountMinor > 0,
    );

    await finalizeGame(gameId, {
      name: 'פוקר חמישי',
      playedOn: '2026-07-29',
      currency: 'ILS',
      isPrivate: false,
    });

    const state = fold(await loadGameEvents(gameId));
    expect(state.status).toBe('finished');

    const record = await db.snapshots.get(gameId);
    expect(record).toBeDefined();
    expect(record!.snapshot.summary.playerCount).toBe(4);
    expect(record!.snapshot.transfers).toHaveLength(seeded.length);
    expect(record!.snapshot.playerResults).toHaveLength(4);
  });

  it('a manual edit made in the settlement screen survives verbatim into the snapshot', async () => {
    const { gameId, ids } = await createBalancedFinishedGame();
    await beginSettlement(gameId);
    // Route ₪999 through the pot instead of whatever the optimum computed —
    // proves finalizeGame writes the host's edit, not a fresh recomputation.
    await addManualTransfer(gameId, POT_ID, ids.dana, minor(999));

    await finalizeGame(gameId, {
      name: 'פוקר חמישי',
      playedOn: '2026-07-29',
      currency: 'ILS',
      isPrivate: false,
    });

    const record = await db.snapshots.get(gameId);
    expect(record!.snapshot.transfers.some((t) => t.fromId === POT_ID && t.amountMinor === 999)).toBe(
      true,
    );
  });
});

describe('reopenGame', () => {
  it('reopens a finished game and deletes its now-stale snapshot', async () => {
    const { gameId } = await createBalancedFinishedGame();
    await beginSettlement(gameId);
    await finalizeGame(gameId, {
      name: 'פוקר חמישי',
      playedOn: '2026-07-29',
      currency: 'ILS',
      isPrivate: false,
    });
    expect(await db.snapshots.get(gameId)).toBeDefined();

    await reopenGame(gameId);

    expect(fold(await loadGameEvents(gameId)).status).toBe('active');
    expect(await db.snapshots.get(gameId)).toBeUndefined();
  });
});
