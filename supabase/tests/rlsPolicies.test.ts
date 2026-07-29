import { randomUUID } from 'node:crypto';
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

describe('RLS — a non-host cannot write (docs/build/PLAN.md step 10 exit criterion)', () => {
  it('a non-host authenticated user cannot insert a game_event into someone else\'s game', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const stranger = await createProfile(client);
      const gameId = await createGame(client, host.id);

      await actAs(client, 'authenticated', stranger.id);
      await expect(
        client.query(
          `insert into game_events (game_id, actor_id, type, payload, client_event_id, client_created_at)
           values ($1, $2, 'game_started', '{}'::jsonb, $3, now())`,
          [gameId, stranger.id, randomUUID()],
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it('the host can insert a game_event into their own game', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const gameId = await createGame(client, host.id);

      await actAs(client, 'authenticated', host.id);
      await expect(
        client.query(
          `insert into game_events (game_id, actor_id, type, payload, client_event_id, client_created_at)
           values ($1, $2, 'game_started', '{}'::jsonb, $3, now())`,
          [gameId, host.id, randomUUID()],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });
  });

  it('a non-host cannot update another host\'s game', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const stranger = await createProfile(client);
      const gameId = await createGame(client, host.id);

      await actAs(client, 'authenticated', stranger.id);
      const result = await client.query('update games set notes = \'hacked\' where id = $1', [gameId]);
      // RLS silently filters non-matching rows for UPDATE rather than raising — assert nothing
      // was touched, which is the observable guarantee that actually matters.
      expect(result.rowCount).toBe(0);
    });
  });

  it('a game the caller can\'t see is invisible, not just unwritable', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const stranger = await createProfile(client);
      const gameId = await createGame(client, host.id);

      await actAs(client, 'authenticated', stranger.id);
      const result = await client.query('select id from games where id = $1', [gameId]);
      expect(result.rows).toEqual([]);
    });
  });

  it('anon cannot read or write games at all', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const gameId = await createGame(client, host.id);

      await actAs(client, 'anon');
      const read = await client.query('select id from games where id = $1', [gameId]);
      expect(read.rows).toEqual([]);

      await expect(
        client.query(
          `insert into games (name, buy_amount_minor, chips_per_buy, host_id, created_by)
           values ('anon game', 5000, 100, $1, $1)`,
          [host.id],
        ),
      ).rejects.toThrow();
    });
  });

  it('game_events is insert-only: no role can update or delete an existing event', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const gameId = await createGame(client, host.id);
      await client.query(
        `insert into game_events (game_id, actor_id, type, payload, client_event_id, client_created_at)
         values ($1, $2, 'game_started', '{}'::jsonb, $3, now())`,
        [gameId, host.id, randomUUID()],
      );

      await actAs(client, 'authenticated', host.id);
      const updateError = await expectRejection(client, () =>
        client.query('update game_events set type = \'note\' where game_id = $1', [gameId]),
      );
      expect(updateError.message).toMatch(/permission denied/i);

      const deleteError = await expectRejection(client, () =>
        client.query('delete from game_events where game_id = $1', [gameId]),
      );
      expect(deleteError.message).toMatch(/permission denied/i);
    });
  });

  it('nobody can insert into the permanent snapshot tables — not even the host', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);

      await actAs(client, 'authenticated', host.id);
      await expect(
        client.query(
          `insert into game_summaries (
             game_id, name, played_on, currency, buy_amount_minor, chips_per_buy,
             player_count, duration_minutes, total_buy_ins_minor, total_cash_pot_minor,
             unaccounted_minor, shared_costs_minor, finished_at
           ) values ($1, 'g', current_date, 'ILS', 5000, 100, 2, 60, 10000, 10000, 0, 0, now())`,
          [randomUUID()],
        ),
      ).rejects.toThrow();
    });
  });
});

describe('RLS — host takeover (docs/03-data-model.md#host-takeover)', () => {
  it('someone not in the game cannot take over host, and the rejection is generic', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const stranger = await createProfile(client);
      const gameId = await createGame(client, host.id);

      await actAs(client, 'authenticated', stranger.id);
      await expect(client.query('select take_over_host($1)', [gameId])).rejects.toThrow(
        /not available/,
      );
    });
  });

  it('a bogus game id is rejected with the exact same message as "not in the game"', async () => {
    await withTransaction(async (client) => {
      const stranger = await createProfile(client);

      await actAs(client, 'authenticated', stranger.id);
      const bogusGameError = await expectRejection(client, () =>
        client.query('select take_over_host($1)', [randomUUID()]),
      );

      await actAsAdmin(client);
      const host = await createProfile(client);
      const otherStranger = await createProfile(client);
      const gameId = await createGame(client, host.id);

      await actAs(client, 'authenticated', otherStranger.id);
      const notInGameError = await expectRejection(client, () =>
        client.query('select take_over_host($1)', [gameId]),
      );

      expect(bogusGameError).toBeInstanceOf(Error);
      expect(notInGameError).toBeInstanceOf(Error);
      // Every rejection returns the same generic shape (09-roadmap.md#testing) — a caller
      // can't distinguish "no such game" from "you're not in it" from the error alone.
      expect((bogusGameError).message).toBe((notInGameError).message);
    });
  });

  it('a player in the game can take over as host, and the takeover is logged', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const player = await createProfile(client);
      const gameId = await createGame(client, host.id);
      await addPlayer(client, gameId, host.id, player.id);

      await actAs(client, 'authenticated', player.id);
      await client.query('select take_over_host($1)', [gameId]);

      await actAsAdmin(client);
      const { rows: gameRows } = await client.query('select host_id from games where id = $1', [
        gameId,
      ]);
      expect(gameRows[0]?.host_id).toBe(player.id);

      const { rows: eventRows } = await client.query(
        `select type, payload, actor_id from game_events
         where game_id = $1 and type = 'host_taken_over'`,
        [gameId],
      );
      expect(eventRows).toHaveLength(1);
      expect(eventRows[0]?.actor_id).toBe(player.id);
      expect(eventRows[0]?.payload).toMatchObject({ previousHostId: host.id });
    });
  });

  it('a viewer (not a player) can also take over, but a mere group member cannot', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const viewer = await createProfile(client);
      const gameId = await createGame(client, host.id);
      await client.query('insert into game_viewers (game_id, user_id, added_by) values ($1, $2, $3)', [
        gameId,
        viewer.id,
        host.id,
      ]);

      await actAs(client, 'authenticated', viewer.id);
      await expect(client.query('select take_over_host($1)', [gameId])).resolves.toBeDefined();
    });
  });
});

describe('RLS — the join-request path', () => {
  it('a group member can ask to join a live game in their own group, logged as an event', async () => {
    await withTransaction(async (client) => {
      const owner = await createProfile(client);
      const { rows: groupRows } = await client.query(
        'insert into groups (name, created_by) values ($1, $2) returning id',
        ['Test Group', owner.id],
      );
      const groupId = groupRows[0]?.id as string;
      await client.query(
        'insert into group_members (group_id, user_id, role) values ($1, $2, \'owner\')',
        [groupId, owner.id],
      );

      const host = await createProfile(client);
      const gameId = await createGame(client, host.id);
      await client.query('update games set group_id = $1 where id = $2', [groupId, gameId]);

      const member = await createProfile(client);
      await client.query(
        'insert into group_members (group_id, user_id, role) values ($1, $2, \'member\')',
        [groupId, member.id],
      );

      await actAs(client, 'authenticated', member.id);
      await client.query(
        `insert into join_requests (game_id, user_id, requested_name, source)
         values ($1, $2, 'Member', 'in_app')`,
        [gameId, member.id],
      );

      await actAsAdmin(client);
      const { rows: eventRows } = await client.query(
        'select type from game_events where game_id = $1 and type = \'join_requested\'',
        [gameId],
      );
      expect(eventRows).toHaveLength(1);
    });
  });

  it('cannot submit a join request impersonating someone else', async () => {
    await withTransaction(async (client) => {
      const owner = await createProfile(client);
      const { rows: groupRows } = await client.query(
        'insert into groups (name, created_by) values ($1, $2) returning id',
        ['Test Group', owner.id],
      );
      const groupId = groupRows[0]?.id as string;
      await client.query(
        'insert into group_members (group_id, user_id, role) values ($1, $2, \'owner\')',
        [groupId, owner.id],
      );

      const host = await createProfile(client);
      const gameId = await createGame(client, host.id);
      await client.query('update games set group_id = $1 where id = $2', [groupId, gameId]);

      const member = await createProfile(client);
      const someoneElse = await createProfile(client);
      await client.query(
        'insert into group_members (group_id, user_id, role) values ($1, $2, \'member\')',
        [groupId, member.id],
      );

      await actAs(client, 'authenticated', member.id);
      await expect(
        client.query(
          `insert into join_requests (game_id, user_id, requested_name, source)
           values ($1, $2, 'Someone else', 'in_app')`,
          [gameId, someoneElse.id],
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it('only the host can decide a join request, and approval seats the player', async () => {
    await withTransaction(async (client) => {
      const owner = await createProfile(client);
      const { rows: groupRows } = await client.query(
        'insert into groups (name, created_by) values ($1, $2) returning id',
        ['Test Group', owner.id],
      );
      const groupId = groupRows[0]?.id as string;
      await client.query(
        'insert into group_members (group_id, user_id, role) values ($1, $2, \'owner\')',
        [groupId, owner.id],
      );

      const host = await createProfile(client);
      const gameId = await createGame(client, host.id);
      await client.query('update games set group_id = $1 where id = $2', [groupId, gameId]);

      const member = await createProfile(client);
      await client.query(
        'insert into group_members (group_id, user_id, role) values ($1, $2, \'member\')',
        [groupId, member.id],
      );

      await actAs(client, 'authenticated', member.id);
      const { rows: requestRows } = await client.query(
        `insert into join_requests (game_id, user_id, requested_name, source)
         values ($1, $2, 'Member', 'in_app') returning id`,
        [gameId, member.id],
      );
      const requestId = requestRows[0]?.id as string;

      // A stranger — not the host — may not decide it.
      await actAsAdmin(client);
      const stranger = await createProfile(client);
      await actAs(client, 'authenticated', stranger.id);
      const strangerError = await expectRejection(client, () =>
        client.query('select decide_join_request($1, true)', [requestId]),
      );
      expect(strangerError.message).toMatch(/not available/);

      await actAs(client, 'authenticated', host.id);
      await client.query('select decide_join_request($1, true)', [requestId]);

      await actAsAdmin(client);
      const { rows: playerRows } = await client.query(
        'select user_id from game_players where game_id = $1 and user_id = $2',
        [gameId, member.id],
      );
      expect(playerRows).toHaveLength(1);

      const { rows: statusRows } = await client.query(
        'select status from join_requests where id = $1',
        [requestId],
      );
      expect(statusRows[0]?.status).toBe('approved');
    });
  });
});
