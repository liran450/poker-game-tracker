import { describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import {
  actAs,
  actAsAdmin,
  addPlayer,
  createGame,
  createGroup,
  createProfile,
  setGameGroup,
  withTransaction,
} from './support/db';

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS).toISOString();

/** A finished, group-scoped game with one registered and one guest player, snapshotted. */
async function createFinishedGroupGame(
  client: PoolClient,
  hostId: string,
  groupId: string,
  registeredId: string,
  endedAt: string,
): Promise<string> {
  const gameId = await createGame(client, hostId);
  await setGameGroup(client, gameId, groupId);
  await addPlayer(client, gameId, hostId, registeredId);
  await addPlayer(client, gameId, hostId, null); // a guest — never counts toward anyone's stats

  await client.query('update games set status = \'finished\', ended_at = $2 where id = $1', [
    gameId,
    endedAt,
  ]);

  await actAs(client, 'authenticated', hostId);
  await client.query('select finalize_game($1)', [gameId]);
  await actAsAdmin(client);

  return gameId;
}

/** The group-scoped aggregate a statistics screen would actually read (06-statistics.md). */
async function groupNetTotal(client: PoolClient, groupId: string): Promise<{ games: number; net: number }> {
  const { rows } = await client.query<{ games: string; net: string }>(
    'select count(distinct game_id) as games, coalesce(sum(net_minor), 0) as net ' +
      'from group_player_results where group_id = $1',
    [groupId],
  );
  return { games: Number(rows[0].games), net: Number(rows[0].net) };
}

describe('profiles_public.stats_visibility (docs/build/PLAN.md step 15)', () => {
  it('is readable for a co-member, defaulting to "group"', async () => {
    await withTransaction(async (client) => {
      const owner = await createProfile(client);
      const member = await createProfile(client);
      await createGroup(client, owner.id, [member.id]);

      await actAs(client, 'authenticated', member.id);
      const { rows } = await client.query(
        'select stats_visibility from profiles_public where id = $1',
        [owner.id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].stats_visibility).toBe('group');
    });
  });

  it('reflects a member opting out to "private"', async () => {
    await withTransaction(async (client) => {
      const owner = await createProfile(client);
      const member = await createProfile(client);
      await createGroup(client, owner.id, [member.id]);

      await actAsAdmin(client);
      await client.query("update profiles set stats_visibility = 'private' where id = $1", [
        member.id,
      ]);

      await actAs(client, 'authenticated', owner.id);
      const { rows } = await client.query(
        'select stats_visibility from profiles_public where id = $1',
        [member.id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].stats_visibility).toBe('private');
    });
  });

  it('is still self-or-co-member only — a stranger sees nothing', async () => {
    await withTransaction(async (client) => {
      const target = await createProfile(client);
      const stranger = await createProfile(client);

      await actAs(client, 'authenticated', stranger.id);
      const { rows } = await client.query('select * from profiles_public where id = $1', [
        target.id,
      ]);
      expect(rows).toHaveLength(0);
    });
  });

  it('is readable for self', async () => {
    await withTransaction(async (client) => {
      const self = await createProfile(client);
      await actAs(client, 'authenticated', self.id);
      const { rows } = await client.query(
        'select stats_visibility from profiles_public where id = $1',
        [self.id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].stats_visibility).toBe('group');
    });
  });
});

describe('statistics survive purge_expired_game_data (06-statistics.md#scoping, PLAN.md step 15 exit criterion)', () => {
  it('reads the same group net total before and after the live rows are purged', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const group = await createGroup(client, host.id);
      const gameId = await createFinishedGroupGame(client, host.id, group.id, host.id, daysAgo(120));

      const before = await groupNetTotal(client, group.id);
      expect(before.games).toBe(1);

      await client.query('select * from purge_expired_game_data()');

      // The live rows are actually gone — this isn't a no-op purge.
      const { rows: liveRows } = await client.query('select count(*) from games where id = $1', [
        gameId,
      ]);
      expect(Number(liveRows[0].count)).toBe(0);

      const after = await groupNetTotal(client, group.id);
      expect(after).toEqual(before);
    });
  });

  it('reads the same group net total before and after the game is explicitly deleted', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const group = await createGroup(client, host.id);
      await createFinishedGroupGame(client, host.id, group.id, host.id, daysAgo(1));

      const before = await groupNetTotal(client, group.id);
      expect(before.games).toBe(1);

      // "Delete a game" (04-ux-spec.md) removes the live rows only — the permanent snapshot,
      // which is all statistics ever reads, is untouched.
      await client.query('delete from games where group_id = $1', [group.id]);

      const after = await groupNetTotal(client, group.id);
      expect(after).toEqual(before);
    });
  });
});
