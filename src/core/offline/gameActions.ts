import { fold, generateClientEventId } from '../events';
import type { Minor } from '../money';
import { db, type CachedGameRecord } from './db';
import { getLocalActorId } from './localIdentity';
import { appendEvent, loadGameEvents } from './outbox';
import { recordPlayedNames } from './recentPlayers';

export interface NewGameInput {
  readonly name: string;
  readonly buyAmountMinor: Minor;
  readonly chipsPerBuy: number;
  readonly currencyCode: string;
  readonly isPrivate: boolean;
  /** Guest names, in the order they should be seated. */
  readonly playerNames: readonly string[];
}

export interface CreatedGame {
  readonly gameId: string;
}

async function appendPlayerAdded(
  gameId: string,
  actorId: string,
  name: string,
  seatOrder: number,
): Promise<void> {
  await appendEvent({
    clientEventId: generateClientEventId(),
    gameId,
    playerId: crypto.randomUUID(),
    actorId,
    clientCreatedAt: new Date().toISOString(),
    undoneBy: null,
    type: 'player_added',
    payload: { userId: null, guestName: name.trim(), nickname: null, seatOrder },
  });
}

/**
 * Creates the game record (a plain mutable row per 03-data-model.md#games,
 * not event-sourced) and seats the given players in one go — the setup
 * screen's single "התחל משחק" button both creates and starts the game, so
 * there is nothing between "setup" and "active" worth persisting.
 *
 * The device's local actor id becomes the host until step 12 wires up real
 * accounts — see NOTES.md.
 */
export async function createGame(input: NewGameInput): Promise<CreatedGame> {
  const gameId = crypto.randomUUID();
  const actorId = await getLocalActorId();
  const now = new Date().toISOString();

  const record: CachedGameRecord = {
    id: gameId,
    updatedAt: now,
    createdAt: now,
    name: input.name,
    buyAmountMinor: input.buyAmountMinor,
    chipsPerBuy: input.chipsPerBuy,
    currencyCode: input.currencyCode,
    isPrivate: input.isPrivate,
  };
  await db.games.put(record);

  let seatOrder = 0;
  for (const name of input.playerNames) {
    await appendPlayerAdded(gameId, actorId, name, seatOrder);
    seatOrder += 1;
  }

  await appendEvent({
    clientEventId: generateClientEventId(),
    gameId,
    playerId: null,
    actorId,
    clientCreatedAt: new Date().toISOString(),
    undoneBy: null,
    type: 'host_changed',
    payload: { newHostId: actorId },
  });

  await appendEvent({
    clientEventId: generateClientEventId(),
    gameId,
    playerId: null,
    actorId,
    clientCreatedAt: new Date().toISOString(),
    undoneBy: null,
    type: 'game_started',
    payload: {},
  });

  if (input.playerNames.length > 0) {
    await recordPlayedNames(input.playerNames);
  }

  return { gameId };
}

/** Seats more players in an already-active game — late joiners (03-data-model.md#game_players). */
export async function addPlayersToGame(gameId: string, names: readonly string[]): Promise<void> {
  if (names.length === 0) return;

  const actorId = await getLocalActorId();
  const state = fold(await loadGameEvents(gameId));
  const seatOrders = [...state.players.values()].map((p) => p.seatOrder);
  let nextSeatOrder = seatOrders.length > 0 ? Math.max(...seatOrders) + 1 : 0;

  for (const name of names) {
    await appendPlayerAdded(gameId, actorId, name, nextSeatOrder);
    nextSeatOrder += 1;
  }

  await recordPlayedNames(names);
}

/** Soft-delete: kept in the log, excluded from math and the roster (03-data-model.md#game_players). */
export async function removePlayer(gameId: string, playerId: string): Promise<void> {
  const actorId = await getLocalActorId();
  await appendEvent({
    clientEventId: generateClientEventId(),
    gameId,
    playerId,
    actorId,
    clientCreatedAt: new Date().toISOString(),
    undoneBy: null,
    type: 'player_removed',
    payload: {},
  });
}

/** A guest's free-text name (04-ux-spec.md#renaming-a-player). Nicknames arrive with accounts (step 12). */
export async function renamePlayer(gameId: string, playerId: string, name: string): Promise<void> {
  const actorId = await getLocalActorId();
  await appendEvent({
    clientEventId: generateClientEventId(),
    gameId,
    playerId,
    actorId,
    clientCreatedAt: new Date().toISOString(),
    undoneBy: null,
    type: 'player_renamed',
    payload: { name: name.trim() },
  });
}
