import { createUndoEvent, fold, generateClientEventId, type GameEvent, type GameState } from '../events';
import { minor, type Minor } from '../money';
import { dedupeDisplayNames, renderPlayerName } from '../players';
import {
  buildGameSnapshot,
  computeBalances,
  computeTransfers,
  settlementNodes,
  type GameSnapshotInput,
  type SettlementPlayerInput,
  type SettlementSharedCostInput,
  type SnapshotPlayerInput,
  type Transfer,
} from '../settlement';
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

// ---------------------------------------------------------------------------
// Ending the game (04-ux-spec.md#ending-the-game, 05-settlement.md#edit-mode-1617)
// ---------------------------------------------------------------------------

async function loadSettlementInputs(gameId: string): Promise<{
  buyAmountMinor: Minor;
  chipsPerBuy: number;
  state: GameState;
  settlementPlayers: SettlementPlayerInput[];
  sharedCosts: SettlementSharedCostInput[];
}> {
  const record = await db.games.get(gameId);
  const state = fold(await loadGameEvents(gameId));
  const buyAmountMinor = minor(record?.buyAmountMinor ?? 0);
  const chipsPerBuy = record?.chipsPerBuy ?? 1;

  const activePlayers = [...state.players.values()].filter((p) => !p.isRemoved);
  const settlementPlayers: SettlementPlayerInput[] = activePlayers.map((p) => ({
    id: p.id,
    seatOrder: p.seatOrder,
    buysCount: p.buysCount,
    cashPaidMinor: p.cashPaidMinor,
    chipsFinal: p.chipsFinal ?? 0,
  }));
  const sharedCosts: SettlementSharedCostInput[] = [...state.sharedCosts.values()].map((c) => ({
    id: c.id,
    amountMinor: c.amountMinor,
    paidByPlayerId: c.paidByPlayerId,
    shares: c.shares,
  }));

  return { buyAmountMinor, chipsPerBuy, state, settlementPlayers, sharedCosts };
}

async function computeFreshTransfers(gameId: string): Promise<readonly Transfer[]> {
  const { buyAmountMinor, chipsPerBuy, state, settlementPlayers, sharedCosts } =
    await loadSettlementInputs(gameId);
  const balances = computeBalances(
    settlementPlayers,
    sharedCosts,
    buyAmountMinor,
    chipsPerBuy,
    state.unaccountedMinor,
  );
  return computeTransfers(settlementNodes(balances));
}

async function appendTransferEdited(
  gameId: string,
  actorId: string,
  transferId: string,
  fromPlayerId: string,
  toPlayerId: string,
  amountMinor: Minor,
): Promise<void> {
  await appendEvent({
    clientEventId: generateClientEventId(),
    gameId,
    playerId: null,
    actorId,
    clientCreatedAt: nextTimestamp(),
    undoneBy: null,
    type: 'transfer_edited',
    payload: { transferId, fromPlayerId, toPlayerId, amountMinor },
  });
}

async function seedTransfers(gameId: string): Promise<void> {
  const transfers = await computeFreshTransfers(gameId);
  const actorId = await getLocalActorId();
  for (const t of transfers) {
    await appendTransferEdited(gameId, actorId, crypto.randomUUID(), t.fromId, t.toId, t.amountMinor);
  }
}

/**
 * Enters the settlement/edit-mode screen: `game_settling`, then seeds the
 * initial transfer list from the computed optimum as real, editable
 * `transfer_edited` events — from this point on `state.transfers` is the
 * single source of truth for what's displayed, no separate "computed
 * default" merging logic needed anywhere (docs/build/NOTES.md).
 *
 * Callers must ensure every active player is settled first — the
 * missing-players check (04-ux-spec.md#ending-the-game) lives in the UI,
 * since `computeBalances` needs every player's final chip count.
 */
export async function beginSettlement(gameId: string): Promise<void> {
  const actorId = await getLocalActorId();
  await appendEvent({
    clientEventId: generateClientEventId(),
    gameId,
    playerId: null,
    actorId,
    clientCreatedAt: nextTimestamp(),
    undoneBy: null,
    type: 'game_settling',
    payload: {},
  });
  await seedTransfers(gameId);
}

/** A transfer row's chip-picker (party) or keypad (amount) edit. */
export async function editTransfer(
  gameId: string,
  transferId: string,
  fromPlayerId: string,
  toPlayerId: string,
  amountMinor: Minor,
): Promise<void> {
  const actorId = await getLocalActorId();
  await appendTransferEdited(gameId, actorId, transferId, fromPlayerId, toPlayerId, amountMinor);
}

/** `+ הוסף העברה`. */
export async function addManualTransfer(
  gameId: string,
  fromPlayerId: string,
  toPlayerId: string,
  amountMinor: Minor,
): Promise<void> {
  await editTransfer(gameId, crypto.randomUUID(), fromPlayerId, toPlayerId, amountMinor);
}

/**
 * Swipe/trash on a transfer row. Zeroes it out rather than removing it —
 * nothing is ever deleted from the log — and the UI filters zero-amount
 * transfers out of what it displays.
 */
export async function deleteTransfer(
  gameId: string,
  transferId: string,
  fromPlayerId: string,
  toPlayerId: string,
): Promise<void> {
  await editTransfer(gameId, transferId, fromPlayerId, toPlayerId, minor(0));
}

/**
 * `חשב מחדש` (05-settlement.md#edit-mode-1617): discards every current
 * transfer and reseeds from a fresh computation. The UI is responsible for
 * confirming first — once settlement has begun there is always at least the
 * auto-seeded list to discard.
 */
export async function recomputeTransfers(
  gameId: string,
  currentTransfers: readonly { id: string; fromPlayerId: string; toPlayerId: string }[],
): Promise<void> {
  const actorId = await getLocalActorId();
  for (const t of currentTransfers) {
    await appendTransferEdited(gameId, actorId, t.id, t.fromPlayerId, t.toPlayerId, minor(0));
  }
  await seedTransfers(gameId);
}

export interface FinalizeGameMeta {
  readonly name: string;
  readonly playedOn: string;
  readonly currency: string;
  readonly isPrivate: boolean;
}

/**
 * `סיים` on the settlement screen: builds and stores the permanent snapshot
 * (03-data-model.md#permanent-tables) from the host's final, possibly
 * hand-edited transfer list, then appends `game_ended`. The snapshot is
 * written *before* the event so a reader who sees `finished` can never find
 * a game with no snapshot (docs/build/PLAN.md#step-8).
 */
export async function finalizeGame(gameId: string, meta: FinalizeGameMeta): Promise<void> {
  const actorId = await getLocalActorId();
  const { buyAmountMinor, chipsPerBuy, state } = await loadSettlementInputs(gameId);
  const finishedAt = new Date().toISOString();

  const settledOrder = [...state.players.values()]
    .filter((p): p is typeof p & { settledAt: string } => p.settledAt !== null)
    .sort((a, b) => (a.settledAt < b.settledAt ? -1 : 1));
  const settledPositionById = new Map(settledOrder.map((p, i) => [p.id, i + 1]));

  const activePlayers = [...state.players.values()].filter((p) => !p.isRemoved);
  const displayNames = dedupeDisplayNames(
    activePlayers.map((p) => ({ id: p.id, name: renderPlayerName(p), order: p.seatOrder })),
  );

  const snapshotInput: GameSnapshotInput = {
    gameId,
    groupId: null,
    name: meta.name,
    playedOn: meta.playedOn,
    currency: meta.currency,
    buyAmountMinor,
    chipsPerBuy,
    isPrivate: meta.isPrivate,
    locationName: null,
    finishedAt,
    durationMinutes: state.startedAt
      ? Math.max(0, Math.round((Date.parse(finishedAt) - Date.parse(state.startedAt)) / 60_000))
      : 0,
    unaccountedMinor: state.unaccountedMinor,
    sharedCosts: [...state.sharedCosts.values()].map((c) => ({
      id: c.id,
      amountMinor: c.amountMinor,
      paidByPlayerId: c.paidByPlayerId,
      shares: c.shares,
    })),
    players: activePlayers.map(
      (p): SnapshotPlayerInput => ({
        id: p.id,
        seatOrder: p.seatOrder,
        userId: p.userId,
        guestName: p.guestName,
        displayName: displayNames.get(p.id) ?? '',
        buysCount: p.buysCount,
        cashPaidMinor: p.cashPaidMinor,
        chipsFinal: p.chipsFinal ?? 0,
        joinedAt: p.joinedAt,
        leftAt: p.settledAt,
        settledPosition: settledPositionById.get(p.id) ?? null,
      }),
    ),
  };

  const finalTransfers: Transfer[] = [...state.transfers.values()]
    .filter((t) => t.amountMinor > 0)
    .map((t) => ({ fromId: t.fromPlayerId, toId: t.toPlayerId, amountMinor: t.amountMinor }));

  const snapshot = buildGameSnapshot(snapshotInput, undefined, finalTransfers);
  await db.snapshots.put({ gameId, snapshot });

  await appendEvent({
    clientEventId: generateClientEventId(),
    gameId,
    playerId: null,
    actorId,
    clientCreatedAt: nextTimestamp(),
    undoneBy: null,
    type: 'game_ended',
    payload: {},
  });
}

/**
 * `פתח מחדש` within 24h (03-data-model.md#permanent-tables): reopens the
 * game and deletes its snapshot, since reopening makes it stale — the next
 * `finalizeGame` rewrites it, so there is never a stale duplicate.
 */
export async function reopenGame(gameId: string): Promise<void> {
  const actorId = await getLocalActorId();
  await appendEvent({
    clientEventId: generateClientEventId(),
    gameId,
    playerId: null,
    actorId,
    clientCreatedAt: nextTimestamp(),
    undoneBy: null,
    type: 'game_reopened',
    payload: {},
  });
  await db.snapshots.delete(gameId);
}
