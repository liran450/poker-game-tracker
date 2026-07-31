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
  setGameGroup,
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

describe('player_claims (03-data-model.md#player_claims)', () => {
  it('a group member can claim a guest row while the game is live', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const member = await createProfile(client);
      const group = await createGroup(client, host.id, [member.id]);
      const gameId = await createGame(client, host.id);
      await setGameGroup(client, gameId, group.id);
      const guestId = await addPlayer(client, gameId, host.id, null);
      await client.query("update games set status = 'active' where id = $1", [gameId]);

      await actAs(client, 'authenticated', member.id);
      const { rows } = await client.query(
        `insert into player_claims (game_id, game_player_id, claimant_user_id)
         values ($1, $2, $3) returning id`,
        [gameId, guestId, member.id],
      );
      expect(rows[0].id).toBeTruthy();

      await actAsAdmin(client);
      const { rows: eventRows } = await client.query(
        "select * from game_events where game_id = $1 and type = 'claim_requested'",
        [gameId],
      );
      expect(eventRows).toHaveLength(1);
    });
  });

  it('rejects a claim on an already-claimed (registered) row', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const already = await createProfile(client);
      const member = await createProfile(client);
      const group = await createGroup(client, host.id, [member.id, already.id]);
      const gameId = await createGame(client, host.id);
      await setGameGroup(client, gameId, group.id);
      const playerId = await addPlayer(client, gameId, host.id, already.id);
      await client.query("update games set status = 'active' where id = $1", [gameId]);

      await actAs(client, 'authenticated', member.id);
      const err = await expectRejection(client, () =>
        client.query(
          `insert into player_claims (game_id, game_player_id, claimant_user_id)
           values ($1, $2, $3)`,
          [gameId, playerId, member.id],
        ),
      );
      expect(err).toBeTruthy();
    });
  });

  it('rejects a claim submitted more than 48h after the game ended, accepts one just inside it', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const member = await createProfile(client);
      const group = await createGroup(client, host.id, [member.id]);
      const gameId = await createGame(client, host.id);
      await setGameGroup(client, gameId, group.id);
      const guestId = await addPlayer(client, gameId, host.id, null);

      await client.query(
        `update games set status = 'finished', ended_at = now() - interval '50 hours',
           claim_deadline = now() - interval '2 hours' where id = $1`,
        [gameId],
      );
      await actAs(client, 'authenticated', member.id);
      const tooLate = await expectRejection(client, () =>
        client.query(
          `insert into player_claims (game_id, game_player_id, claimant_user_id)
           values ($1, $2, $3)`,
          [gameId, guestId, member.id],
        ),
      );
      expect(tooLate).toBeTruthy();

      await actAsAdmin(client);
      await client.query(
        `update games set ended_at = now() - interval '10 hours',
           claim_deadline = now() + interval '38 hours' where id = $1`,
        [gameId],
      );
      await actAs(client, 'authenticated', member.id);
      const { rows } = await client.query(
        `insert into player_claims (game_id, game_player_id, claimant_user_id)
         values ($1, $2, $3) returning id`,
        [gameId, guestId, member.id],
      );
      expect(rows[0].id).toBeTruthy();
    });
  });

  it('a share-link holder can claim without group membership', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const stranger = await createProfile(client);
      const gameId = await createGame(client, host.id);
      const guestId = await addPlayer(client, gameId, host.id, null);
      await client.query("update games set status = 'active' where id = $1", [gameId]);
      const token = randomToken();
      await createShareLink(client, gameId, host.id, token);

      await actAs(client, 'authenticated', stranger.id);
      const { rows } = await client.query('select submit_claim_via_link($1, $2) as id', [
        token,
        guestId,
      ]);
      expect(rows[0].id).toBeTruthy();
    });
  });

  it('only the host may decide, approval sets user_id on game_players and nothing else', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const member = await createProfile(client);
      const outsider = await createProfile(client);
      const group = await createGroup(client, host.id, [member.id]);
      const gameId = await createGame(client, host.id);
      await setGameGroup(client, gameId, group.id);
      const guestId = await addPlayer(client, gameId, host.id, null);
      await client.query(
        'update game_players set buys_count = 3, cash_paid_minor = 5000 where id = $1',
        [guestId],
      );
      await client.query("update games set status = 'active' where id = $1", [gameId]);

      await actAs(client, 'authenticated', member.id);
      const { rows } = await client.query<{ id: string }>(
        `insert into player_claims (game_id, game_player_id, claimant_user_id)
         values ($1, $2, $3) returning id`,
        [gameId, guestId, member.id],
      );
      const claimId = rows[0].id;

      await actAs(client, 'authenticated', outsider.id);
      const rejected = await expectRejection(client, () =>
        client.query('select decide_claim($1, true)', [claimId]),
      );
      expect(rejected.message).toMatch(/not available/);

      const before = await (async () => {
        await actAsAdmin(client);
        const r = await client.query<{ buys_count: number; cash_paid_minor: number }>(
          'select buys_count, cash_paid_minor from game_players where id = $1',
          [guestId],
        );
        return r.rows[0];
      })();

      await actAs(client, 'authenticated', host.id);
      await client.query('select decide_claim($1, true)', [claimId]);

      await actAsAdmin(client);
      const { rows: playerRows } = await client.query(
        'select user_id, buys_count, cash_paid_minor from game_players where id = $1',
        [guestId],
      );
      expect(playerRows[0].user_id).toBe(member.id);
      expect(playerRows[0].buys_count).toBe(before.buys_count);
      expect(playerRows[0].cash_paid_minor).toBe(before.cash_paid_minor);
    });
  });

  it('two people cannot both own the same row: a second approval is rejected by the unique index', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const a = await createProfile(client);
      const b = await createProfile(client);
      const group = await createGroup(client, host.id, [a.id, b.id]);
      const gameId = await createGame(client, host.id);
      await setGameGroup(client, gameId, group.id);
      const guestId = await addPlayer(client, gameId, host.id, null);
      await client.query("update games set status = 'active' where id = $1", [gameId]);

      await actAs(client, 'authenticated', a.id);
      const claimA = await client.query(
        `insert into player_claims (game_id, game_player_id, claimant_user_id)
         values ($1, $2, $3) returning id`,
        [gameId, guestId, a.id],
      );
      await actAs(client, 'authenticated', b.id);
      const claimB = await client.query(
        `insert into player_claims (game_id, game_player_id, claimant_user_id)
         values ($1, $2, $3) returning id`,
        [gameId, guestId, b.id],
      );

      await actAs(client, 'authenticated', host.id);
      await client.query('select decide_claim($1, true)', [claimA.rows[0].id]);

      // decide_claim auto-rejects the other pending claim on the same row rather than leaving it
      // pending — 03-data-model.md: "the host picks one and the rest are rejected".
      await actAsAdmin(client);
      const { rows: statuses } = await client.query(
        'select id, status from player_claims where id in ($1, $2)',
        [claimA.rows[0].id, claimB.rows[0].id],
      );
      const byId = new Map(statuses.map((r) => [r.id, r.status]));
      expect(byId.get(claimA.rows[0].id)).toBe('approved');
      expect(byId.get(claimB.rows[0].id)).toBe('rejected');
    });
  });

  it('approving a claim after the game is finalised updates player_results.user_id, and only that', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const member = await createProfile(client);
      const group = await createGroup(client, host.id, [member.id]);
      const gameId = await createGame(client, host.id);
      await setGameGroup(client, gameId, group.id);
      const guestId = await addPlayer(client, gameId, host.id, null);
      await client.query(
        'update game_players set buys_count = 1, chips_final = 100 where id = $1',
        [guestId],
      );
      const endedAt = new Date().toISOString();
      await client.query(
        `update games set status = 'finished', ended_at = $2,
           claim_deadline = $2::timestamptz + interval '48 hours' where id = $1`,
        [gameId, endedAt],
      );

      await actAs(client, 'authenticated', host.id);
      await client.query('select finalize_game($1)', [gameId]);
      await actAsAdmin(client);

      await actAs(client, 'authenticated', member.id);
      const { rows } = await client.query(
        `insert into player_claims (game_id, game_player_id, claimant_user_id)
         values ($1, $2, $3) returning id`,
        [gameId, guestId, member.id],
      );

      await actAs(client, 'authenticated', host.id);
      await client.query('select decide_claim($1, true)', [rows[0].id]);

      await actAsAdmin(client);
      const { rows: resultRows } = await client.query(
        'select user_id, net_minor, buys_count from player_results where game_player_id = $1',
        [guestId],
      );
      expect(resultRows[0].user_id).toBe(member.id);
      // Money is untouched — "a claim changes attribution, never amounts".
      expect(resultRows[0].buys_count).toBe(1);
    });
  });
});
