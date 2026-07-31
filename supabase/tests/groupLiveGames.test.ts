import { describe, expect, it } from 'vitest';
import { actAs, createGame, createGroup, createProfile, expectRejection, withTransaction } from './support/db';

describe('get_group_live_games (docs/build/PLAN.md step 13, the in-app half of "two paths in")', () => {
  it('lists only active/settling games in the group, not setup or finished ones', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const member = await createProfile(client);
      const group = await createGroup(client, host.id, [member.id]);

      const liveGame = await createGame(client, host.id, { name: 'Live' });
      await client.query('update games set group_id = $2, status = $3 where id = $1', [
        liveGame,
        group.id,
        'active',
      ]);

      const setupGame = await createGame(client, host.id, { name: 'Setup' });
      await client.query('update games set group_id = $2 where id = $1', [setupGame, group.id]);

      const finishedGame = await createGame(client, host.id, { name: 'Finished' });
      await client.query('update games set group_id = $2, status = $3 where id = $1', [
        finishedGame,
        group.id,
        'finished',
      ]);

      await actAs(client, 'authenticated', member.id);
      const { rows } = await client.query<{ name: string }>(
        'select * from get_group_live_games($1)',
        [group.id],
      );
      expect(rows.map((r) => r.name)).toEqual(['Live']);
    });
  });

  it('excludes private games unconditionally (deferred nuance — see docs/build/PROGRESS.md step 13)', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const member = await createProfile(client);
      const group = await createGroup(client, host.id, [member.id]);

      const privateGame = await createGame(client, host.id, { name: 'Private' });
      await client.query(
        'update games set group_id = $2, status = $3, is_private = true where id = $1',
        [privateGame, group.id, 'active'],
      );

      await actAs(client, 'authenticated', member.id);
      const { rows } = await client.query('select * from get_group_live_games($1)', [group.id]);
      expect(rows).toHaveLength(0);
    });
  });

  it('rejects a caller who is not a member of the group', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const outsider = await createProfile(client);
      const group = await createGroup(client, host.id);
      const gameId = await createGame(client, host.id);
      await client.query('update games set group_id = $2, status = $3 where id = $1', [
        gameId,
        group.id,
        'active',
      ]);

      await actAs(client, 'authenticated', outsider.id);
      const err = await expectRejection(client, () =>
        client.query('select * from get_group_live_games($1)', [group.id]),
      );
      expect(err.message).toMatch(/not available/);
    });
  });
});
