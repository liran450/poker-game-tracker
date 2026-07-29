import {
  add,
  chipsToMoney,
  isZero,
  type Minor,
  minor,
  negate,
  net,
  owed,
  subtract,
  sum,
} from './money';

// ---------------------------------------------------------------------------
// The money model (05-settlement.md#the-money-model)
// ---------------------------------------------------------------------------

/**
 * Sentinel node ids for the two non-player parties in the settlement graph
 * (05-settlement.md#the-pot-as-a-settlement-node, #the-safeguard-20). Chosen
 * to be unmistakably distinct from a real player id (a `crypto.randomUUID()`).
 */
export const POT_ID = '__pot__';
export const HOUSE_ID = '__house__';

export interface SettlementPlayerInput {
  readonly id: string;
  /** Seat order, used only for deterministic tie-breaking — never for money. */
  readonly seatOrder: number;
  readonly buysCount: number;
  readonly cashPaidMinor: Minor;
  readonly chipsFinal: number;
}

export interface SettlementSharedCostInput {
  readonly id: string;
  readonly amountMinor: Minor;
  /** `null` means the pot paid (`שולם מהקופה`). */
  readonly paidByPlayerId: string | null;
  /** Already-resolved per-player amounts, summing to `amountMinor` — split
   *  (equal or custom) is computed once at the UI/event layer, not here. */
  readonly shares: ReadonlyMap<string, Minor>;
}

export interface PlayerBalance {
  readonly playerId: string;
  readonly seatOrder: number;
  readonly owedMinor: Minor;
  readonly cashOutMinor: Minor;
  /** Statistics only — poker result, excludes cash paid and shared costs. */
  readonly netMinor: Minor;
  /** What they paid for shared costs minus their share of them. */
  readonly sharedMinor: Minor;
  /** Settlement only — what still has to move. */
  readonly balanceMinor: Minor;
}

export interface SettlementBalances {
  readonly players: readonly PlayerBalance[];
  readonly potBalanceMinor: Minor;
  readonly houseBalanceMinor: Minor;
}

/**
 * Computes every player's `net`/`balance`, the pot's balance, and the
 * house's balance, per 05-settlement.md's formulas.
 *
 * The pot's balance is always `-P` (physical cash still owed out) with any
 * shared cost the pot itself paid for added back — "the cost simply reduces
 * what the pot pays out" (05-settlement.md#shared-costs). The house's
 * balance is `unaccountedMinor` verbatim: when it's set to exactly the raw
 * discrepancy (`core/pot.ts#computePotStatus`), the whole graph sums to zero
 * and "assign to the house" closes the books exactly, matching the pot
 * banner turning green. This is a derived consequence of the money model,
 * not a separate rule — see the settlement.test.ts invariant that proves it.
 */
export function computeBalances(
  players: readonly SettlementPlayerInput[],
  sharedCosts: readonly SettlementSharedCostInput[],
  buyAmountMinor: Minor,
  chipsPerBuy: number,
  unaccountedMinor: Minor,
): SettlementBalances {
  const paidByPlayer = new Map<string, Minor>();
  let potPaidSharedMinor = minor(0);

  for (const cost of sharedCosts) {
    if (cost.paidByPlayerId === null) {
      potPaidSharedMinor = add(potPaidSharedMinor, cost.amountMinor);
    } else {
      paidByPlayer.set(
        cost.paidByPlayerId,
        add(paidByPlayer.get(cost.paidByPlayerId) ?? minor(0), cost.amountMinor),
      );
    }
  }

  const playerBalances: PlayerBalance[] = players.map((p) => {
    const owedMinor = owed(p.buysCount, buyAmountMinor);
    const cashOutMinor = chipsToMoney(p.chipsFinal, buyAmountMinor, chipsPerBuy);
    const netMinor = net(cashOutMinor, owedMinor);

    let shareOfSharedMinor = minor(0);
    for (const cost of sharedCosts) {
      const share = cost.shares.get(p.id);
      if (share !== undefined) shareOfSharedMinor = add(shareOfSharedMinor, share);
    }
    const paidMinor = paidByPlayer.get(p.id) ?? minor(0);
    const sharedMinor = subtract(paidMinor, shareOfSharedMinor);

    const balanceMinor = add(add(netMinor, p.cashPaidMinor), sharedMinor);

    return {
      playerId: p.id,
      seatOrder: p.seatOrder,
      owedMinor,
      cashOutMinor,
      netMinor,
      sharedMinor,
      balanceMinor,
    };
  });

  const totalCashPaidMinor = sum(players.map((p) => p.cashPaidMinor));
  const potBalanceMinor = add(negate(totalCashPaidMinor), potPaidSharedMinor);

  return {
    players: playerBalances,
    potBalanceMinor,
    houseBalanceMinor: unaccountedMinor,
  };
}

// ---------------------------------------------------------------------------
// Minimum-transfer algorithm (05-settlement.md#minimum-transfer-algorithm-19)
// ---------------------------------------------------------------------------

export interface SettlementNode {
  readonly id: string;
  readonly seatOrder: number;
  readonly amountMinor: Minor;
}

/** Turns computed balances into the node list `computeTransfers` consumes. */
export function settlementNodes(balances: SettlementBalances): SettlementNode[] {
  const nodes: SettlementNode[] = balances.players.map((p) => ({
    id: p.playerId,
    seatOrder: p.seatOrder,
    amountMinor: p.balanceMinor,
  }));
  nodes.push({ id: POT_ID, seatOrder: -1, amountMinor: balances.potBalanceMinor });
  nodes.push({ id: HOUSE_ID, seatOrder: -2, amountMinor: balances.houseBalanceMinor });
  return nodes;
}

export interface Transfer {
  readonly fromId: string;
  readonly toId: string;
  readonly amountMinor: Minor;
}

interface WorkingNode {
  id: string;
  seatOrder: number;
  amountMinor: number;
}

/** Nodes above this count skip the DP and fall back to plain greedy
 *  (05-settlement.md#step-3--greedy-fallback). */
const DP_MAX_NODES = 14;

/**
 * The smallest set of transfers that settles every node to zero.
 *
 * Three stages, per 05-settlement.md:
 * 1. Cancel any exact debtor/creditor pair immediately.
 * 2. For what's left, find the optimal partition into disjoint zero-sum
 *    groups via bitmask DP (`n ≤ 14`), then run greedy *within* each group —
 *    which is always exactly `|group| − 1` transfers for a DP-irreducible
 *    group, regardless of match order, so this is provably optimal.
 * 3. Above that, skip the DP and run greedy over everything as one group
 *    (`≤ n − 1` transfers, not always optimal, but never worse than doing it
 *    by hand).
 *
 * The pot is treated as an ordinary node throughout — draining it globally
 * *before* partitioning was tried and rejected: it can defeat the optimal
 * partition and produce more transfers than the DP optimum (a concrete
 * counterexample lives in settlement.test.ts). Instead "prefer the pot as
 * payer" (05-settlement.md#tie-breaking) is applied only *inside* each
 * group's greedy resolution — pot is always picked as the active debtor
 * while it still has a balance — which never changes the group's transfer
 * count and still routes cash through the pot wherever the optimal
 * partition already put it there.
 *
 * Precondition: `nodes` must sum to zero (05-settlement.md's model assumes
 * `Σ cashOut = Σ owed`; the safeguard, `core/pot.ts`, is what makes that
 * true before this is called). Throws if it doesn't, rather than silently
 * producing a wrong answer.
 */
export function computeTransfers(nodes: readonly SettlementNode[]): Transfer[] {
  const active: WorkingNode[] = nodes
    .filter((n) => !isZero(n.amountMinor))
    .map((n) => ({ id: n.id, seatOrder: n.seatOrder, amountMinor: n.amountMinor }));

  const total = active.reduce((acc, n) => acc + n.amountMinor, 0);
  if (total !== 0) {
    throw new RangeError(
      `computeTransfers: balances must sum to zero, got ${total} — resolve the pot safeguard before settling`,
    );
  }
  if (active.length === 0) return [];

  const transfers: Transfer[] = [];
  cancelExactPairs(active, transfers);

  const remaining = active.filter((n) => n.amountMinor !== 0);
  if (remaining.length === 0) return transfers;

  const groups =
    remaining.length <= DP_MAX_NODES ? partitionIntoZeroSumGroups(remaining) : [remaining];

  for (const group of groups) {
    transfers.push(...settleGroupGreedy(group));
  }

  return transfers;
}

function potFirstThenSeat(a: WorkingNode, b: WorkingNode): number {
  if (a.id === POT_ID && b.id !== POT_ID) return -1;
  if (b.id === POT_ID && a.id !== POT_ID) return 1;
  return a.seatOrder - b.seatOrder;
}

function cancelExactPairs(nodes: WorkingNode[], transfers: Transfer[]): void {
  let matched = true;
  while (matched) {
    matched = false;
    const live = nodes.filter((n) => n.amountMinor !== 0).sort(potFirstThenSeat);
    for (const debtor of live) {
      if (debtor.amountMinor >= 0) continue;
      const creditor = live.find((c) => c.amountMinor === -debtor.amountMinor);
      if (creditor) {
        transfers.push({
          fromId: debtor.id,
          toId: creditor.id,
          amountMinor: minor(-debtor.amountMinor),
        });
        debtor.amountMinor = 0;
        creditor.amountMinor = 0;
        matched = true;
        break;
      }
    }
  }
}

function byPotFirstThenAbsDescThenSeat(a: WorkingNode, b: WorkingNode): number {
  if (a.id === POT_ID && b.id !== POT_ID) return -1;
  if (b.id === POT_ID && a.id !== POT_ID) return 1;
  const diff = Math.abs(b.amountMinor) - Math.abs(a.amountMinor);
  if (diff !== 0) return diff;
  return a.seatOrder - b.seatOrder;
}

/**
 * Greedy resolution *within* a single (already zero-sum) group: repeatedly
 * match the current debtor/creditor pair, preferring the pot as the active
 * debtor whenever it's still alive. Always produces exactly
 * `group.length - 1` transfers for a DP-irreducible group — see the
 * `computeTransfers` doc comment for why match order can't change that.
 */
function settleGroupGreedy(group: readonly WorkingNode[]): Transfer[] {
  const debtors = group.filter((n) => n.amountMinor < 0).map((n) => ({ ...n }));
  const creditors = group.filter((n) => n.amountMinor > 0).map((n) => ({ ...n }));
  const transfers: Transfer[] = [];

  while (debtors.length > 0 && creditors.length > 0) {
    debtors.sort(byPotFirstThenAbsDescThenSeat);
    creditors.sort(byPotFirstThenAbsDescThenSeat);
    const debtor = debtors[0]!;
    const creditor = creditors[0]!;
    const amount = Math.min(-debtor.amountMinor, creditor.amountMinor);

    transfers.push({ fromId: debtor.id, toId: creditor.id, amountMinor: minor(amount) });

    debtor.amountMinor += amount;
    creditor.amountMinor -= amount;

    if (debtor.amountMinor === 0) debtors.shift();
    if (creditor.amountMinor === 0) creditors.shift();
  }

  return transfers;
}

/**
 * Bitmask DP (05-settlement.md#step-2--exact-optimum-for-small-tables):
 * finds the partition of `nodes` into the maximum number of disjoint
 * zero-sum groups, then reconstructs the actual groups via parent pointers.
 * `O(3ⁿ)` worst case, restricted to masks that are themselves zero-sum —
 * well under a millisecond for `n ≤ 14` in practice.
 */
function partitionIntoZeroSumGroups(nodes: readonly WorkingNode[]): WorkingNode[][] {
  const n = nodes.length;
  const size = 1 << n;
  const sums = new Array<number>(size).fill(0);
  for (let mask = 1; mask < size; mask++) {
    const low = mask & -mask;
    const index = Math.log2(low);
    sums[mask] = sums[mask ^ low]! + nodes[index]!.amountMinor;
  }

  const UNSET = -1;
  const dp = new Array<number>(size).fill(UNSET);
  const parent = new Array<number>(size).fill(0);
  dp[0] = 0;

  for (let mask = 1; mask < size; mask++) {
    if (sums[mask] !== 0) continue;
    const low = mask & -mask;
    let best = UNSET;
    let bestSub = 0;
    for (let sub = mask; sub > 0; sub = (sub - 1) & mask) {
      if ((sub & low) !== low) continue;
      if (sums[sub] !== 0) continue;
      const rest = mask ^ sub;
      if (dp[rest] === UNSET) continue;
      const candidate = dp[rest]! + 1;
      if (candidate > best) {
        best = candidate;
        bestSub = sub;
      }
    }
    dp[mask] = best;
    parent[mask] = bestSub;
  }

  const full = size - 1;
  const groups: WorkingNode[][] = [];
  let mask = full;
  while (mask > 0) {
    const sub = parent[mask]!;
    const group: WorkingNode[] = [];
    for (let i = 0; i < n; i++) {
      if (sub & (1 << i)) group.push(nodes[i]!);
    }
    groups.push(group);
    mask ^= sub;
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Edit-mode reconciliation (05-settlement.md#edit-mode-1617)
// ---------------------------------------------------------------------------

export interface ReconciliationRow {
  readonly nodeId: string;
  /** אמור — what this node's balance says still has to move. */
  readonly shouldMoveMinor: Minor;
  /** בפועל — Σ of their transfers, signed (received minus sent). */
  readonly actuallyAssignedMinor: Minor;
  /** פער — actual minus should. Zero means this node's row is fully accounted for. */
  readonly differenceMinor: Minor;
  readonly isReconciled: boolean;
}

/** The per-node אמור/בפועל/פער strip under the transfer list. */
export function computeReconciliation(
  nodes: readonly SettlementNode[],
  transfers: readonly Transfer[],
): ReconciliationRow[] {
  const assigned = new Map<string, number>();
  for (const node of nodes) assigned.set(node.id, 0);
  for (const t of transfers) {
    assigned.set(t.toId, (assigned.get(t.toId) ?? 0) + t.amountMinor);
    assigned.set(t.fromId, (assigned.get(t.fromId) ?? 0) - t.amountMinor);
  }

  return nodes.map((node) => {
    const actuallyAssignedMinor = minor(assigned.get(node.id) ?? 0);
    const differenceMinor = subtract(actuallyAssignedMinor, node.amountMinor);
    return {
      nodeId: node.id,
      shouldMoveMinor: node.amountMinor,
      actuallyAssignedMinor,
      differenceMinor,
      isReconciled: isZero(differenceMinor),
    };
  });
}

export interface SettlementProgress {
  /** שויך — Σ of every transfer's amount. */
  readonly assignedMinor: Minor;
  /** מתוך — Σ of every positive balance, i.e. the total that has to move. */
  readonly totalToMoveMinor: Minor;
  /** True once every node's difference is zero — `הכל שויך ✓`. */
  readonly isComplete: boolean;
}

/** The sticky balance banner's `שויך ₪430 מתוך ₪480 · חסר ₪50` / `הכל שויך ✓`. */
export function computeSettlementProgress(
  nodes: readonly SettlementNode[],
  transfers: readonly Transfer[],
): SettlementProgress {
  const assignedMinor = sum(transfers.map((t) => t.amountMinor));
  const totalToMoveMinor = sum(
    nodes.filter((n) => n.amountMinor > 0).map((n) => n.amountMinor),
  );
  const reconciliation = computeReconciliation(nodes, transfers);

  return {
    assignedMinor,
    totalToMoveMinor,
    isComplete: reconciliation.every((row) => row.isReconciled),
  };
}

// ---------------------------------------------------------------------------
// The snapshot builder (03-data-model.md#permanent-tables)
// ---------------------------------------------------------------------------
//
// Built here, ahead of step 11's persistence, so that no finished game can
// ever exist without one (`finalize_game(game_id)` in 03-data-model.md is
// the eventual caller). Pure: `finishedAt` and `durationMinutes` are passed
// in rather than read from the wall clock, and `generateId` defaults to
// `crypto.randomUUID()` but accepts an override for deterministic tests.

export interface SnapshotPlayerInput {
  readonly id: string;
  readonly seatOrder: number;
  readonly userId: string | null;
  readonly guestName: string | null;
  readonly displayName: string;
  readonly buysCount: number;
  readonly cashPaidMinor: Minor;
  readonly chipsFinal: number;
  readonly joinedAt: string;
  readonly leftAt: string | null;
  readonly settledPosition: number | null;
}

export interface GameSnapshotInput {
  readonly gameId: string;
  readonly groupId: string | null;
  readonly name: string;
  readonly playedOn: string;
  readonly currency: string;
  readonly buyAmountMinor: Minor;
  readonly chipsPerBuy: number;
  readonly isPrivate: boolean;
  readonly locationName: string | null;
  readonly finishedAt: string;
  readonly durationMinutes: number;
  readonly players: readonly SnapshotPlayerInput[];
  readonly sharedCosts: readonly SettlementSharedCostInput[];
  readonly unaccountedMinor: Minor;
}

export interface GameSummarySnapshot {
  readonly gameId: string;
  readonly groupId: string | null;
  readonly name: string;
  readonly playedOn: string;
  readonly currency: string;
  readonly buyAmountMinor: Minor;
  readonly chipsPerBuy: number;
  readonly playerCount: number;
  readonly durationMinutes: number;
  readonly totalBuyInsMinor: Minor;
  readonly totalCashPotMinor: Minor;
  readonly unaccountedMinor: Minor;
  readonly sharedCostsMinor: Minor;
  readonly isPrivate: boolean;
  readonly locationName: string | null;
  readonly finishedAt: string;
}

export interface PlayerResultSnapshot {
  readonly id: string;
  readonly gameId: string;
  readonly groupId: string | null;
  readonly isPrivate: boolean;
  readonly userId: string | null;
  readonly guestName: string | null;
  readonly displayName: string;
  readonly buysCount: number;
  readonly owedMinor: Minor;
  readonly cashPaidMinor: Minor;
  readonly chipsFinal: number;
  readonly cashOutMinor: Minor;
  readonly netMinor: Minor;
  readonly sharedCostsShareMinor: Minor;
  readonly minutesPlayed: number;
  readonly settledPosition: number | null;
}

export interface TransferSummarySnapshot extends Transfer {
  readonly orderIndex: number;
}

export interface GameSnapshot {
  readonly summary: GameSummarySnapshot;
  readonly playerResults: readonly PlayerResultSnapshot[];
  readonly transfers: readonly TransferSummarySnapshot[];
}

export function buildGameSnapshot(
  input: GameSnapshotInput,
  generateId: () => string = () => crypto.randomUUID(),
  /**
   * The host's final, possibly hand-edited transfer list from the
   * settlement screen (05-settlement.md#edit-mode-1617). When given, this
   * is written verbatim — `computeTransfers` is not called, and its
   * sum-to-zero precondition is not enforced, because a host is allowed to
   * finish with a red banner after an explicit acknowledgement
   * (05-settlement.md#the-safeguard-20). Omit it to get the plain computed
   * optimum, e.g. for a preview before editing has started.
   */
  transfersOverride?: readonly Transfer[],
): GameSnapshot {
  const settlementPlayers: SettlementPlayerInput[] = input.players.map((p) => ({
    id: p.id,
    seatOrder: p.seatOrder,
    buysCount: p.buysCount,
    cashPaidMinor: p.cashPaidMinor,
    chipsFinal: p.chipsFinal,
  }));

  const balances = computeBalances(
    settlementPlayers,
    input.sharedCosts,
    input.buyAmountMinor,
    input.chipsPerBuy,
    input.unaccountedMinor,
  );
  const transfers = transfersOverride ?? computeTransfers(settlementNodes(balances));
  const balanceByPlayerId = new Map(balances.players.map((b) => [b.playerId, b]));

  const totalBuyInsMinor = sum(balances.players.map((b) => b.owedMinor));
  const totalCashPotMinor = sum(input.players.map((p) => p.cashPaidMinor));
  const sharedCostsMinor = sum(input.sharedCosts.map((c) => c.amountMinor));

  const summary: GameSummarySnapshot = {
    gameId: input.gameId,
    groupId: input.groupId,
    name: input.name,
    playedOn: input.playedOn,
    currency: input.currency,
    buyAmountMinor: input.buyAmountMinor,
    chipsPerBuy: input.chipsPerBuy,
    playerCount: input.players.length,
    durationMinutes: input.durationMinutes,
    totalBuyInsMinor,
    totalCashPotMinor,
    unaccountedMinor: input.unaccountedMinor,
    sharedCostsMinor,
    isPrivate: input.isPrivate,
    locationName: input.locationName,
    finishedAt: input.finishedAt,
  };

  const playerResults: PlayerResultSnapshot[] = input.players.map((p) => {
    const b = balanceByPlayerId.get(p.id)!;
    return {
      id: generateId(),
      gameId: input.gameId,
      groupId: input.groupId,
      isPrivate: input.isPrivate,
      userId: p.userId,
      guestName: p.guestName,
      displayName: p.displayName,
      buysCount: p.buysCount,
      owedMinor: b.owedMinor,
      cashPaidMinor: p.cashPaidMinor,
      chipsFinal: p.chipsFinal,
      cashOutMinor: b.cashOutMinor,
      netMinor: b.netMinor,
      sharedCostsShareMinor: b.sharedMinor,
      minutesPlayed: minutesBetween(p.joinedAt, p.leftAt ?? input.finishedAt),
      settledPosition: p.settledPosition,
    };
  });

  const transferSnapshots: TransferSummarySnapshot[] = transfers.map((t, orderIndex) => ({
    ...t,
    orderIndex,
  }));

  return { summary, playerResults, transfers: transferSnapshots };
}

function minutesBetween(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(0, Math.round(ms / 60000));
}
