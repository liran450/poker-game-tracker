import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { actAs, actAsAdmin, createGame, createProfile, withTransaction } from './support/db';

/** A finished, group-scoped game with a snapshot, optionally private. */
async function createGroupGameWithSnapshot(
  client: PoolClient,
  hostId: string,
  groupId: string,
  isPrivate: boolean,
): Promise<string> {
  const gameId = await createGame(client, hostId);
  await client.query('update games set group_id = $2, is_private = $3 where id = $1', [
    gameId,
    groupId,
    isPrivate,
  ]);

  const playerId = randomUUID();
  await client.query(
    `insert into game_events (
       game_id, player_id, actor_id, type, payload, client_event_id, client_created_at
     ) values ($1, $2, $3, 'player_added', $4::jsonb, $5, now())`,
    [
      gameId,
      playerId,
      hostId,
      JSON.stringify({ userId: null, guestName: 'Guest', nickname: null, seatOrder: 0 }),
      randomUUID(),
    ],
  );
  await client.query(
    'update games set status = \'finished\', ended_at = now() where id = $1',
    [gameId],
  );

  await actAs(client, 'authenticated', hostId);
  await client.query('select finalize_game($1)', [gameId]);
  await actAsAdmin(client);

  return gameId;
}

describe('group_player_results view (docs/build/PLAN.md step 11)', () => {
  it('excludes a private game and includes a non-private one', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const { rows: groupRows } = await client.query<{ id: string }>(
        'insert into groups (name, created_by) values ($1, $2) returning id',
        ['Test Group', host.id],
      );
      const groupId = groupRows[0].id;

      const publicGame = await createGroupGameWithSnapshot(client, host.id, groupId, false);
      const privateGame = await createGroupGameWithSnapshot(client, host.id, groupId, true);

      const { rows } = await client.query<{ game_id: string }>(
        'select game_id from group_player_results where group_id = $1',
        [groupId],
      );
      const gameIds = rows.map((r) => r.game_id);

      expect(gameIds).toContain(publicGame);
      expect(gameIds).not.toContain(privateGame);
    });
  });

  it('is scoped to the caller\'s own group, not readable by every authenticated user', async () => {
    // The real regression test for the security-advisor fix
    // (20260731140000_step11_security_advisor_fixes.sql): a plain view defaults to running with
    // its *owner's* privileges, bypassing the querying user's RLS on player_results/
    // game_summaries entirely — group_player_results shipped that way at first, meaning any
    // authenticated caller could read every group's statistics regardless of membership.
    // security_invoker = true makes the view honour the caller's real RLS instead.
    await withTransaction(async (client) => {
      const groupAHost = await createProfile(client);
      const groupBMember = await createProfile(client);

      const { rows: groupRows } = await client.query<{ id: string }>(
        'insert into groups (name, created_by) values ($1, $2) returning id',
        ['Group A', groupAHost.id],
      );
      const groupAId = groupRows[0].id;
      await client.query(
        'insert into group_members (group_id, user_id, role) values ($1, $2, \'owner\')',
        [groupAId, groupAHost.id],
      );

      const publicGame = await createGroupGameWithSnapshot(client, groupAHost.id, groupAId, false);

      // A member of a *different* group, with no membership in Group A, must see nothing.
      await actAs(client, 'authenticated', groupBMember.id);
      const strangerResult = await client.query<{ game_id: string }>(
        'select game_id from group_player_results where group_id = $1',
        [groupAId],
      );
      expect(strangerResult.rows).toEqual([]);

      // Group A's own host (a real group_members row, not just the game's host_id) sees it.
      await actAs(client, 'authenticated', groupAHost.id);
      const memberResult = await client.query<{ game_id: string }>(
        'select game_id from group_player_results where group_id = $1',
        [groupAId],
      );
      expect(memberResult.rows.map((r) => r.game_id)).toContain(publicGame);
    });
  });

  it('keeps excluding the private game after its live rows are purged', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const { rows: groupRows } = await client.query<{ id: string }>(
        'insert into groups (name, created_by) values ($1, $2) returning id',
        ['Test Group', host.id],
      );
      const groupId = groupRows[0].id;

      const privateGame = await createGroupGameWithSnapshot(client, host.id, groupId, true);

      // Purge the live rows (as an old purge or an explicit deletion would) — game_summaries/
      // player_results (tier 1) survive, games (tier 2) doesn't.
      await client.query('delete from games where id = $1', [privateGame]);

      const { rows } = await client.query<{ game_id: string }>(
        'select game_id from group_player_results where group_id = $1',
        [groupId],
      );
      expect(rows.map((r) => r.game_id)).not.toContain(privateGame);

      const { rows: summaryRows } = await client.query(
        'select 1 from game_summaries where game_id = $1',
        [privateGame],
      );
      expect(summaryRows).toHaveLength(1); // the summary itself really did survive
    });
  });
});
