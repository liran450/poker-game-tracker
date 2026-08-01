import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { minor } from '@core/money';
import { getGroupStatisticsSource, getPersonalStatisticsSource } from './statistics';
import { FakePostgrestClient } from './testSupport/fakePostgrestClient';

function client(fake: FakePostgrestClient): SupabaseClient {
  return fake as unknown as SupabaseClient;
}

function seedGameSummary(fake: FakePostgrestClient, overrides: Record<string, unknown> = {}): void {
  const existing = fake.rows('game_summaries');
  fake.seed('game_summaries', [
    ...existing,
    {
      game_id: 'g1',
      group_id: null,
      name: 'Thursday',
      played_on: '2026-01-01',
      currency: 'ILS',
      buy_amount_minor: 10000,
      chips_per_buy: 100,
      player_count: 4,
      duration_minutes: 180,
      total_buy_ins_minor: 40000,
      total_cash_pot_minor: 20000,
      unaccounted_minor: 0,
      shared_costs_minor: 0,
      is_private: false,
      finished_at: '2026-01-01T22:00:00Z',
      ...overrides,
    },
  ]);
}

function seedPlayerResult(fake: FakePostgrestClient, overrides: Record<string, unknown> = {}): void {
  const existing = fake.rows('player_results');
  fake.seed('player_results', [
    ...existing,
    {
      id: `r-${existing.length + 1}`,
      game_id: 'g1',
      group_id: null,
      is_private: false,
      user_id: 'u1',
      guest_name: null,
      display_name: 'Roi',
      buys_count: 2,
      owed_minor: 20000,
      cash_paid_minor: 0,
      chips_final: 200,
      cash_out_minor: 22000,
      net_minor: 2000,
      shared_costs_share_minor: 0,
      minutes_played: 180,
      settled_position: 1,
      ...overrides,
    },
  ]);
}

describe('getPersonalStatisticsSource', () => {
  it('joins the caller\'s player_results to their games', async () => {
    const fake = new FakePostgrestClient();
    seedGameSummary(fake);
    seedPlayerResult(fake, { user_id: 'u1' });
    seedPlayerResult(fake, { user_id: 'u2' }); // a different user's row for the same game — excluded

    const entries = await getPersonalStatisticsSource('u1', null, client(fake));
    expect(entries).toHaveLength(1);
    expect(entries[0]!.result.userId).toBe('u1');
    expect(entries[0]!.result.netMinor).toBe(minor(2000));
    expect(entries[0]!.game.name).toBe('Thursday');
    expect(entries[0]!.game.totalCashPotMinor).toBe(minor(20000));
  });

  it('filters by group when a groupId is given, not when it is omitted', async () => {
    const fake = new FakePostgrestClient();
    seedGameSummary(fake, { game_id: 'g1', group_id: 'group-a' });
    seedGameSummary(fake, { game_id: 'g2', group_id: 'group-b' });
    seedPlayerResult(fake, { id: 'r1', game_id: 'g1', group_id: 'group-a', user_id: 'u1' });
    seedPlayerResult(fake, { id: 'r2', game_id: 'g2', group_id: 'group-b', user_id: 'u1' });

    const scoped = await getPersonalStatisticsSource('u1', 'group-a', client(fake));
    expect(scoped).toHaveLength(1);
    expect(scoped[0]!.result.gameId).toBe('g1');

    const all = await getPersonalStatisticsSource('u1', null, client(fake));
    expect(all).toHaveLength(2);
  });

  it('returns an empty array when the caller has no results at all', async () => {
    const fake = new FakePostgrestClient();
    expect(await getPersonalStatisticsSource('nobody', null, client(fake))).toEqual([]);
  });

  it('drops a result whose game_summaries row is missing rather than throwing', async () => {
    const fake = new FakePostgrestClient();
    seedPlayerResult(fake, { user_id: 'u1', game_id: 'ghost-game' });
    expect(await getPersonalStatisticsSource('u1', null, client(fake))).toEqual([]);
  });
});

describe('getGroupStatisticsSource', () => {
  it('reads from group_player_results and is_private-filtered game_summaries, and resolves names', async () => {
    const fake = new FakePostgrestClient();
    fake.seed('group_player_results', [
      {
        id: 'r1',
        game_id: 'g1',
        group_id: 'group-a',
        is_private: false,
        user_id: 'u1',
        guest_name: null,
        display_name: 'Roi',
        buys_count: 2,
        owed_minor: 20000,
        cash_paid_minor: 0,
        chips_final: 200,
        cash_out_minor: 22000,
        net_minor: 2000,
        shared_costs_share_minor: 0,
        minutes_played: 180,
        settled_position: 1,
      },
    ]);
    seedGameSummary(fake, { game_id: 'g1', group_id: 'group-a' });
    fake.seed('transfer_summaries', [
      {
        game_id: 'g1',
        from_name: 'Roi',
        to_name: 'קופה',
        from_user_id: 'u1',
        to_user_id: null,
        amount_minor: 500,
        order_index: 0,
      },
    ]);
    fake.seed('profiles_public', [
      { id: 'u1', username: 'roi', display_name: 'Roi Cohen', stats_visibility: 'group' },
    ]);

    const source = await getGroupStatisticsSource('group-a', client(fake));
    expect(source.results).toHaveLength(1);
    expect(source.games).toHaveLength(1);
    expect(source.transfers).toHaveLength(1);
    expect(source.displayNames.get('u1')).toBe('Roi Cohen');
    expect(source.statsVisibility.get('u1')).toBe('group');
  });

  it('fetches no transfers when the group has no non-private games', async () => {
    const fake = new FakePostgrestClient();
    const source = await getGroupStatisticsSource('empty-group', client(fake));
    expect(source.results).toEqual([]);
    expect(source.games).toEqual([]);
    expect(source.transfers).toEqual([]);
  });

  it('ignores guest rows (no user_id) when resolving profiles', async () => {
    const fake = new FakePostgrestClient();
    fake.seed('group_player_results', [
      {
        id: 'r1',
        game_id: 'g1',
        group_id: 'group-a',
        is_private: false,
        user_id: null,
        guest_name: 'Guest',
        display_name: 'Guest',
        buys_count: 1,
        owed_minor: 10000,
        cash_paid_minor: 0,
        chips_final: 100,
        cash_out_minor: 10000,
        net_minor: 0,
        shared_costs_share_minor: 0,
        minutes_played: 180,
        settled_position: null,
      },
    ]);
    seedGameSummary(fake, { game_id: 'g1', group_id: 'group-a' });

    const source = await getGroupStatisticsSource('group-a', client(fake));
    expect(source.displayNames.size).toBe(0);
    expect(fake.rows('profiles_public')).toEqual([]); // never queried
  });
});
