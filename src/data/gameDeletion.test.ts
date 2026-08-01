import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it } from 'vitest';
import { minor } from '@core/money';
import { db } from '@core/offline/db';
import { createGame, type NewGameInput } from '@core/offline/gameActions';
import { loadGameEvents } from '@core/offline/outbox';
import { deleteGame } from './gameDeletion';
import { FakePostgrestClient } from './testSupport/fakePostgrestClient';

function client(fake: FakePostgrestClient): SupabaseClient {
  return fake as unknown as SupabaseClient;
}

const baseInput: NewGameInput = {
  name: 'פוקר — 26.07.26',
  buyAmountMinor: minor(5000),
  chipsPerBuy: 100,
  currencyCode: 'ILS',
  isPrivate: false,
  playerNames: ['מור', 'אורי'],
};

beforeEach(async () => {
  await Promise.all([
    db.games.clear(),
    db.events.clear(),
    db.outbox.clear(),
    db.meta.clear(),
    db.snapshots.clear(),
  ]);
});

describe('deleteGame', () => {
  it('deletes the local copy and the remote games row when cloud-configured', async () => {
    const { gameId } = await createGame(baseInput);
    const fake = new FakePostgrestClient();
    fake.seed('games', [{ id: gameId, host_id: 'host-1' }]);

    await deleteGame(gameId, client(fake));

    expect(await db.games.get(gameId)).toBeUndefined();
    expect(await loadGameEvents(gameId)).toEqual([]);
    expect(fake.rows('games').some((g) => g.id === gameId)).toBe(false);
  });

  it('still deletes the local copy when the app is not cloud-configured', async () => {
    const { gameId } = await createGame(baseInput);

    await deleteGame(gameId, null);

    expect(await db.games.get(gameId)).toBeUndefined();
    expect(await loadGameEvents(gameId)).toEqual([]);
  });

  it('is a harmless no-op remotely for a game that was never pushed to the server', async () => {
    const { gameId } = await createGame(baseInput);
    const fake = new FakePostgrestClient();
    // No `games` row seeded — this device's game never synced.

    await expect(deleteGame(gameId, client(fake))).resolves.toBeUndefined();
    expect(await db.games.get(gameId)).toBeUndefined();
  });
});
