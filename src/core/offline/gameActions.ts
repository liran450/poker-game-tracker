import { createUndoEvent, fold, generateClientEventId, type GameEvent } from '../events';
import type { Minor } from '../money';
import { nextTimestamp } from './clock';
import { db, type CachedGameRecord } from './db';
import { getLocalActorId } from './localIdentity';
import { appendEvent, appendUndoEvent, loadGameEvents } from './outbox';
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
    clientCreatedAt: nextTimestamp(),
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
    clientCreatedAt: nextTimestamp(),
    undoneBy: null,
    type: 'host_changed',
    payload: { newHostId: actorId },
  });

  await appendEvent({
    clientEventId: generateClientEventId(),
    gameId,
    playerId: null,
    actorId,
    clientCreatedAt: nextTimestamp(),
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
    clientCreatedAt: nextTimestamp(),
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
    clientCreatedAt: nextTimestamp(),
    undoneBy: null,
    type: 'player_renamed',
    payload: { name: name.trim() },
  });
}

/**
 * One tap, one commutative increment (04-ux-spec.md#the-buy-in-counter--the-most-important-interaction-in-the-app).
 * Returns the appended event so the caller (the coalescing-undo batch state)
 * can hand it straight to `undoEvent` without a re-query.
 */
export async function addBuyIn(gameId: string, playerId: string): Promise<GameEvent> {
  const event: GameEvent = {
    clientEventId: generateClientEventId(),
    gameId,
    playerId,
    actorId: await getLocalActorId(),
    clientCreatedAt: nextTimestamp(),
    undoneBy: null,
    type: 'buy_in_added',
    payload: {},
  };
  await appendEvent(event);
  return event;
}

/** The `−` side of the counter. Guarded at the caller — never taken below 0 buy-ins. */
export async function removeBuyIn(gameId: string, playerId: string): Promise<GameEvent> {
  const event: GameEvent = {
    clientEventId: generateClientEventId(),
    gameId,
    playerId,
    actorId: await getLocalActorId(),
    clientCreatedAt: nextTimestamp(),
    undoneBy: null,
    type: 'buy_in_removed',
    payload: {},
  };
  await appendEvent(event);
  return event;
}

/** Cash paid at the table, edited directly on the row (04-ux-spec.md#player-row-anatomy, #18). */
export async function setCashPaid(gameId: string, playerId: string, amountMinor: Minor): Promise<void> {
  const actorId = await getLocalActorId();
  await appendEvent({
    clientEventId: generateClientEventId(),
    gameId,
    playerId,
    actorId,
    clientCreatedAt: nextTimestamp(),
    undoneBy: null,
    type: 'cash_paid_set',
    payload: { amountMinor },
  });
}

/** Closes a player out with their counted chips (04-ux-spec.md#settling-a-player-15). */
export async function settlePlayer(gameId: string, playerId: string, chipsFinal: number): Promise<void> {
  const actorId = await getLocalActorId();
  await appendEvent({
    clientEventId: generateClientEventId(),
    gameId,
    playerId,
    actorId,
    clientCreatedAt: nextTimestamp(),
    undoneBy: null,
    type: 'player_settled',
    payload: { chipsFinal, settledAt: new Date().toISOString() },
  });
}

/** Reopens a settled row (04-ux-spec.md#row-action-sheet). */
export async function reopenPlayer(gameId: string, playerId: string): Promise<void> {
  const actorId = await getLocalActorId();
  await appendEvent({
    clientEventId: generateClientEventId(),
    gameId,
    playerId,
    actorId,
    clientCreatedAt: nextTimestamp(),
    undoneBy: null,
    type: 'player_reopened',
    payload: {},
  });
}

/**
 * Corrects an already-settled player's counted chips without touching their
 * settled status or timestamp — "עריכת ז'יטונים" in the row action sheet,
 * reachable only once a row is settled.
 */
export async function editSettledChips(gameId: string, playerId: string, chips: number): Promise<void> {
  const actorId = await getLocalActorId();
  await appendEvent({
    clientEventId: generateClientEventId(),
    gameId,
    playerId,
    actorId,
    clientCreatedAt: nextTimestamp(),
    undoneBy: null,
    type: 'chips_set',
    payload: { chips },
  });
}

export interface SharedCostInput {
  readonly label: string;
  readonly amountMinor: Minor;
  /** null = paid from the pot (שולם מהקופה). */
  readonly paidByPlayerId: string | null;
  readonly splitMode: 'equal' | 'custom';
  /** playerId → their share, in minor units. Must sum to `amountMinor`. */
  readonly shares: Record<string, number>;
}

/** Adds a shared cost (04-ux-spec.md#shared-costs). */
export async function addSharedCost(gameId: string, input: SharedCostInput): Promise<void> {
  const actorId = await getLocalActorId();
  await appendEvent({
    clientEventId: generateClientEventId(),
    gameId,
    playerId: null,
    actorId,
    clientCreatedAt: nextTimestamp(),
    undoneBy: null,
    type: 'shared_cost_added',
    payload: { costId: crypto.randomUUID(), ...input },
  });
}

/** Edits an existing shared cost in place — a new `shared_cost_updated` event, not a remove+add. */
export async function updateSharedCost(
  gameId: string,
  costId: string,
  input: SharedCostInput,
): Promise<void> {
  const actorId = await getLocalActorId();
  await appendEvent({
    clientEventId: generateClientEventId(),
    gameId,
    playerId: null,
    actorId,
    clientCreatedAt: nextTimestamp(),
    undoneBy: null,
    type: 'shared_cost_updated',
    payload: { costId, ...input },
  });
}

/**
 * Removes a shared cost. Deliberately not offered as "undo" through the
 * generic audit-log mechanism — see `isGenericallyReversible` in
 * `core/events.ts` for why that would corrupt the fold.
 */
export async function removeSharedCost(gameId: string, costId: string): Promise<void> {
  const actorId = await getLocalActorId();
  await appendEvent({
    clientEventId: generateClientEventId(),
    gameId,
    playerId: null,
    actorId,
    clientCreatedAt: nextTimestamp(),
    undoneBy: null,
    type: 'shared_cost_removed',
    payload: { costId },
  });
}

/**
 * The safeguard's "assign to the house" resolution (05-settlement.md#the-safeguard-20):
 * `unaccounted_minor` absorbs the discrepancy so the pot banner reads balanced.
 */
export async function setUnaccounted(gameId: string, amountMinor: Minor): Promise<void> {
  const actorId = await getLocalActorId();
  await appendEvent({
    clientEventId: generateClientEventId(),
    gameId,
    playerId: null,
    actorId,
    clientCreatedAt: nextTimestamp(),
    undoneBy: null,
    type: 'unaccounted_set',
    payload: { amountMinor },
  });
}

/**
 * The generic undo behind the coalescing snackbar/batch bar and the audit
 * log's "long-press to undo" (only offered where `isGenericallyReversible`
 * says it's safe). Appends the inverse and stamps `undoneBy` on the original
 * in one transaction — see `appendUndoEvent` in `core/offline/outbox.ts`.
 */
export async function undoEvent(original: GameEvent): Promise<void> {
  const actorId = await getLocalActorId();
  const { inverseEvent, undoneByEventId } = createUndoEvent(original, actorId, nextTimestamp());
  await appendUndoEvent(inverseEvent, original.clientEventId, undoneByEventId);
}
