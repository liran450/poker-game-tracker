import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { fetchAllHistoryForUser, fetchPastGameResult } from './gameHistory';
import { FakePostgrestClient } from './testSupport/fakePostgrestClient';

function client(fake: FakePostgrestClient): SupabaseClient {
  return fake as unknown as SupabaseClient;
}

function seedGame(fake: FakePostgrestClient, gameId: string, overrides: Record<string, unknown> = {}): void {
  fake.tables.set('game_summaries', [
    ...(fake.rows('game_summaries') ?? []),
    {
      game_id: gameId,
      group_id: null,
      name: 'פוקר יום חמישי',
      played_on: '2026-08-01',
      currency: 'ILS',
      buy_amount_minor: 5000,
      chips_per_buy: 100,
      player_count: 2,
      duration_minutes: 180,
      total_buy_ins_minor: 15000,
      total_cash_pot_minor: 15000,
      unaccounted_minor: 0,
      shared_costs_minor: 0,
      is_private: false,
      finished_at: '2026-08-02T02:00:00.000Z',
      ...overrides,
    },
  ]);
}

describe('fetchPastGameResult', () => {
  it('returns null when the game has no snapshot (never finalized, or RLS hides it)', async () => {
    const fake = new FakePostgrestClient();
    const result = await fetchPastGameResult('missing-game', client(fake));
    expect(result).toBeNull();
  });

  it('returns null with no client configured', async () => {
    const result = await fetchPastGameResult('game-1', null);
    expect(result).toBeNull();
  });

  it('assembles the summary, players and transfers for a real game, transfers sorted by order_index', async () => {
    const fake = new FakePostgrestClient();
    seedGame(fake, 'game-1');
    fake.seed('player_results', [
      {
        id: 'pr-1',
        game_id: 'game-1',
        group_id: null,
        is_private: false,
        user_id: null,
        guest_name: 'מור',
        display_name: 'מור',
        buys_count: 2,
        owed_minor: 10000,
        cash_paid_minor: 10000,
        chips_final: 150,
        cash_out_minor: 7500,
        net_minor: -2500,
        shared_costs_share_minor: 0,
        minutes_played: 180,
        settled_position: 1,
      },
      {
        id: 'pr-2',
        game_id: 'game-1',
        group_id: null,
        is_private: false,
        user_id: null,
        guest_name: 'רני',
        display_name: 'רני',
        buys_count: 1,
        owed_minor: 5000,
        cash_paid_minor: 5000,
        chips_final: 750,
        cash_out_minor: 7500,
        net_minor: 2500,
        shared_costs_share_minor: 0,
        minutes_played: 180,
        settled_position: 2,
      },
    ]);
    fake.seed('transfer_summaries', [
      {
        game_id: 'game-1',
        from_name: 'מור',
        to_name: 'רני',
        from_user_id: null,
        to_user_id: null,
        amount_minor: 2500,
        order_index: 1,
      },
      {
        game_id: 'game-1',
        from_name: 'קופה',
        to_name: 'רני',
        from_user_id: null,
        to_user_id: null,
        amount_minor: 500,
        order_index: 0,
      },
    ]);

    const result = await fetchPastGameResult('game-1', client(fake));

    expect(result).not.toBeNull();
    expect(result!.summary.name).toBe('פוקר יום חמישי');
    expect(result!.summary.totalBuyInsMinor).toBe(15000);
    expect(result!.players).toHaveLength(2);
    expect(result!.players[0]!.displayName).toBe('מור');
    expect(result!.transfers.map((t) => t.orderIndex)).toEqual([0, 1]);
    expect(result!.transfers[0]!.fromName).toBe('קופה');
  });
});

describe('fetchAllHistoryForUser', () => {
  it('returns an empty list with no client configured or no results', async () => {
    expect(await fetchAllHistoryForUser('user-1', null)).toEqual([]);

    const fake = new FakePostgrestClient();
    expect(await fetchAllHistoryForUser('user-1', client(fake))).toEqual([]);
  });

  it('bundles every game the user has a player_results row in, newest first', async () => {
    const fake = new FakePostgrestClient();
    seedGame(fake, 'game-old', { finished_at: '2026-01-01T00:00:00.000Z' });
    seedGame(fake, 'game-new', { finished_at: '2026-08-01T00:00:00.000Z' });
    fake.seed('player_results', [
      {
        id: 'pr-old',
        game_id: 'game-old',
        group_id: null,
        is_private: false,
        user_id: 'user-1',
        guest_name: null,
        display_name: 'מור',
        buys_count: 1,
        owed_minor: 5000,
        cash_paid_minor: 5000,
        chips_final: 100,
        cash_out_minor: 5000,
        net_minor: 0,
        shared_costs_share_minor: 0,
        minutes_played: 60,
        settled_position: 1,
      },
      {
        id: 'pr-new',
        game_id: 'game-new',
        group_id: null,
        is_private: false,
        user_id: 'user-1',
        guest_name: null,
        display_name: 'מור',
        buys_count: 1,
        owed_minor: 5000,
        cash_paid_minor: 5000,
        chips_final: 100,
        cash_out_minor: 5000,
        net_minor: 0,
        shared_costs_share_minor: 0,
        minutes_played: 60,
        settled_position: 1,
      },
      {
        id: 'pr-other-user',
        game_id: 'game-new',
        group_id: null,
        is_private: false,
        user_id: 'someone-else',
        guest_name: null,
        display_name: 'רני',
        buys_count: 1,
        owed_minor: 5000,
        cash_paid_minor: 5000,
        chips_final: 100,
        cash_out_minor: 5000,
        net_minor: 0,
        shared_costs_share_minor: 0,
        minutes_played: 60,
        settled_position: 2,
      },
    ]);
    fake.seed('transfer_summaries', []);

    const results = await fetchAllHistoryForUser('user-1', client(fake));

    expect(results.map((r) => r.summary.gameId)).toEqual(['game-new', 'game-old']);
    // Every player in the game (including the other user) comes along, not just the caller's own row.
    expect(results[0]!.players.map((p) => p.displayName).sort()).toEqual(['מור', 'רני']);
  });
});
