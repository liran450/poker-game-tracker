import { beforeEach, describe, expect, it } from 'vitest';
import { fold } from '../events';
import { minor } from '../money';
import { db } from './db';
import {
  addPlayersToGame,
  createGame,
  removePlayer,
  renamePlayer,
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
