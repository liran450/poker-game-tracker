import type { SupabaseClient } from '@supabase/supabase-js';
import { minor, type Minor } from '@core/money';
import type {
  GameSummaryRow,
  PersonalResultEntry,
  PlayerResultRow,
  StatsVisibility,
  TransferSummaryRow,
} from '@core/statistics';
import { getProfilesPublic } from './profiles';
import { supabase } from './supabaseClient';

/**
 * The read side of statistics (06-statistics.md, docs/build/PLAN.md step 15) — fetches rows from
 * the two permanent tables and the group's already-`is_private`-filtered view
 * (`group_player_results`, step 11), maps them to `core/statistics.ts`'s shapes, and hands them
 * over. This module never reads `games`/`game_players`/`transfers` (the live tables) — only
 * `player_results`/`game_summaries`/`transfer_summaries`/`group_player_results`, which is what
 * makes "statistics read only from the permanent tables" true of the whole app, not just of
 * `core/statistics.ts` in isolation.
 */

function requireClient(client: SupabaseClient | null = supabase): SupabaseClient {
  if (!client) {
    throw new Error(
      'statistics: no Supabase client configured (VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY missing)',
    );
  }
  return client;
}

const PLAYER_RESULT_COLUMNS =
  'id, game_id, group_id, is_private, user_id, guest_name, display_name, buys_count, ' +
  'owed_minor, cash_paid_minor, chips_final, cash_out_minor, net_minor, ' +
  'shared_costs_share_minor, minutes_played, settled_position';

const GAME_SUMMARY_COLUMNS =
  'game_id, group_id, name, played_on, currency, buy_amount_minor, chips_per_buy, ' +
  'player_count, duration_minutes, total_buy_ins_minor, total_cash_pot_minor, ' +
  'unaccounted_minor, shared_costs_minor, is_private, finished_at';

const TRANSFER_SUMMARY_COLUMNS =
  'game_id, from_name, to_name, from_user_id, to_user_id, amount_minor, order_index';

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

async function fetchGameSummariesByIds(
  gameIds: readonly string[],
  client: SupabaseClient,
): Promise<Map<string, GameSummaryRow>> {
  if (gameIds.length === 0) return new Map();
  const { data, error } = await client
    .from('game_summaries')
    .select(GAME_SUMMARY_COLUMNS)
    .in('game_id', gameIds)
    .returns<GameSummaryRowDb[]>();
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.game_id, toGameSummaryRow(row)]));
}

/**
 * Personal statistics source (06-statistics.md#personal-statistics-12): every one of the caller's
 * own `player_results` rows, joined with their games. `player_results` carries no `is_private`
 * exclusion for personal reads — a private game still counts toward the player's own figures
 * (06-statistics.md#scoping). Pass `groupId` for "שלי" (personal, within a group); omit it (or
 * pass `null`) for "הכל" (personal, across every group the caller has played in).
 */
export async function getPersonalStatisticsSource(
  userId: string,
  groupId: string | null = null,
  client: SupabaseClient = requireClient(),
): Promise<PersonalResultEntry[]> {
  const base = client.from('player_results').select(PLAYER_RESULT_COLUMNS).eq('user_id', userId);
  const { data, error } = await (groupId ? base.eq('group_id', groupId) : base).returns<
    PlayerResultRowDb[]
  >();
  if (error) throw error;
  const results = (data ?? []).map(toPlayerResultRow);
  if (results.length === 0) return [];

  const gamesById = await fetchGameSummariesByIds([...new Set(results.map((r) => r.gameId))], client);

  const entries: PersonalResultEntry[] = [];
  for (const result of results) {
    const game = gamesById.get(result.gameId);
    if (game) entries.push({ result, game });
  }
  return entries;
}

export interface GroupStatisticsSource {
  readonly results: readonly PlayerResultRow[];
  readonly games: readonly GameSummaryRow[];
  readonly transfers: readonly TransferSummaryRow[];
  readonly displayNames: ReadonlyMap<string, string>;
  readonly statsVisibility: ReadonlyMap<string, StatsVisibility>;
}

/**
 * Group statistics source (06-statistics.md#group-level-statistics-11 / #fun-statistics):
 * `group_player_results` (step 11) is already `is_private`-filtered, and `game_summaries` here
 * gets the same `is_private = false` filter directly — "A private game is excluded from every
 * group-scoped figure and every group-visible list" applies identically to both.
 */
export async function getGroupStatisticsSource(
  groupId: string,
  client: SupabaseClient = requireClient(),
): Promise<GroupStatisticsSource> {
  const { data: resultRows, error: resultError } = await client
    .from('group_player_results')
    .select(PLAYER_RESULT_COLUMNS)
    .eq('group_id', groupId)
    .returns<PlayerResultRowDb[]>();
  if (resultError) throw resultError;
  const results = (resultRows ?? []).map(toPlayerResultRow);

  const { data: gameRows, error: gameError } = await client
    .from('game_summaries')
    .select(GAME_SUMMARY_COLUMNS)
    .eq('group_id', groupId)
    .eq('is_private', false)
    .returns<GameSummaryRowDb[]>();
  if (gameError) throw gameError;
  const games = (gameRows ?? []).map(toGameSummaryRow);

  const gameIds = games.map((g) => g.gameId);
  let transfers: TransferSummaryRow[] = [];
  if (gameIds.length > 0) {
    const { data: transferRows, error: transferError } = await client
      .from('transfer_summaries')
      .select(TRANSFER_SUMMARY_COLUMNS)
      .in('game_id', gameIds)
      .returns<TransferSummaryRowDb[]>();
    if (transferError) throw transferError;
    transfers = (transferRows ?? []).map(toTransferSummaryRow);
  }

  const userIds = [...new Set(results.map((r) => r.userId).filter((id): id is string => id !== null))];
  const profiles = userIds.length > 0 ? await getProfilesPublic(userIds, client) : [];
  const displayNames = new Map(profiles.map((p) => [p.id, p.displayName]));
  const statsVisibility = new Map(profiles.map((p) => [p.id, p.statsVisibility]));

  return { results, games, transfers, displayNames, statsVisibility };
}
