import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import {
  actAs,
  actAsAdmin,
  addPlayer,
  createGame,
  createGroup,
  createProfile,
  expectRejection,
  withTransaction,
} from './support/db';

const DAY_MS = 24 * 60 * 60 * 1000;
const hoursAgo = (n: number) => new Date(Date.now() - n * 60 * 60 * 1000).toISOString();

function randomToken(): string {
  return randomUUID() + randomUUID();
}

function hash(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

/** Inserts a share_links row directly (as admin), the way the client would after hashing. */
async function createShareLink(
  client: PoolClient,
  gameId: string,
  createdBy: string,
  token: string,
  overrides: Partial<{ createdAt: string; revokedAt: string | null }> = {},
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `insert into share_links (game_id, token_hash, token_prefix, created_by, created_at, revoked_at)
     values ($1, $2, $3, $4, $5, $6)
     returning id`,
    [
      gameId,
      hash(token),
      token.slice(0, 6),
      createdBy,
      overrides.createdAt ?? new Date().toISOString(),
      overrides.revokedAt ?? null,
    ],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('createShareLink: insert returned no id');
  return id;
}

describe('share links (docs/build/PLAN.md step 13, 03-data-model.md#link-security)', () => {
  it('a revoked link is rejected with the generic shape', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const gameId = await createGame(client, host.id);
      const token = randomToken();
      await createShareLink(client, gameId, host.id, token, {
        revokedAt: new Date().toISOString(),
      });

      await actAs(client, 'anon');
      const err = await expectRejection(client, () =>
        client.query('select get_shared_game($1)', [token]),
      );
      expect(err.message).toMatch(/not available/);
    });
  });

  it('an unknown token is rejected with the same generic shape as a revoked one', async () => {
    await withTransaction(async (client) => {
      await actAs(client, 'anon');
      const err = await expectRejection(client, () =>
        client.query('select get_shared_game($1)', [randomToken()]),
      );
      expect(err.message).toMatch(/not available/);
    });
  });

  it('a non-member (or anonymous) caller is rejected after 7 days but not before', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const gameId = await createGame(client, host.id);
      await client.query("update games set status = 'active' where id = $1", [gameId]);

      const fresh = randomToken();
      await createShareLink(client, gameId, host.id, fresh, {
        createdAt: new Date(Date.now() - 6 * DAY_MS).toISOString(),
      });
      const stale = randomToken();
      await createShareLink(client, gameId, host.id, stale, {
        createdAt: new Date(Date.now() - 8 * DAY_MS).toISOString(),
      });

      await actAs(client, 'anon');
      const okResult = await client.query('select get_shared_game($1) as result', [fresh]);
      expect(okResult.rows[0].result.kind).toBe('live');

      const err = await expectRejection(client, () =>
        client.query('select get_shared_game($1)', [stale]),
      );
      expect(err.message).toMatch(/not available/);
    });
  });

  it('a signed-in group member gets 30 days, not 7', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const member = await createProfile(client);
      await createGroup(client, host.id, [member.id]);
      const gameId = await createGame(client, host.id);
      const { rows: groupRows } = await client.query<{ group_id: string }>(
        'select group_id from group_members where user_id = $1 limit 1',
        [host.id],
      );
      const groupId = groupRows[0]?.group_id;
      await client.query("update games set status = 'active', group_id = $2 where id = $1", [
        gameId,
        groupId,
      ]);

      const token = randomToken();
      await createShareLink(client, gameId, host.id, token, {
        createdAt: new Date(Date.now() - 20 * DAY_MS).toISOString(),
      });

      // A non-member is already past the 7-day window.
      const nonMember = await createProfile(client);
      await actAs(client, 'authenticated', nonMember.id);
      const rejected = await expectRejection(client, () =>
        client.query('select get_shared_game($1)', [token]),
      );
      expect(rejected.message).toMatch(/not available/);

      // The group member is still within the 30-day window.
      await actAs(client, 'authenticated', member.id);
      const result = await client.query('select get_shared_game($1) as result', [token]);
      expect(result.rows[0].result.kind).toBe('live');
    });
  });

  it('stamps last_viewed_at and increments view_count on a successful lookup, not on rejection', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const gameId = await createGame(client, host.id);
      await client.query("update games set status = 'active' where id = $1", [gameId]);
      const token = randomToken();
      const linkId = await createShareLink(client, gameId, host.id, token);

      await actAs(client, 'anon');
      await client.query('select get_shared_game($1)', [token]);
      await client.query('select get_shared_game($1)', [token]);

      await actAsAdmin(client);
      const { rows } = await client.query(
        'select view_count, last_viewed_at from share_links where id = $1',
        [linkId],
      );
      expect(rows[0].view_count).toBe(2);
      expect(rows[0].last_viewed_at).not.toBeNull();
    });
  });

  it('routes a finished game to {kind: "finished"} instead of exposing live data', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const gameId = await createGame(client, host.id);
      await client.query("update games set status = 'finished', ended_at = now() where id = $1", [
        gameId,
      ]);
      const token = randomToken();
      await createShareLink(client, gameId, host.id, token);

      await actAs(client, 'anon');
      const { rows } = await client.query('select get_shared_game($1) as result', [token]);
      expect(rows[0].result).toEqual({ kind: 'finished' });
    });
  });

  it('get_shared_settlement reads the permanent snapshot and survives the live game_players row being purged', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const gameId = await createGame(client, host.id);
      const playerId = await addPlayer(client, gameId, host.id, null);
      await client.query('update game_players set buys_count = 2, chips_final = 200 where id = $1', [
        playerId,
      ]);
      const endedAt = hoursAgo(1);
      await client.query("update games set status = 'finished', ended_at = $2 where id = $1", [
        gameId,
        endedAt,
      ]);

      await actAs(client, 'authenticated', host.id);
      await client.query('select finalize_game($1)', [gameId]);
      await actAsAdmin(client);

      const token = randomToken();
      await createShareLink(client, gameId, host.id, token);

      await actAs(client, 'anon');
      const { rows } = await client.query('select get_shared_settlement($1) as result', [token]);
      expect(rows[0].result.kind).toBe('settled');
      expect(rows[0].result.playerResults).toHaveLength(1);

      // Now purge the live rows — the permanent snapshot, and the share link itself (its own
      // window has long since made it unreachable for a fresh lookup, but the row survives until
      // purge_expired_game_data actually removes it) must not depend on games/game_players.
      await actAsAdmin(client);
      await client.query('delete from game_players where game_id = $1', [gameId]);
      await client.query('delete from games where id = $1', [gameId]);

      const { rows: summaryRows } = await client.query(
        'select * from game_summaries where game_id = $1',
        [gameId],
      );
      expect(summaryRows).toHaveLength(1);
    });
  });

});
