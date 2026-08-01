import type { SupabaseClient } from '@supabase/supabase-js';
import type { GameExportInput } from '@core/gameExport';
import { minor, type Minor } from '@core/money';
import type { GameSummaryRow, PlayerResultRow, TransferSummaryRow } from '@core/statistics';
import { supabase } from './supabaseClient';

/**
 * Reads a single game's permanent-table record (03-data-model.md#permanent-tables) — the source
 * for a "results card" once the live tables are gone (purged, or a game this device never had
 * locally — a share link opened elsewhere, or this device's IndexedDB evicted, docs/build/
 * NOTES.md). Deliberately the mirror image of `src/data/statistics.ts`: same three tables, same
 * row shapes, but scoped to one `game_id` instead of one group/player, and it also fetches
 * `transfer_summaries` (statistics never needs the transfer list itself). RLS already does the
 * gating (`game_summaries_select`: group member, or a player_results row of the caller's own) —
 * a game this caller cannot see comes back as `null`, which reads identically to "purged
 * everywhere" from this module's point of view; the caller shows the same friendly dead end
 * either way (04-ux-spec.md#revoked-expired-or-purged).
 */

export interface PastGameResult {
  readonly summary: GameSummaryRow;
  readonly players: readonly PlayerResultRow[];
  readonly transfers: readonly TransferSummaryRow[];
}

interface GameSummaryRowDb {
  readonly game_id: string;
  readonly group_id: string | null;
  readonly name: string;
  readonly played_on: string;
  readonly currency: string;
  readonly buy_amount_minor: number;
  readonly chips_per_buy: number;
  readonly player_count: number;
  readonly duration_minutes: number;
  readonly total_buy_ins_minor: number;
  readonly total_cash_pot_minor: number;
  readonly unaccounted_minor: number;
  readonly shared_costs_minor: number;
  readonly is_private: boolean;
  readonly finished_at: string;
}

interface PlayerResultRowDb {
  readonly id: string;
  readonly game_id: string;
  readonly group_id: string | null;
  readonly is_private: boolean;
  readonly user_id: string | null;
  readonly guest_name: string | null;
  readonly display_name: string;
  readonly buys_count: number;
  readonly owed_minor: number;
  readonly cash_paid_minor: number;
  readonly chips_final: number;
  readonly cash_out_minor: number;
  readonly net_minor: number;
  readonly shared_costs_share_minor: number;
  readonly minutes_played: number;
  readonly settled_position: number | null;
}

interface TransferSummaryRowDb {
  readonly game_id: string;
  readonly from_name: string;
  readonly to_name: string;
  readonly from_user_id: string | null;
  readonly to_user_id: string | null;
  readonly amount_minor: number;
  readonly order_index: number;
}

function toMinor(n: number): Minor {
  return minor(n);
}

function toGameSummaryRow(row: GameSummaryRowDb): GameSummaryRow {
  return {
    gameId: row.game_id,
    groupId: row.group_id,
    name: row.name,
    playedOn: row.played_on,
    currency: row.currency,
    buyAmountMinor: toMinor(row.buy_amount_minor),
    chipsPerBuy: row.chips_per_buy,
    playerCount: row.player_count,
    durationMinutes: row.duration_minutes,
    totalBuyInsMinor: toMinor(row.total_buy_ins_minor),
    totalCashPotMinor: toMinor(row.total_cash_pot_minor),
    unaccountedMinor: toMinor(row.unaccounted_minor),
    sharedCostsMinor: toMinor(row.shared_costs_minor),
    isPrivate: row.is_private,
    finishedAt: row.finished_at,
  };
}

function toPlayerResultRow(row: PlayerResultRowDb): PlayerResultRow {
  return {
    id: row.id,
    gameId: row.game_id,
    groupId: row.group_id,
    isPrivate: row.is_private,
    userId: row.user_id,
    guestName: row.guest_name,
    displayName: row.display_name,
    buysCount: row.buys_count,
    owedMinor: toMinor(row.owed_minor),
    cashPaidMinor: toMinor(row.cash_paid_minor),
    chipsFinal: row.chips_final,
    cashOutMinor: toMinor(row.cash_out_minor),
    netMinor: toMinor(row.net_minor),
    sharedCostsShareMinor: toMinor(row.shared_costs_share_minor),
    minutesPlayed: row.minutes_played,
    settledPosition: row.settled_position,
  };
}

function toTransferSummaryRow(row: TransferSummaryRowDb): TransferSummaryRow {
  return {
    gameId: row.game_id,
    fromName: row.from_name,
    toName: row.to_name,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    amountMinor: toMinor(row.amount_minor),
    orderIndex: row.order_index,
  };
}

/** `null` when the game has no snapshot yet, was purged, or RLS hides it from this caller. */
export async function fetchPastGameResult(
  gameId: string,
  client: SupabaseClient | null = supabase,
): Promise<PastGameResult | null> {
  if (!client) return null;

  const { data: summaryRow, error: summaryError } = await client
    .from('game_summaries')
    .select(
      'game_id, group_id, name, played_on, currency, buy_amount_minor, chips_per_buy, ' +
        'player_count, duration_minutes, total_buy_ins_minor, total_cash_pot_minor, ' +
        'unaccounted_minor, shared_costs_minor, is_private, finished_at',
    )
    .eq('game_id', gameId)
    .maybeSingle()
    .returns<GameSummaryRowDb | null>();
  if (summaryError) throw summaryError;
  if (!summaryRow) return null;

  const { data: playerRows, error: playersError } = await client
    .from('player_results')
    .select(
      'id, game_id, group_id, is_private, user_id, guest_name, display_name, buys_count, ' +
        'owed_minor, cash_paid_minor, chips_final, cash_out_minor, net_minor, ' +
        'shared_costs_share_minor, minutes_played, settled_position',
    )
    .eq('game_id', gameId)
    .returns<PlayerResultRowDb[]>();
  if (playersError) throw playersError;

  const { data: transferRows, error: transfersError } = await client
    .from('transfer_summaries')
    .select('game_id, from_name, to_name, from_user_id, to_user_id, amount_minor, order_index')
    .eq('game_id', gameId)
    .returns<TransferSummaryRowDb[]>();
  if (transfersError) throw transfersError;

  return {
    summary: toGameSummaryRow(summaryRow),
    players: (playerRows ?? []).map(toPlayerResultRow),
    transfers: [...(transferRows ?? [])].sort((a, b) => a.order_index - b.order_index).map(toTransferSummaryRow),
  };
}

/**
 * Every game the signed-in caller has a permanent result in, across every group and every
 * group-less game they hosted or played in — "export all history"
 * (08-gaps-and-open-questions.md#a16-data-export). Same scoping `getPersonalStatisticsSource`
 * (statistics.ts) already uses for "הכל" (every group): `player_results.user_id = userId`, no
 * group filter.
 */
export async function fetchAllHistoryForUser(
  userId: string,
  client: SupabaseClient | null = supabase,
): Promise<readonly PastGameResult[]> {
  if (!client) return [];

  const { data: playerRows, error: playersError } = await client
    .from('player_results')
    .select(
      'id, game_id, group_id, is_private, user_id, guest_name, display_name, buys_count, ' +
        'owed_minor, cash_paid_minor, chips_final, cash_out_minor, net_minor, ' +
        'shared_costs_share_minor, minutes_played, settled_position',
    )
    .eq('user_id', userId)
    .returns<PlayerResultRowDb[]>();
  if (playersError) throw playersError;

  const ownResults = (playerRows ?? []).map(toPlayerResultRow);
  const gameIds = [...new Set(ownResults.map((r) => r.gameId))];
  if (gameIds.length === 0) return [];

  const { data: summaryRows, error: summaryError } = await client
    .from('game_summaries')
    .select(
      'game_id, group_id, name, played_on, currency, buy_amount_minor, chips_per_buy, ' +
        'player_count, duration_minutes, total_buy_ins_minor, total_cash_pot_minor, ' +
        'unaccounted_minor, shared_costs_minor, is_private, finished_at',
    )
    .in('game_id', gameIds)
    .returns<GameSummaryRowDb[]>();
  if (summaryError) throw summaryError;

  const { data: allPlayerRows, error: allPlayersError } = await client
    .from('player_results')
    .select(
      'id, game_id, group_id, is_private, user_id, guest_name, display_name, buys_count, ' +
        'owed_minor, cash_paid_minor, chips_final, cash_out_minor, net_minor, ' +
        'shared_costs_share_minor, minutes_played, settled_position',
    )
    .in('game_id', gameIds)
    .returns<PlayerResultRowDb[]>();
  if (allPlayersError) throw allPlayersError;

  const { data: transferRows, error: transfersError } = await client
    .from('transfer_summaries')
    .select('game_id, from_name, to_name, from_user_id, to_user_id, amount_minor, order_index')
    .in('game_id', gameIds)
    .returns<TransferSummaryRowDb[]>();
  if (transfersError) throw transfersError;

  const playersByGame = new Map<string, PlayerResultRow[]>();
  for (const row of allPlayerRows ?? []) {
    const list = playersByGame.get(row.game_id) ?? [];
    list.push(toPlayerResultRow(row));
    playersByGame.set(row.game_id, list);
  }
  const transfersByGame = new Map<string, TransferSummaryRow[]>();
  for (const row of [...(transferRows ?? [])].sort((a, b) => a.order_index - b.order_index)) {
    const list = transfersByGame.get(row.game_id) ?? [];
    list.push(toTransferSummaryRow(row));
    transfersByGame.set(row.game_id, list);
  }

  const results: PastGameResult[] = [];
  for (const row of summaryRows ?? []) {
    results.push({
      summary: toGameSummaryRow(row),
      players: playersByGame.get(row.game_id) ?? [],
      transfers: transfersByGame.get(row.game_id) ?? [],
    });
  }
  return results.sort((a, b) => (a.summary.finishedAt < b.summary.finishedAt ? 1 : -1));
}

/**
 * `PastGameResult` (permanent-table rows, names already resolved) → `core/gameExport.ts`'s input
 * shape. Every permanent-table row is by definition a finished game's, so `status` is always
 * `'finished'` here — a still-active local game builds its own `GameExportInput` directly from
 * live state instead (`core/settlement.ts` values are already minor-unit and name-resolved there
 * too, just via a different, still-live source).
 */
export function pastGameResultToExportInput(result: PastGameResult): GameExportInput {
  return {
    gameId: result.summary.gameId,
    name: result.summary.name,
    status: 'finished',
    playedOn: result.summary.playedOn,
    currency: result.summary.currency,
    finishedAt: result.summary.finishedAt,
    players: result.players.map((p) => ({
      displayName: p.displayName,
      buysCount: p.buysCount,
      buyInsMinor: p.owedMinor,
      cashPaidMinor: p.cashPaidMinor,
      chipsFinal: p.chipsFinal,
      netMinor: p.netMinor,
      sharedCostsShareMinor: p.sharedCostsShareMinor,
    })),
    transfers: result.transfers.map((t) => ({
      fromName: t.fromName,
      toName: t.toName,
      amountMinor: t.amountMinor,
    })),
  };
}
