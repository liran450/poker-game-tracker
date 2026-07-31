import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { actAs, actAsAdmin, createGame, createProfile, withTransaction } from './support/db';

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS).toISOString();

/** A minimal finished game, host-created player, and a snapshot via finalize_game(). */
async function createFinishedGameWithSnapshot(
  client: PoolClient,
  hostId: string,
  endedAt: string,
): Promise<string> {
  const gameId = await createGame(client, hostId);
  const playerId = randomUUID();
  await client.query(
    `insert into game_events (
       game_id, player_id, actor_id, type, payload, client_event_id, client_created_at
     ) values ($1, $2, $3, 'player_added', $4::jsonb, $5, $6)`,
    [
      gameId,
      playerId,
      hostId,
      JSON.stringify({ userId: null, guestName: 'Guest', nickname: null, seatOrder: 0 }),
      randomUUID(),
      endedAt,
    ],
  );
  await client.query('update games set status = \'finished\', ended_at = $2 where id = $1', [
    gameId,
    endedAt,
  ]);

  await actAs(client, 'authenticated', hostId);
  await client.query('select finalize_game($1)', [gameId]);
  await actAsAdmin(client);

  return gameId;
}

async function tableCounts(client: PoolClient, gameId: string) {
  const counts: Record<string, number> = {};
  const { rows: gameRows } = await client.query('select count(*) from games where id = $1', [
    gameId,
  ]);
  counts.games = Number(gameRows[0].count);

  for (const table of ['game_players', 'game_events', 'transfers', 'shared_costs']) {
    const { rows } = await client.query(`select count(*) from ${table} where game_id = $1`, [
      gameId,
    ]);
    counts[table] = Number(rows[0].count);
  }
  return counts;
}

describe('purge_expired_game_data (docs/build/PLAN.md step 11)', () => {
  it('purges tier 3 (game_events) at 30 days and tier 2 (games + cascades) at 90 days', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);

      const freshGame = await createFinishedGameWithSnapshot(client, host.id, daysAgo(1));
      const tier3Game = await createFinishedGameWithSnapshot(client, host.id, daysAgo(45));
      const tier2Game = await createFinishedGameWithSnapshot(client, host.id, daysAgo(120));

      await client.query('select * from purge_expired_game_data()');

      const fresh = await tableCounts(client, freshGame);
      expect(fresh.games).toBe(1);
      expect(fresh.game_events).toBeGreaterThan(0);

      const tier3 = await tableCounts(client, tier3Game);
      expect(tier3.games).toBe(1); // games row survives at 45 days
      expect(tier3.game_players).toBe(1);
      expect(tier3.game_events).toBe(0); // but its audit log is gone

      const tier2 = await tableCounts(client, tier2Game);
      expect(tier2.games).toBe(0);
      expect(tier2.game_players).toBe(0);
      expect(tier2.game_events).toBe(0);

      // Tier 1 survives forever, for all three.
      for (const gameId of [freshGame, tier3Game, tier2Game]) {
        const { rows } = await client.query(
          'select count(*) from game_summaries where game_id = $1',
          [gameId],
        );
        expect(Number(rows[0].count)).toBe(1);
      }
    });
  });

  it('refuses to purge a game with no snapshot, however old', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const gameId = await createGame(client, host.id);
      // Finished 200 days ago, but finalize_game() was never called — no game_summaries row.
      await client.query('update games set status = \'finished\', ended_at = $2 where id = $1', [
        gameId,
        daysAgo(200),
      ]);

      await client.query('select * from purge_expired_game_data()');

      const { rows } = await client.query('select count(*) from games where id = $1', [gameId]);
      expect(Number(rows[0].count)).toBe(1); // untouched
    });
  });

  it('reports the deleted row count per table', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      await createFinishedGameWithSnapshot(client, host.id, daysAgo(120));

      const { rows } = await client.query('select * from purge_expired_game_data()');
      const byTable = new Map(rows.map((r) => [r.table_name, Number(r.deleted_count)]));

      expect(byTable.get('games')).toBeGreaterThanOrEqual(1);
      expect(byTable.has('game_events')).toBe(true);
    });
  });

  it('leaves statistics byte-identical after a purge', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const gameId = await createFinishedGameWithSnapshot(client, host.id, daysAgo(120));

      const before = await client.query(
        'select * from player_results where game_id = $1 order by id',
        [gameId],
      );
      const beforeSummary = await client.query(
        'select * from game_summaries where game_id = $1',
        [gameId],
      );

      await client.query('select * from purge_expired_game_data()');

      const after = await client.query(
        'select * from player_results where game_id = $1 order by id',
        [gameId],
      );
      const afterSummary = await client.query('select * from game_summaries where game_id = $1', [
        gameId,
      ]);

      expect(after.rows).toEqual(before.rows);
      expect(afterSummary.rows).toEqual(beforeSummary.rows);
    });
  });

  it('leaves statistics byte-identical after an explicit deletion of a finished game', async () => {
    // "Explicit deletion by the host follows the same rule" (03-data-model.md#retention-and-
    // archiving): tiers 2/3 go away, tier 1 stays, no age requirement. There's no delete_game()
    // RPC yet (that's step 16's "Delete-a-game" build item) — a direct delete of the `games` row
    // is the same mechanism the eventual RPC will wrap, and every FK from games down is already
    // `on delete cascade`, so this already exercises the real behaviour.
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const gameId = await createFinishedGameWithSnapshot(client, host.id, daysAgo(1));

      const beforeResults = await client.query(
        'select * from player_results where game_id = $1 order by id',
        [gameId],
      );
      const beforeSummary = await client.query(
        'select * from game_summaries where game_id = $1',
        [gameId],
      );

      await client.query('delete from games where id = $1', [gameId]);

      const afterResults = await client.query(
        'select * from player_results where game_id = $1 order by id',
        [gameId],
      );
      const afterSummary = await client.query('select * from game_summaries where game_id = $1', [
        gameId,
      ]);
      const { rows: gamePlayerRows } = await client.query(
        'select count(*) from game_players where game_id = $1',
        [gameId],
      );

      expect(afterResults.rows).toEqual(beforeResults.rows);
      expect(afterSummary.rows).toEqual(beforeSummary.rows);
      expect(Number(gamePlayerRows[0].count)).toBe(0);
    });
  });
});
