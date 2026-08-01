import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '@core/events';
import { HOUSE_ID, POT_ID } from '@core/settlement';
import { SupabaseSyncTransport } from './supabaseSyncTransport';
import { FakePostgrestClient } from './testSupport/fakePostgrestClient';

function client(fake: FakePostgrestClient): SupabaseClient {
  return fake as unknown as SupabaseClient;
}

let seq = 0;
function ts(offsetSeconds: number): string {
  return new Date(Date.UTC(2025, 0, 1) + offsetSeconds * 1000).toISOString();
}

function buyIn(overrides: Partial<GameEvent> = {}): GameEvent {
  seq += 1;
  return {
    clientEventId: overrides.clientEventId ?? `evt-${seq}`,
    gameId: overrides.gameId ?? 'game-1',
    playerId: overrides.playerId ?? 'player-1',
    actorId: overrides.actorId ?? 'host-1',
    clientCreatedAt: overrides.clientCreatedAt ?? ts(seq),
    undoneBy: overrides.undoneBy ?? null,
    type: 'buy_in_added',
    payload: {},
  };
}

describe('SupabaseSyncTransport#push', () => {
  it('upserts plain events into game_events, mapped to snake_case', async () => {
    const fake = new FakePostgrestClient();
    const transport = new SupabaseSyncTransport(client(fake));
    const event = buyIn();

    const result = await transport.push([event]);

    expect(result.acceptedEventIds).toEqual([event.clientEventId]);
    expect(fake.rows('game_events')).toEqual([
      {
        game_id: event.gameId,
        player_id: event.playerId,
        actor_id: event.actorId,
        type: 'buy_in_added',
        payload: {},
        client_event_id: event.clientEventId,
        client_created_at: event.clientCreatedAt,
      },
    ]);
  });

  it('stamps games.host_last_synced_at for every distinct game in the batch', async () => {
    const fake = new FakePostgrestClient();
    fake.seed('games', [{ id: 'game-1' }, { id: 'game-2' }]);
    const transport = new SupabaseSyncTransport(client(fake));

    await transport.push([buyIn({ gameId: 'game-1' }), buyIn({ gameId: 'game-2' })]);

    const games = fake.rows('games');
    expect(games.find((g) => g.id === 'game-1')?.host_last_synced_at).toEqual(expect.any(String));
    expect(games.find((g) => g.id === 'game-2')?.host_last_synced_at).toEqual(expect.any(String));
  });

  it('a shared_cost_added event also writes shared_costs and shared_cost_shares directly', async () => {
    const fake = new FakePostgrestClient();
    const transport = new SupabaseSyncTransport(client(fake));

    const event: GameEvent = {
      clientEventId: 'evt-cost-1',
      gameId: 'game-1',
      playerId: null,
      actorId: 'host-1',
      clientCreatedAt: ts(1),
      undoneBy: null,
      type: 'shared_cost_added',
      payload: {
        costId: 'cost-1',
        label: 'Pizza',
        amountMinor: 3000,
        paidByPlayerId: 'player-1',
        splitMode: 'equal',
        shares: { 'player-1': 1000, 'player-2': 1000, 'player-3': 1000 },
      },
    };

    await transport.push([event]);

    expect(fake.rows('shared_costs')).toEqual([
      {
        id: 'cost-1',
        game_id: 'game-1',
        label: 'Pizza',
        amount_minor: 3000,
        paid_by_player_id: 'player-1',
        split_mode: 'equal',
      },
    ]);
    expect(fake.rows('shared_cost_shares')).toHaveLength(3);
    expect(fake.rows('shared_cost_shares')).toContainEqual({
      cost_id: 'cost-1',
      game_player_id: 'player-2',
      amount_minor: 1000,
    });
  });

  it('a shared_cost_updated event replaces the shares rather than merging with the old set', async () => {
    const fake = new FakePostgrestClient();
    fake.seed('shared_costs', [
      {
        id: 'cost-1',
        game_id: 'game-1',
        label: 'Pizza',
        amount_minor: 3000,
        paid_by_player_id: 'player-1',
        split_mode: 'equal',
      },
    ]);
    fake.seed('shared_cost_shares', [
      { cost_id: 'cost-1', game_player_id: 'player-1', amount_minor: 1500 },
      { cost_id: 'cost-1', game_player_id: 'player-2', amount_minor: 1500 },
    ]);
    const transport = new SupabaseSyncTransport(client(fake));

    const event: GameEvent = {
      clientEventId: 'evt-cost-2',
      gameId: 'game-1',
      playerId: null,
      actorId: 'host-1',
      clientCreatedAt: ts(2),
      undoneBy: null,
      type: 'shared_cost_updated',
      payload: {
        costId: 'cost-1',
        label: 'Pizza + drinks',
        amountMinor: 4500,
        paidByPlayerId: 'player-1',
        splitMode: 'equal',
        // Now split three ways, including a player who had no share before.
        shares: { 'player-1': 1500, 'player-2': 1500, 'player-3': 1500 },
      },
    };

    await transport.push([event]);

    expect(fake.rows('shared_costs')[0]?.label).toBe('Pizza + drinks');
    expect(fake.rows('shared_cost_shares')).toHaveLength(3);
    expect(fake.rows('shared_cost_shares')).toContainEqual({
      cost_id: 'cost-1',
      game_player_id: 'player-3',
      amount_minor: 1500,
    });
  });

  it('a shared_cost_removed event deletes the shared_costs row', async () => {
    const fake = new FakePostgrestClient();
    fake.seed('shared_costs', [{ id: 'cost-1', game_id: 'game-1' }]);
    const transport = new SupabaseSyncTransport(client(fake));

    const event: GameEvent = {
      clientEventId: 'evt-cost-3',
      gameId: 'game-1',
      playerId: null,
      actorId: 'host-1',
      clientCreatedAt: ts(3),
      undoneBy: null,
      type: 'shared_cost_removed',
      payload: { costId: 'cost-1' },
    };

    await transport.push([event]);

    expect(fake.rows('shared_costs')).toEqual([]);
  });

  it('a new transfer_edited event resolves POT_ID/HOUSE_ID to the party enum and assigns the next order_index', async () => {
    const fake = new FakePostgrestClient();
    fake.seed('transfers', [{ id: 'existing-transfer', game_id: 'game-1', order_index: 0 }]);
    const transport = new SupabaseSyncTransport(client(fake));

    const potToPlayer: GameEvent = {
      clientEventId: 'evt-transfer-1',
      gameId: 'game-1',
      playerId: null,
      actorId: 'host-1',
      clientCreatedAt: ts(1),
      undoneBy: null,
      type: 'transfer_edited',
      payload: { transferId: 'new-transfer', fromPlayerId: POT_ID, toPlayerId: 'player-1', amountMinor: 5000 },
    };

    await transport.push([potToPlayer]);

    const created = fake.rows('transfers').find((t) => t.id === 'new-transfer');
    expect(created).toMatchObject({
      from_party: 'pot',
      from_player_id: null,
      to_party: 'player',
      to_player_id: 'player-1',
      amount_minor: 5000,
      order_index: 1,
    });
  });

  it('editing an existing transfer preserves its order_index', async () => {
    const fake = new FakePostgrestClient();
    fake.seed('transfers', [
      {
        id: 'transfer-1',
        game_id: 'game-1',
        from_party: 'player',
        from_player_id: 'player-1',
        to_party: 'house',
        to_player_id: null,
        amount_minor: 100,
        order_index: 3,
      },
    ]);
    const transport = new SupabaseSyncTransport(client(fake));

    const edit: GameEvent = {
      clientEventId: 'evt-transfer-2',
      gameId: 'game-1',
      playerId: null,
      actorId: 'host-1',
      clientCreatedAt: ts(1),
      undoneBy: null,
      type: 'transfer_edited',
      payload: { transferId: 'transfer-1', fromPlayerId: 'player-1', toPlayerId: HOUSE_ID, amountMinor: 200 },
    };

    await transport.push([edit]);

    const updated = fake.rows('transfers').find((t) => t.id === 'transfer-1');
    expect(updated).toMatchObject({ amount_minor: 200, order_index: 3 });
  });

  it('an event with undoneBy set calls mark_event_undone instead of inserting a row', async () => {
    const fake = new FakePostgrestClient();
    let rpcArgs: Record<string, unknown> | undefined;
    fake.onRpc('mark_event_undone', (args) => {
      rpcArgs = args;
      return { error: null };
    });
    const transport = new SupabaseSyncTransport(client(fake));

    const undoMarker = buyIn({ clientEventId: 'original-evt', undoneBy: 'inverse-evt' });
    const result = await transport.push([undoMarker]);

    expect(rpcArgs).toEqual({
      p_original_client_event_id: 'original-evt',
      p_inverse_client_event_id: 'inverse-evt',
    });
    expect(fake.rows('game_events')).toEqual([]);
    expect(result.acceptedEventIds).toEqual(['original-evt']);
  });

  it('propagates a thrown error from the underlying upsert', async () => {
    const fake = new FakePostgrestClient();
    fake.failNextOperationOn('game_events', 'simulated insert failure');
    const transport = new SupabaseSyncTransport(client(fake));

    await expect(transport.push([buyIn()])).rejects.toThrow('simulated insert failure');
  });

  it('a game_ended event updates games.status/ended_at and calls finalize_game so the permanent snapshot exists', async () => {
    const fake = new FakePostgrestClient();
    fake.seed('games', [{ id: 'game-1' }]);
    let finalizeArgs: Record<string, unknown> | undefined;
    fake.onRpc('finalize_game', (args) => {
      finalizeArgs = args;
      return { error: null };
    });
    const transport = new SupabaseSyncTransport(client(fake));

    const event: GameEvent = {
      clientEventId: 'evt-end',
      gameId: 'game-1',
      playerId: null,
      actorId: 'host-1',
      clientCreatedAt: ts(1),
      undoneBy: null,
      type: 'game_ended',
      payload: {},
    };
    await transport.push([event]);

    const game = fake.rows('games').find((g) => g.id === 'game-1')!;
    expect(game.status).toBe('finished');
    expect(game.ended_at).toBe(event.clientCreatedAt);
    expect(finalizeArgs).toEqual({ p_game_id: 'game-1' });
  });

  it('propagates a thrown error from finalize_game', async () => {
    const fake = new FakePostgrestClient();
    fake.seed('games', [{ id: 'game-1' }]);
    fake.onRpc('finalize_game', () => ({ error: new Error('not available') }));
    const transport = new SupabaseSyncTransport(client(fake));

    const event: GameEvent = {
      clientEventId: 'evt-end',
      gameId: 'game-1',
      playerId: null,
      actorId: 'host-1',
      clientCreatedAt: ts(1),
      undoneBy: null,
      type: 'game_ended',
      payload: {},
    };
    await expect(transport.push([event])).rejects.toThrow('not available');
  });
});

describe('SupabaseSyncTransport#pull', () => {
  it('maps rows back into GameEvents and returns the max row id as the cursor', async () => {
    const fake = new FakePostgrestClient();
    fake.seed('game_events', [
      {
        id: 1,
        game_id: 'game-1',
        player_id: 'player-1',
        actor_id: 'host-1',
        type: 'buy_in_added',
        payload: {},
        client_event_id: 'evt-1',
        client_created_at: ts(1),
        undone_by: null,
      },
    ]);
    const transport = new SupabaseSyncTransport(client(fake));

    const result = await transport.pull('game-1');

    expect(result.cursor).toBe('1');
    expect(result.events).toEqual([
      {
        clientEventId: 'evt-1',
        gameId: 'game-1',
        playerId: 'player-1',
        actorId: 'host-1',
        clientCreatedAt: ts(1),
        undoneBy: null,
        type: 'buy_in_added',
        payload: {},
      },
    ]);
  });

  it('resolves undone_by from the server row id back to the inverse event\'s clientEventId', async () => {
    const fake = new FakePostgrestClient();
    fake.seed('game_events', [
      {
        id: 1,
        game_id: 'game-1',
        player_id: 'player-1',
        actor_id: 'host-1',
        type: 'buy_in_added',
        payload: {},
        client_event_id: 'original-evt',
        client_created_at: ts(1),
        undone_by: 2,
      },
      {
        id: 2,
        game_id: 'game-1',
        player_id: 'player-1',
        actor_id: 'host-1',
        type: 'buy_in_removed',
        payload: {},
        client_event_id: 'inverse-evt',
        client_created_at: ts(2),
        undone_by: null,
      },
    ]);
    const transport = new SupabaseSyncTransport(client(fake));

    const result = await transport.pull('game-1');

    const original = result.events.find((e) => e.clientEventId === 'original-evt');
    expect(original?.undoneBy).toBe('inverse-evt');
  });

  it('is a no-op when there is nothing new since the cursor', async () => {
    const fake = new FakePostgrestClient();
    fake.seed('game_events', [
      {
        id: 1,
        game_id: 'game-1',
        player_id: 'player-1',
        actor_id: 'host-1',
        type: 'buy_in_added',
        payload: {},
        client_event_id: 'evt-1',
        client_created_at: ts(1),
        undone_by: null,
      },
    ]);
    const transport = new SupabaseSyncTransport(client(fake));

    const result = await transport.pull('game-1', '1');

    expect(result.events).toEqual([]);
    expect(result.cursor).toBe('1');
  });

  it('throws on a row that does not match the known event schema — validated at the boundary', async () => {
    const fake = new FakePostgrestClient();
    fake.seed('game_events', [
      {
        id: 1,
        game_id: 'game-1',
        player_id: 'player-1',
        actor_id: 'host-1',
        type: 'not_a_real_event_type',
        payload: {},
        client_event_id: 'evt-1',
        client_created_at: ts(1),
        undone_by: null,
      },
    ]);
    const transport = new SupabaseSyncTransport(client(fake));

    await expect(transport.pull('game-1')).rejects.toThrow();
  });
});
