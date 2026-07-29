import { beforeEach, describe, expect, it } from 'vitest';
import { fold } from '../events';
import { minor } from '../money';
import { db } from './db';
import {
  addBuyIn,
  addPlayersToGame,
  addSharedCost,
  createGame,
  editSettledChips,
  removeBuyIn,
  removePlayer,
  removeSharedCost,
  renamePlayer,
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
