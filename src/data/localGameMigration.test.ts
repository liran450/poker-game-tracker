import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fold } from '@core/events';
import { minor } from '@core/money';
import { db } from '@core/offline/db';
import { addBuyIn, createGame, settlePlayer, beginSettlement, finalizeGame, type NewGameInput } from '@core/offline/gameActions';
import { getLocalActorId } from '@core/offline/localIdentity';
import { loadGameEvents } from '@core/offline/outbox';
import { ensureGameRowExists, migrateAllLocalGames, rewriteLocalActorId, uploadLocalGame } from './localGameMigration';
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

async function createFinishedGame(): Promise<string> {
  const { gameId } = await createGame(baseInput);
  const state = fold(await loadGameEvents(gameId));
  for (const player of state.players.values()) {
    await addBuyIn(gameId, player.id);
    await settlePlayer(gameId, player.id, 100);
  }
  await beginSettlement(gameId);
  await finalizeGame(gameId, {
    name: baseInput.name,
    playedOn: '2026-07-31',
    currency: baseInput.currencyCode,
    isPrivate: false,
  });
  return gameId;
}

beforeEach(async () => {
  await Promise.all([
    db.games.clear(),
    db.events.clear(),
    db.outbox.clear(),
    db.meta.clear(),
    db.snapshots.clear(),
  ]);
});

describe('rewriteLocalActorId', () => {
  it('rewrites every locally-authored event to the real profile id', async () => {
    const { gameId } = await createGame(baseInput);
    const oldActorId = await getLocalActorId();

    await rewriteLocalActorId('user-1');

    const events = await loadGameEvents(gameId);
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.actorId === 'user-1')).toBe(true);
    expect(events.some((e) => e.actorId === oldActorId)).toBe(false);
  });

  it('also rewrites host_changed.newHostId, which embeds the same actor id', async () => {
    const { gameId } = await createGame(baseInput);
    await rewriteLocalActorId('user-1');

    const state = fold(await loadGameEvents(gameId));
    expect(state.hostId).toEqual('user-1');
  });

  it('updates the still-queued outbox copy of each event too', async () => {
    const { gameId } = await createGame(baseInput);
    await rewriteLocalActorId('user-1');

    const outboxEntries = await db.outbox.where('gameId').equals(gameId).toArray();
    expect(outboxEntries.length).toBeGreaterThan(0);
    expect(outboxEntries.every((entry) => entry.event.actorId === 'user-1')).toBe(true);
  });

  it('is idempotent — a second call for the same profile id changes nothing further', async () => {
    await createGame(baseInput);
    await rewriteLocalActorId('user-1');
    const afterFirst = await db.events.toArray();

    await rewriteLocalActorId('user-1');
    const afterSecond = await db.events.toArray();

    expect(afterSecond).toEqual(afterFirst);
  });
});

describe('ensureGameRowExists', () => {
  it('inserts a games row derived from the local record and folded state', async () => {
    const { gameId } = await createGame(baseInput);
    const fake = new FakePostgrestClient();

    await ensureGameRowExists(gameId, 'user-1', client(fake));

    const rows = fake.rows('games');
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(typeof row.started_at).toEqual('string');
    expect(row).toEqual({
      id: gameId,
      name: baseInput.name,
      currency: 'ILS',
      buy_amount_minor: 5000,
      chips_per_buy: 100,
      is_private: false,
      group_id: null,
      status: 'active',
      host_id: 'user-1',
      created_by: 'user-1',
      started_at: row.started_at,
      ended_at: null,
      unaccounted_minor: 0,
    });
  });

  it('does nothing when the row already exists', async () => {
    const { gameId } = await createGame(baseInput);
    const fake = new FakePostgrestClient();
    fake.seed('games', [{ id: gameId, name: 'already there' }]);

    await ensureGameRowExists(gameId, 'user-1', client(fake));

    expect(fake.rows('games')).toHaveLength(1);
    expect(fake.rows('games')[0]!.name).toEqual('already there');
  });

  it('throws when there is no local record for the game', async () => {
    const fake = new FakePostgrestClient();
    await expect(ensureGameRowExists('missing-game', 'user-1', client(fake))).rejects.toThrow(
      /no complete local game record/,
    );
  });
});

describe('uploadLocalGame', () => {
  it('creates the games row, pushes the outbox, and finalizes an already-finished game', async () => {
    const gameId = await createFinishedGame();
    const fake = new FakePostgrestClient();
    const finalizeCalls: Record<string, unknown>[] = [];
    fake.onRpc('finalize_game', (args) => {
      finalizeCalls.push(args);
      return { error: null };
    });

    await uploadLocalGame(gameId, 'user-1', client(fake));

    expect(fake.rows('games')).toHaveLength(1);
    expect(fake.rows('game_events').length).toBeGreaterThan(0);
    expect(await db.outbox.where('gameId').equals(gameId).toArray()).toHaveLength(0);
    expect(finalizeCalls).toEqual([{ p_game_id: gameId }]);
  });

  it('does not call finalize_game for a game that is still active', async () => {
    const { gameId } = await createGame(baseInput);
    const fake = new FakePostgrestClient();
    const finalizeCalls: Record<string, unknown>[] = [];
    fake.onRpc('finalize_game', (args) => {
      finalizeCalls.push(args);
      return { error: null };
    });

    await uploadLocalGame(gameId, 'user-1', client(fake));

    expect(finalizeCalls).toEqual([]);
  });
});

describe('migrateAllLocalGames', () => {
  it('rewrites the actor id once and uploads every locally-cached game', async () => {
    const { gameId: activeGameId } = await createGame(baseInput);
    const finishedGameId = await createFinishedGame();
    const fake = new FakePostgrestClient();
    fake.onRpc('finalize_game', () => ({ error: null }));

    await migrateAllLocalGames('user-1', client(fake));

    const gameRows = fake.rows('games').map((row) => row.id);
    expect(gameRows).toEqual(expect.arrayContaining([activeGameId, finishedGameId]));
    expect(fold(await loadGameEvents(activeGameId)).hostId).toEqual('user-1');
  });

  it('keeps migrating the rest even if one game fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { gameId: firstGameId } = await createGame(baseInput);
    const { gameId: secondGameId } = await createGame({ ...baseInput, name: 'Second game' });
    const fake = new FakePostgrestClient();
    // A one-shot failure against the *first* `games` operation reached — which of the two
    // games that is depends on Dexie's key ordering, not insertion order, so the assertions
    // below don't assume which one failed, only that exactly one did and the other didn't.
    fake.failNextOperationOn('games', 'boom');

    await migrateAllLocalGames('user-1', client(fake));

    const gameRows = fake.rows('games').map((row) => row.id);
    expect(gameRows).toHaveLength(1);
    expect([firstGameId, secondGameId]).toContain(gameRows[0]);
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });
});
