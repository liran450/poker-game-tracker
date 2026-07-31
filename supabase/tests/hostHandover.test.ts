import { describe, expect, it } from 'vitest';
import {
  actAs,
  actAsAdmin,
  addPlayer,
  createGame,
  createProfile,
  expectRejection,
  withTransaction,
} from './support/db';

describe('hand_over_host (04-ux-spec.md#host-handover-and-takeover)', () => {
  it('the host can hand over to a signed-in current player', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const newHost = await createProfile(client);
      const gameId = await createGame(client, host.id);
      await addPlayer(client, gameId, host.id, newHost.id);

      await actAs(client, 'authenticated', host.id);
      await client.query('select hand_over_host($1, $2)', [gameId, newHost.id]);

      await actAsAdmin(client);
      const { rows } = await client.query('select host_id from games where id = $1', [gameId]);
      expect(rows[0].host_id).toBe(newHost.id);

      const { rows: eventRows } = await client.query(
        "select * from game_events where game_id = $1 and type = 'host_changed'",
        [gameId],
      );
      expect(eventRows).toHaveLength(1);
      expect(eventRows[0].payload.newHostId).toBe(newHost.id);
    });
  });

  it('a signed-in viewer is also a valid handover target', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const viewer = await createProfile(client);
      const gameId = await createGame(client, host.id);
      await client.query('insert into game_viewers (game_id, user_id) values ($1, $2)', [
        gameId,
        viewer.id,
      ]);

      await actAs(client, 'authenticated', host.id);
      await client.query('select hand_over_host($1, $2)', [gameId, viewer.id]);

      await actAsAdmin(client);
      const { rows } = await client.query('select host_id from games where id = $1', [gameId]);
      expect(rows[0].host_id).toBe(viewer.id);
    });
  });

  it('rejects a non-host caller', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const other = await createProfile(client);
      const target = await createProfile(client);
      const gameId = await createGame(client, host.id);
      await addPlayer(client, gameId, host.id, target.id);

      await actAs(client, 'authenticated', other.id);
      const err = await expectRejection(client, () =>
        client.query('select hand_over_host($1, $2)', [gameId, target.id]),
      );
      expect(err.message).toMatch(/not available/);
    });
  });

  it('rejects someone who is neither a player nor a viewer of this game (also covers guests — they have no profile id to hand over to at all)', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const stranger = await createProfile(client);
      const gameId = await createGame(client, host.id);

      await actAs(client, 'authenticated', host.id);
      const err = await expectRejection(client, () =>
        client.query('select hand_over_host($1, $2)', [gameId, stranger.id]),
      );
      expect(err.message).toMatch(/not available/);
    });
  });
});

describe('take_over_host still works alongside the new step-13 pieces (regression, step 10)', () => {
  it('a viewer can seize control immediately, no waiting period', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const viewer = await createProfile(client);
      const gameId = await createGame(client, host.id);
      await client.query('insert into game_viewers (game_id, user_id) values ($1, $2)', [
        gameId,
        viewer.id,
      ]);

      await actAs(client, 'authenticated', viewer.id);
      await client.query('select take_over_host($1)', [gameId]);

      await actAsAdmin(client);
      const { rows } = await client.query('select host_id from games where id = $1', [gameId]);
      expect(rows[0].host_id).toBe(viewer.id);
    });
  });
});
