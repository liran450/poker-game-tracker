import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import {
  actAs,
  actAsAdmin,
  createGame,
  createProfile,
  expectRejection,
  withTransaction,
} from './support/db';

function randomToken(): string {
  return randomUUID() + randomUUID();
}

async function createShareLink(
  client: PoolClient,
  gameId: string,
  createdBy: string,
  token: string,
): Promise<void> {
  await client.query(
    `insert into share_links (game_id, token_hash, token_prefix, created_by)
     values ($1, $2, $3, $4)`,
    [gameId, createHash('sha256').update(token).digest(), token.slice(0, 6), createdBy],
  );
}

describe('submit_join_request_via_link (03-data-model.md#two-paths-in-one-gate, path 1)', () => {
  it('rejects an anonymous (signed-out) caller with the generic shape', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const gameId = await createGame(client, host.id);
      await client.query("update games set status = 'active' where id = $1", [gameId]);
      const token = randomToken();
      await createShareLink(client, gameId, host.id, token);

      await actAs(client, 'anon');
      const err = await expectRejection(client, () =>
        client.query('select submit_join_request_via_link($1, $2)', [token, 'שחקן']),
      );
      expect(err.message).toMatch(/not available/);
    });
  });

  it('inserts a pending join_requests row sourced "link" and logs join_requested', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const requester = await createProfile(client);
      const gameId = await createGame(client, host.id);
      await client.query("update games set status = 'active' where id = $1", [gameId]);
      const token = randomToken();
      await createShareLink(client, gameId, host.id, token);

      await actAs(client, 'authenticated', requester.id);
      const { rows } = await client.query<{ id: string }>(
        'select submit_join_request_via_link($1, $2) as id',
        [token, 'דנה'],
      );
      const requestId = rows[0].id;
      expect(requestId).toBeTruthy();

      await actAsAdmin(client);
      const { rows: reqRows } = await client.query(
        'select * from join_requests where id = $1',
        [requestId],
      );
      expect(reqRows[0].source).toBe('link');
      expect(reqRows[0].status).toBe('pending');
      expect(reqRows[0].user_id).toBe(requester.id);

      const { rows: eventRows } = await client.query(
        "select * from game_events where game_id = $1 and type = 'join_requested'",
        [gameId],
      );
      expect(eventRows).toHaveLength(1);
      expect(eventRows[0].actor_id).toBe(requester.id);
    });
  });

  it('repeated taps go quiet instead of erroring, returning the same pending request', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const requester = await createProfile(client);
      const gameId = await createGame(client, host.id);
      await client.query("update games set status = 'active' where id = $1", [gameId]);
      const token = randomToken();
      await createShareLink(client, gameId, host.id, token);

      await actAs(client, 'authenticated', requester.id);
      const first = await client.query('select submit_join_request_via_link($1, $2) as id', [
        token,
        'דנה',
      ]);
      const second = await client.query('select submit_join_request_via_link($1, $2) as id', [
        token,
        'דנה',
      ]);
      expect(second.rows[0].id).toBe(first.rows[0].id);

      await actAsAdmin(client);
      const { rows } = await client.query(
        "select count(*) from join_requests where game_id = $1 and status = 'pending'",
        [gameId],
      );
      expect(Number(rows[0].count)).toBe(1);
    });
  });

  it('decide_join_request seeds a fresh player nickname from the account default_nickname', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const requester = await createProfile(client);
      await client.query('update profiles set default_nickname = $2 where id = $1', [
        requester.id,
        'דני',
      ]);
      const gameId = await createGame(client, host.id);
      await client.query("update games set status = 'active' where id = $1", [gameId]);
      const token = randomToken();
      await createShareLink(client, gameId, host.id, token);

      await actAs(client, 'authenticated', requester.id);
      const { rows } = await client.query<{ id: string }>(
        'select submit_join_request_via_link($1, $2) as id',
        [token, 'דני המ'],
      );
      const requestId = rows[0].id;

      await actAs(client, 'authenticated', host.id);
      await client.query('select decide_join_request($1, true)', [requestId]);

      await actAsAdmin(client);
      const { rows: playerRows } = await client.query(
        'select nickname, user_id from game_players where game_id = $1 and user_id = $2',
        [gameId, requester.id],
      );
      expect(playerRows[0].nickname).toBe('דני');
    });
  });

  it('a link-sourced request can be approved as a viewer', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const requester = await createProfile(client);
      const gameId = await createGame(client, host.id);
      await client.query("update games set status = 'active' where id = $1", [gameId]);
      const token = randomToken();
      await createShareLink(client, gameId, host.id, token);

      await actAs(client, 'authenticated', requester.id);
      const { rows } = await client.query(
        'select submit_join_request_via_link($1, $2, $3) as id',
        [token, 'צופה', 'viewer'],
      );

      await actAs(client, 'authenticated', host.id);
      await client.query('select decide_join_request($1, true)', [rows[0].id]);

      await actAsAdmin(client);
      const { rows: viewerRows } = await client.query(
        'select * from game_viewers where game_id = $1 and user_id = $2',
        [gameId, requester.id],
      );
      expect(viewerRows).toHaveLength(1);
    });
  });
});
