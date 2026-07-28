import { z } from 'zod';
import { type Minor, minor } from './money';

// ---------------------------------------------------------------------------
// Event types — the single source of truth.
// Step 10's Postgres enum must match these character for character.
// ---------------------------------------------------------------------------

export const EVENT_TYPES = [
  'player_added',
  'player_removed',
  'player_renamed',
  'nickname_set',
  'buy_in_added',
  'buy_in_removed',
  'cash_paid_set',
  'chips_set',
  'player_settled',
  'player_reopened',
  'shared_cost_added',
  'shared_cost_removed',
  'shared_cost_updated',
  'game_started',
  'game_settling',
  'game_ended',
  'game_reopened',
  'host_changed',
  'host_taken_over',
  'viewer_added',
  'viewer_removed',
  'join_requested',
  'join_approved',
  'join_rejected',
  'player_invited',
  'claim_requested',
  'claim_approved',
  'claim_rejected',
  'unaccounted_set',
  'transfer_edited',
  'note',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

// ---------------------------------------------------------------------------
// Payload type map — one entry per event type
// ---------------------------------------------------------------------------

export interface EventPayloadMap {
  player_added: {
    userId: string | null;
    guestName: string | null;
    nickname: string | null;
    seatOrder: number;
  };
  player_removed: Record<string, never>;
  player_renamed: { name: string };
  nickname_set: { nickname: string | null };
  buy_in_added: Record<string, never>;
  buy_in_removed: Record<string, never>;
  cash_paid_set: { amountMinor: number };
  chips_set: { chips: number };
  player_settled: { chipsFinal: number; settledAt: string };
  player_reopened: Record<string, never>;
  shared_cost_added: {
    costId: string;
    label: string;
    amountMinor: number;
    paidByPlayerId: string | null;
    splitMode: 'equal' | 'custom';
    shares: Record<string, number>;
  };
  shared_cost_removed: { costId: string };
  shared_cost_updated: {
    costId: string;
    label: string;
    amountMinor: number;
    paidByPlayerId: string | null;
    splitMode: 'equal' | 'custom';
    shares: Record<string, number>;
  };
  game_started: Record<string, never>;
  game_settling: Record<string, never>;
  game_ended: Record<string, never>;
  game_reopened: Record<string, never>;
  host_changed: { newHostId: string };
  host_taken_over: { previousHostId: string };
  viewer_added: { userId: string };
  viewer_removed: { userId: string };
  join_requested: {
    requestId: string;
    userId: string | null;
    requestedName: string;
    requestedRole: 'player' | 'viewer';
    source: 'link' | 'in_app';
  };
  join_approved: { requestId: string; playerId: string | null };
  join_rejected: { requestId: string };
  player_invited: { userId: string; invitedBy: string };
  claim_requested: {
    claimId: string;
    gamePlayerId: string;
    claimantUserId: string;
  };
  claim_approved: {
    claimId: string;
    gamePlayerId: string;
    claimantUserId: string;
  };
  claim_rejected: { claimId: string };
  unaccounted_set: { amountMinor: number };
  transfer_edited: {
    transferId: string;
    fromPlayerId: string | null;
    toPlayerId: string | null;
    amountMinor: number;
  };
  note: { text: string };
}

// ---------------------------------------------------------------------------
// Event envelope and discriminated union
// ---------------------------------------------------------------------------

interface EventEnvelope {
  clientEventId: string;
  gameId: string;
  playerId: string | null;
  actorId: string;
  clientCreatedAt: string;
  undoneBy: string | null;
}

export type GameEvent = {
  [K in EventType]: EventEnvelope & { type: K; payload: EventPayloadMap[K] };
}[EventType];

export type GameEventOf<T extends EventType> = Extract<GameEvent, { type: T }>;

// ---------------------------------------------------------------------------
// Zod schemas — runtime validation at the boundary
// ---------------------------------------------------------------------------

const base = z.object({
  clientEventId: z.string(),
  gameId: z.string(),
  playerId: z.string().nullable(),
  actorId: z.string(),
  clientCreatedAt: z.string(),
  undoneBy: z.string().nullable(),
});

const empty = z.object({});
const splitModeEnum = z.enum(['equal', 'custom']);
const sharesRecord = z.record(z.string(), z.number().int());

const payloadSchemas = {
  player_added: z.object({
    userId: z.string().nullable(),
    guestName: z.string().nullable(),
    nickname: z.string().nullable(),
    seatOrder: z.number().int(),
  }),
  player_removed: empty,
  player_renamed: z.object({ name: z.string() }),
  nickname_set: z.object({ nickname: z.string().nullable() }),
  buy_in_added: empty,
  buy_in_removed: empty,
  cash_paid_set: z.object({ amountMinor: z.number().int() }),
  chips_set: z.object({ chips: z.number().int() }),
  player_settled: z.object({ chipsFinal: z.number().int(), settledAt: z.string() }),
  player_reopened: empty,
  shared_cost_added: z.object({
    costId: z.string(),
    label: z.string(),
    amountMinor: z.number().int(),
    paidByPlayerId: z.string().nullable(),
    splitMode: splitModeEnum,
    shares: sharesRecord,
  }),
  shared_cost_removed: z.object({ costId: z.string() }),
  shared_cost_updated: z.object({
    costId: z.string(),
    label: z.string(),
    amountMinor: z.number().int(),
    paidByPlayerId: z.string().nullable(),
    splitMode: splitModeEnum,
    shares: sharesRecord,
  }),
  game_started: empty,
  game_settling: empty,
  game_ended: empty,
  game_reopened: empty,
  host_changed: z.object({ newHostId: z.string() }),
  host_taken_over: z.object({ previousHostId: z.string() }),
  viewer_added: z.object({ userId: z.string() }),
  viewer_removed: z.object({ userId: z.string() }),
  join_requested: z.object({
    requestId: z.string(),
    userId: z.string().nullable(),
    requestedName: z.string(),
    requestedRole: z.enum(['player', 'viewer']),
    source: z.enum(['link', 'in_app']),
  }),
  join_approved: z.object({ requestId: z.string(), playerId: z.string().nullable() }),
  join_rejected: z.object({ requestId: z.string() }),
  player_invited: z.object({ userId: z.string(), invitedBy: z.string() }),
  claim_requested: z.object({
    claimId: z.string(),
    gamePlayerId: z.string(),
    claimantUserId: z.string(),
  }),
  claim_approved: z.object({
    claimId: z.string(),
    gamePlayerId: z.string(),
    claimantUserId: z.string(),
  }),
  claim_rejected: z.object({ claimId: z.string() }),
  unaccounted_set: z.object({ amountMinor: z.number().int() }),
  transfer_edited: z.object({
    transferId: z.string(),
    fromPlayerId: z.string().nullable(),
    toPlayerId: z.string().nullable(),
    amountMinor: z.number().int(),
  }),
  note: z.object({ text: z.string() }),
} satisfies Record<EventType, z.ZodType>;

const variants = EVENT_TYPES.map(
  (type) => base.extend({ type: z.literal(type), payload: payloadSchemas[type] }),
);

export const gameEventSchema = z.discriminatedUnion(
  'type',
  variants as unknown as [z.ZodObject<z.core.$ZodLooseShape>, z.ZodObject<z.core.$ZodLooseShape>, ...z.ZodObject<z.core.$ZodLooseShape>[]],
);

// ---------------------------------------------------------------------------
// Game state — what the fold produces
// ---------------------------------------------------------------------------

export type GameStatus = 'setup' | 'active' | 'settling' | 'finished';

export interface PlayerState {
  readonly id: string;
  readonly userId: string | null;
  readonly guestName: string | null;
  readonly nickname: string | null;
  readonly seatOrder: number;
  readonly joinedAt: string;
  readonly leftAt: string | null;
  readonly buysCount: number;
  readonly cashPaidMinor: Minor;
  readonly chipsFinal: number | null;
  readonly isSettled: boolean;
  readonly settledAt: string | null;
  readonly isRemoved: boolean;
}

export interface SharedCostState {
  readonly id: string;
  readonly label: string;
  readonly amountMinor: Minor;
  readonly paidByPlayerId: string | null;
  readonly splitMode: 'equal' | 'custom';
  readonly shares: ReadonlyMap<string, Minor>;
}

export interface JoinRequestState {
  readonly id: string;
  readonly userId: string | null;
  readonly requestedName: string;
  readonly requestedRole: 'player' | 'viewer';
  readonly source: 'link' | 'in_app';
  readonly status: 'pending' | 'approved' | 'rejected';
}

export interface ClaimState {
  readonly id: string;
  readonly gamePlayerId: string;
  readonly claimantUserId: string;
  readonly status: 'pending' | 'approved' | 'rejected';
}

export interface TransferState {
  readonly id: string;
  readonly fromPlayerId: string | null;
  readonly toPlayerId: string | null;
  readonly amountMinor: Minor;
  readonly isManual: boolean;
}

export interface GameState {
  readonly status: GameStatus;
  readonly hostId: string | null;
  readonly players: ReadonlyMap<string, PlayerState>;
  readonly sharedCosts: ReadonlyMap<string, SharedCostState>;
  readonly viewers: ReadonlySet<string>;
  readonly joinRequests: ReadonlyMap<string, JoinRequestState>;
  readonly claims: ReadonlyMap<string, ClaimState>;
  readonly transfers: ReadonlyMap<string, TransferState>;
  readonly unaccountedMinor: Minor;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
}

// Mutable internal versions for the fold
type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type MutablePlayer = Mutable<PlayerState>;
type MutableSharedCost = Mutable<Omit<SharedCostState, 'shares'>> & { shares: Map<string, Minor> };
type MutableJoinRequest = Mutable<JoinRequestState>;
type MutableClaim = Mutable<ClaimState>;
type MutableTransfer = Mutable<TransferState>;

interface InternalState {
  status: GameStatus;
  hostId: string | null;
  players: Map<string, MutablePlayer>;
  sharedCosts: Map<string, MutableSharedCost>;
  viewers: Set<string>;
  joinRequests: Map<string, MutableJoinRequest>;
  claims: Map<string, MutableClaim>;
  transfers: Map<string, MutableTransfer>;
  unaccountedMinor: Minor;
  startedAt: string | null;
  endedAt: string | null;
}

// ---------------------------------------------------------------------------
// The fold — deterministic, total, order-independent
// ---------------------------------------------------------------------------

export function emptyState(): GameState {
  return {
    status: 'setup',
    hostId: null,
    players: new Map(),
    sharedCosts: new Map(),
    viewers: new Set(),
    joinRequests: new Map(),
    claims: new Map(),
    transfers: new Map(),
    unaccountedMinor: minor(0),
    startedAt: null,
    endedAt: null,
  };
}

function eventCompare(a: GameEvent, b: GameEvent): number {
  if (a.clientCreatedAt < b.clientCreatedAt) return -1;
  if (a.clientCreatedAt > b.clientCreatedAt) return 1;
  if (a.clientEventId < b.clientEventId) return -1;
  if (a.clientEventId > b.clientEventId) return 1;
  return 0;
}

export function fold(events: readonly GameEvent[]): GameState {
  // 1. Deduplicate by clientEventId (idempotent application)
  const unique = new Map<string, GameEvent>();
  for (const e of events) {
    if (!unique.has(e.clientEventId)) {
      unique.set(e.clientEventId, e);
    }
  }

  // 2. Exclude undone event pairs
  const excluded = new Set<string>();
  for (const e of unique.values()) {
    if (e.undoneBy !== null) {
      excluded.add(e.clientEventId);
      excluded.add(e.undoneBy);
    }
  }

  // 3. Active events, sorted deterministically
  const active = [...unique.values()]
    .filter((e) => !excluded.has(e.clientEventId))
    .sort(eventCompare);

  // 4. Reduce
  const state: InternalState = {
    status: 'setup',
    hostId: null,
    players: new Map(),
    sharedCosts: new Map(),
    viewers: new Set(),
    joinRequests: new Map(),
    claims: new Map(),
    transfers: new Map(),
    unaccountedMinor: minor(0),
    startedAt: null,
    endedAt: null,
  };

  for (const event of active) {
    applyEvent(state, event);
  }

  return state;
}

function applyEvent(state: InternalState, event: GameEvent): void {
  switch (event.type) {
    // ---- Player events ----
    case 'player_added': {
      if (!event.playerId) break;
      state.players.set(event.playerId, {
        id: event.playerId,
        userId: event.payload.userId,
        guestName: event.payload.guestName,
        nickname: event.payload.nickname,
        seatOrder: event.payload.seatOrder,
        joinedAt: event.clientCreatedAt,
        leftAt: null,
        buysCount: 0,
        cashPaidMinor: minor(0),
        chipsFinal: null,
        isSettled: false,
        settledAt: null,
        isRemoved: false,
      });
      break;
    }

    case 'player_removed': {
      const player = event.playerId ? state.players.get(event.playerId) : undefined;
      if (player) player.isRemoved = true;
      break;
    }

    case 'player_renamed': {
      const player = event.playerId ? state.players.get(event.playerId) : undefined;
      if (player) player.guestName = event.payload.name;
      break;
    }

    case 'nickname_set': {
      const player = event.playerId ? state.players.get(event.playerId) : undefined;
      if (player) player.nickname = event.payload.nickname;
      break;
    }

    // ---- Buy-in events (commutative increments) ----
    case 'buy_in_added': {
      const player = event.playerId ? state.players.get(event.playerId) : undefined;
      if (player) player.buysCount += 1;
      break;
    }

    case 'buy_in_removed': {
      const player = event.playerId ? state.players.get(event.playerId) : undefined;
      if (player) player.buysCount -= 1;
      break;
    }

    // ---- Money set events ----
    case 'cash_paid_set': {
      const player = event.playerId ? state.players.get(event.playerId) : undefined;
      if (player) player.cashPaidMinor = minor(event.payload.amountMinor);
      break;
    }

    case 'chips_set': {
      const player = event.playerId ? state.players.get(event.playerId) : undefined;
      if (player) player.chipsFinal = event.payload.chips;
      break;
    }

    // ---- Settlement events ----
    case 'player_settled': {
      const player = event.playerId ? state.players.get(event.playerId) : undefined;
      if (player) {
        player.isSettled = true;
        player.chipsFinal = event.payload.chipsFinal;
        player.settledAt = event.payload.settledAt;
        player.leftAt = event.payload.settledAt;
      }
      break;
    }

    case 'player_reopened': {
      const player = event.playerId ? state.players.get(event.playerId) : undefined;
      if (player) {
        player.isSettled = false;
        player.chipsFinal = null;
        player.settledAt = null;
        player.leftAt = null;
      }
      break;
    }

    // ---- Shared cost events ----
    case 'shared_cost_added':
    case 'shared_cost_updated': {
      const p = event.payload;
      const shares = new Map<string, Minor>();
      for (const [k, v] of Object.entries(p.shares)) {
        shares.set(k, minor(v));
      }
      state.sharedCosts.set(p.costId, {
        id: p.costId,
        label: p.label,
        amountMinor: minor(p.amountMinor),
        paidByPlayerId: p.paidByPlayerId,
        splitMode: p.splitMode,
        shares,
      });
      break;
    }

    case 'shared_cost_removed': {
      state.sharedCosts.delete(event.payload.costId);
      break;
    }

    // ---- Game status events ----
    case 'game_started': {
      state.status = 'active';
      state.startedAt = event.clientCreatedAt;
      break;
    }

    case 'game_settling': {
      state.status = 'settling';
      break;
    }

    case 'game_ended': {
      state.status = 'finished';
      state.endedAt = event.clientCreatedAt;
      break;
    }

    case 'game_reopened': {
      state.status = 'active';
      state.endedAt = null;
      break;
    }

    // ---- Host events ----
    case 'host_changed': {
      state.hostId = event.payload.newHostId;
      break;
    }

    case 'host_taken_over': {
      state.hostId = event.actorId;
      break;
    }

    // ---- Viewer events ----
    case 'viewer_added': {
      state.viewers.add(event.payload.userId);
      break;
    }

    case 'viewer_removed': {
      state.viewers.delete(event.payload.userId);
      break;
    }

    // ---- Join request events ----
    case 'join_requested': {
      const p = event.payload;
      state.joinRequests.set(p.requestId, {
        id: p.requestId,
        userId: p.userId,
        requestedName: p.requestedName,
        requestedRole: p.requestedRole,
        source: p.source,
        status: 'pending',
      });
      break;
    }

    case 'join_approved': {
      const jr = state.joinRequests.get(event.payload.requestId);
      if (jr) jr.status = 'approved';
      break;
    }

    case 'join_rejected': {
      const jr = state.joinRequests.get(event.payload.requestId);
      if (jr) jr.status = 'rejected';
      break;
    }

    // ---- Claim events ----
    case 'claim_requested': {
      const p = event.payload;
      state.claims.set(p.claimId, {
        id: p.claimId,
        gamePlayerId: p.gamePlayerId,
        claimantUserId: p.claimantUserId,
        status: 'pending',
      });
      break;
    }

    case 'claim_approved': {
      const p = event.payload;
      const claim = state.claims.get(p.claimId);
      if (claim) claim.status = 'approved';
      const player = state.players.get(p.gamePlayerId);
      if (player) player.userId = p.claimantUserId;
      break;
    }

    case 'claim_rejected': {
      const claim = state.claims.get(event.payload.claimId);
      if (claim) claim.status = 'rejected';
      break;
    }

    // ---- Other events ----
    case 'unaccounted_set': {
      state.unaccountedMinor = minor(event.payload.amountMinor);
      break;
    }

    case 'transfer_edited': {
      const p = event.payload;
      state.transfers.set(p.transferId, {
        id: p.transferId,
        fromPlayerId: p.fromPlayerId,
        toPlayerId: p.toPlayerId,
        amountMinor: minor(p.amountMinor),
        isManual: true,
      });
      break;
    }

    // ---- Log-only events (no state change) ----
    case 'player_invited':
    case 'note':
      break;
  }
}

// ---------------------------------------------------------------------------
// Undo — appends an inverse event, links via undoneBy
// ---------------------------------------------------------------------------

const INVERSE_TYPES: Partial<Record<EventType, EventType>> = {
  player_added: 'player_removed',
  player_removed: 'player_added',
  buy_in_added: 'buy_in_removed',
  buy_in_removed: 'buy_in_added',
  player_settled: 'player_reopened',
  player_reopened: 'player_settled',
  shared_cost_added: 'shared_cost_removed',
  shared_cost_removed: 'shared_cost_added',
  game_started: 'game_reopened',
  game_ended: 'game_reopened',
};

export interface UndoResult {
  readonly inverseEvent: GameEvent;
  readonly undoneEventId: string;
  readonly undoneByEventId: string;
}

export function createUndoEvent(original: GameEvent, actorId: string): UndoResult {
  const inverseId = generateClientEventId();
  const inverseType = INVERSE_TYPES[original.type] ?? original.type;

  const inverseEvent = {
    clientEventId: inverseId,
    gameId: original.gameId,
    playerId: original.playerId,
    actorId,
    type: inverseType,
    payload: original.payload,
    clientCreatedAt: new Date().toISOString(),
    undoneBy: null,
  } as GameEvent;

  return {
    inverseEvent,
    undoneEventId: original.clientEventId,
    undoneByEventId: inverseId,
  };
}

// ---------------------------------------------------------------------------
// Client event ID generation
// ---------------------------------------------------------------------------

export function generateClientEventId(): string {
  return crypto.randomUUID();
}
