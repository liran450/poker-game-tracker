import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
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

describe('find_user_by_username (03-data-model.md#joining-a-group)', () => {
  it('returns the exact match, three display columns only', async () => {
    await withTransaction(async (client) => {
      const caller = await createProfile(client);
      const target = await createProfile(client, { username: 'mor_l', displayName: 'מור לוי' });

      await actAs(client, 'authenticated', caller.id);
      const { rows } = await client.query(
        'select * from find_user_by_username($1)',
        ['mor_l'],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(target.id);
      expect(rows[0].username).toBe('mor_l');
      expect(rows[0].display_name).toBe('מור לוי');
    });
  });

  it('returns nothing on a partial match — no prefix or fuzzy search', async () => {
    await withTransaction(async (client) => {
      const caller = await createProfile(client);
      await createProfile(client, { username: 'mor_levi' });

      await actAs(client, 'authenticated', caller.id);
      const { rows } = await client.query('select * from find_user_by_username($1)', ['mor']);
      expect(rows).toHaveLength(0);
    });
  });

  it('returns nothing for an unknown username, not an error', async () => {
    await withTransaction(async (client) => {
      const caller = await createProfile(client);
      await actAs(client, 'authenticated', caller.id);
      const { rows } = await client.query('select * from find_user_by_username($1)', ['nobody']);
      expect(rows).toHaveLength(0);
    });
  });

  it('rejects an anonymous caller', async () => {
    await withTransaction(async (client) => {
      await createProfile(client, { username: 'mor_l' });
      await actAs(client, 'anon');
      const err = await expectRejection(client, () =>
        client.query('select * from find_user_by_username($1)', ['mor_l']),
      );
      expect(err.message).toMatch(/not available/);
    });
  });
});

describe('group creation and membership (03-data-model.md#joining-a-group)', () => {
  it('a group creator becomes its owner via the plain insert path', async () => {
    await withTransaction(async (client) => {
      const creator = await createProfile(client);
      await actAs(client, 'authenticated', creator.id);

      // The client generates the id itself and never relies on `returning` here — `groups_select`
      // is `is_group_member(id)`, which is false for the very row just inserted until the owner's
      // own group_members row exists too, so `insert ... returning` would hit the same RLS+RETURNING
      // gap docs/build/NOTES.md already documents for `games` (Postgres evaluates a table's SELECT
      // policy against a row a RETURNING insert just wrote, and membership genuinely doesn't exist
      // yet at that instant).
      const groupId = randomUUID();
      await client.query(
        'insert into groups (id, name, created_by) values ($1, $2, $3)',
        [groupId, 'Test Group', creator.id],
      );
      await client.query(
        "insert into group_members (group_id, user_id, role) values ($1, $2, 'owner')",
        [groupId, creator.id],
      );

      const { rows } = await client.query(
        'select role from group_members where group_id = $1 and user_id = $2',
        [groupId, creator.id],
      );
      expect(rows[0].role).toBe('owner');
    });
  });

  it('no membership row can be created without an accepted invite — a raw insert by a non-creator fails', async () => {
    await withTransaction(async (client) => {
      const owner = await createProfile(client);
      const outsider = await createProfile(client);
      const group = await createGroup(client, owner.id);

      await actAs(client, 'authenticated', outsider.id);
      const err = await expectRejection(client, () =>
        client.query(
          "insert into group_members (group_id, user_id, role) values ($1, $2, 'member')",
          [group.id, outsider.id],
        ),
      );
      expect(err).toBeTruthy();

      await actAsAdmin(client);
      const { rows } = await client.query(
        'select 1 from group_members where group_id = $1 and user_id = $2',
        [group.id, outsider.id],
      );
      expect(rows).toHaveLength(0);
    });
  });

  it('even an owner/admin cannot raw-insert a member row — only respond_to_group_invite can', async () => {
    await withTransaction(async (client) => {
      const owner = await createProfile(client);
      const someone = await createProfile(client);
      const group = await createGroup(client, owner.id);

      await actAs(client, 'authenticated', owner.id);
      const err = await expectRejection(client, () =>
        client.query(
          "insert into group_members (group_id, user_id, role) values ($1, $2, 'member')",
          [group.id, someone.id],
        ),
      );
      expect(err).toBeTruthy();
    });
  });
});

describe('group invites — send, accept, decline, revoke (03-data-model.md#joining-a-group)', () => {
  it('the full accept path: invite, invitee accepts, a member row appears', async () => {
    await withTransaction(async (client) => {
      const owner = await createProfile(client);
      const invitee = await createProfile(client);
      const group = await createGroup(client, owner.id);

      await actAs(client, 'authenticated', owner.id);
      const { rows: inviteRows } = await client.query<{ id: string }>(
        `insert into group_invites (group_id, invited_user_id, invited_by)
         values ($1, $2, $3) returning id`,
        [group.id, invitee.id, owner.id],
      );
      const inviteId = inviteRows[0].id;

      await actAs(client, 'authenticated', invitee.id);
      await client.query('select respond_to_group_invite($1, true)', [inviteId]);

      await actAsAdmin(client);
      const { rows: memberRows } = await client.query(
        'select role from group_members where group_id = $1 and user_id = $2',
        [group.id, invitee.id],
      );
      expect(memberRows).toHaveLength(1);
      expect(memberRows[0].role).toBe('member');

      const { rows: statusRows } = await client.query(
        'select status from group_invites where id = $1',
        [inviteId],
      );
      expect(statusRows[0].status).toBe('accepted');
    });
  });

  it('declining leaves no member row', async () => {
    await withTransaction(async (client) => {
      const owner = await createProfile(client);
      const invitee = await createProfile(client);
      const group = await createGroup(client, owner.id);

      await actAs(client, 'authenticated', owner.id);
      const { rows: inviteRows } = await client.query<{ id: string }>(
        `insert into group_invites (group_id, invited_user_id, invited_by)
         values ($1, $2, $3) returning id`,
        [group.id, invitee.id, owner.id],
      );
      const inviteId = inviteRows[0].id;

      await actAs(client, 'authenticated', invitee.id);
      await client.query('select respond_to_group_invite($1, false)', [inviteId]);

      await actAsAdmin(client);
      const { rows: memberRows } = await client.query(
        'select 1 from group_members where group_id = $1 and user_id = $2',
        [group.id, invitee.id],
      );
      expect(memberRows).toHaveLength(0);
      const { rows: statusRows } = await client.query(
        'select status from group_invites where id = $1',
        [inviteId],
      );
      expect(statusRows[0].status).toBe('declined');
    });
  });

  it('only the invitee may accept — a group admin cannot accept on their behalf', async () => {
    await withTransaction(async (client) => {
      const owner = await createProfile(client);
      const invitee = await createProfile(client);
      const group = await createGroup(client, owner.id);

      await actAs(client, 'authenticated', owner.id);
      const { rows: inviteRows } = await client.query<{ id: string }>(
        `insert into group_invites (group_id, invited_user_id, invited_by)
         values ($1, $2, $3) returning id`,
        [group.id, invitee.id, owner.id],
      );
      const inviteId = inviteRows[0].id;

      const err = await expectRejection(client, () =>
        client.query('select respond_to_group_invite($1, true)', [inviteId]),
      );
      expect(err.message).toMatch(/not available/);
    });
  });

  it('only the owner/admin may revoke, and only while pending', async () => {
    await withTransaction(async (client) => {
      const owner = await createProfile(client);
      const invitee = await createProfile(client);
      const outsider = await createProfile(client);
      const group = await createGroup(client, owner.id);

      await actAs(client, 'authenticated', owner.id);
      const { rows: inviteRows } = await client.query<{ id: string }>(
        `insert into group_invites (group_id, invited_user_id, invited_by)
         values ($1, $2, $3) returning id`,
        [group.id, invitee.id, owner.id],
      );
      const inviteId = inviteRows[0].id;

      await actAs(client, 'authenticated', outsider.id);
      const err = await expectRejection(client, () =>
        client.query('select revoke_group_invite($1)', [inviteId]),
      );
      expect(err.message).toMatch(/not available/);

      await actAs(client, 'authenticated', owner.id);
      await client.query('select revoke_group_invite($1)', [inviteId]);

      await actAsAdmin(client);
      const { rows: statusRows } = await client.query(
        'select status from group_invites where id = $1',
        [inviteId],
      );
      expect(statusRows[0].status).toBe('revoked');

      await actAs(client, 'authenticated', invitee.id);
      const acceptErr = await expectRejection(client, () =>
        client.query('select respond_to_group_invite($1, true)', [inviteId]),
      );
      expect(acceptErr.message).toMatch(/not available/);
    });
  });

  it('one open invite per person — a second pending invite to the same username fails', async () => {
    await withTransaction(async (client) => {
      const owner = await createProfile(client);
      const invitee = await createProfile(client);
      const group = await createGroup(client, owner.id);

      await actAs(client, 'authenticated', owner.id);
      await client.query(
        'insert into group_invites (group_id, invited_user_id, invited_by) values ($1, $2, $3)',
        [group.id, invitee.id, owner.id],
      );
      const err = await expectRejection(client, () =>
        client.query(
          'insert into group_invites (group_id, invited_user_id, invited_by) values ($1, $2, $3)',
          [group.id, invitee.id, owner.id],
        ),
      );
      expect(err).toBeTruthy();
    });
  });
});

describe('promotion, demotion and ownership transfer (03-data-model.md#group-roles)', () => {
  it('an owner can promote a member to admin', async () => {
    await withTransaction(async (client) => {
      const owner = await createProfile(client);
      const member = await createProfile(client);
      const group = await createGroup(client, owner.id, [member.id]);

      await actAs(client, 'authenticated', owner.id);
      await client.query('select promote_group_member($1, $2)', [group.id, member.id]);

      await actAsAdmin(client);
      const { rows } = await client.query(
        'select role from group_members where group_id = $1 and user_id = $2',
        [group.id, member.id],
      );
      expect(rows[0].role).toBe('admin');
    });
  });

  it('an admin can also promote a member to admin', async () => {
    await withTransaction(async (client) => {
      const owner = await createProfile(client);
      const admin = await createProfile(client);
      const member = await createProfile(client);
      const group = await createGroup(client, owner.id, [admin.id, member.id]);
      await client.query(
        "update group_members set role = 'admin' where group_id = $1 and user_id = $2",
        [group.id, admin.id],
      );

      await actAs(client, 'authenticated', admin.id);
      await client.query('select promote_group_member($1, $2)', [group.id, member.id]);

      await actAsAdmin(client);
      const { rows } = await client.query(
        'select role from group_members where group_id = $1 and user_id = $2',
        [group.id, member.id],
      );
      expect(rows[0].role).toBe('admin');
    });
  });

  it('a plain member cannot promote anyone', async () => {
    await withTransaction(async (client) => {
      const owner = await createProfile(client);
      const member = await createProfile(client);
      const other = await createProfile(client);
      const group = await createGroup(client, owner.id, [member.id, other.id]);

      await actAs(client, 'authenticated', member.id);
      const err = await expectRejection(client, () =>
        client.query('select promote_group_member($1, $2)', [group.id, other.id]),
      );
      expect(err.message).toMatch(/not available/);
    });
  });

  it('only the owner may demote an admin — an admin cannot demote another admin', async () => {
    await withTransaction(async (client) => {
      const owner = await createProfile(client);
      const adminA = await createProfile(client);
      const adminB = await createProfile(client);
      const group = await createGroup(client, owner.id, [adminA.id, adminB.id]);
      await client.query(
        "update group_members set role = 'admin' where group_id = $1 and user_id in ($2, $3)",
        [group.id, adminA.id, adminB.id],
      );

      await actAs(client, 'authenticated', adminA.id);
      const err = await expectRejection(client, () =>
        client.query('select demote_group_admin($1, $2)', [group.id, adminB.id]),
      );
      expect(err.message).toMatch(/not available/);

      await actAs(client, 'authenticated', owner.id);
      await client.query('select demote_group_admin($1, $2)', [group.id, adminB.id]);

      await actAsAdmin(client);
      const { rows } = await client.query(
        'select role from group_members where group_id = $1 and user_id = $2',
        [group.id, adminB.id],
      );
      expect(rows[0].role).toBe('member');
    });
  });

  it('no path demotes or removes the owner — neither RPC accepts the owner as a target', async () => {
    await withTransaction(async (client) => {
      const owner = await createProfile(client);
      const admin = await createProfile(client);
      const group = await createGroup(client, owner.id, [admin.id]);
      await client.query(
        "update group_members set role = 'admin' where group_id = $1 and user_id = $2",
        [group.id, admin.id],
      );

      await actAs(client, 'authenticated', admin.id);
      const demoteErr = await expectRejection(client, () =>
        client.query('select demote_group_admin($1, $2)', [group.id, owner.id]),
      );
      expect(demoteErr.message).toMatch(/not available/);

      // RLS on a delete/update just matches zero rows rather than raising — `role <> 'owner'` in
      // both policies' `using` clause excludes the owner's row outright, so these are silent
      // no-ops, not errors. Assert on the affected row count and the unchanged end state instead
      // of expecting a thrown rejection.
      const deleteResult = await client.query(
        'delete from group_members where group_id = $1 and user_id = $2',
        [group.id, owner.id],
      );
      expect(deleteResult.rowCount).toBe(0);

      const updateResult = await client.query(
        "update group_members set role = 'member' where group_id = $1 and user_id = $2",
        [group.id, owner.id],
      );
      expect(updateResult.rowCount).toBe(0);

      await actAsAdmin(client);
      const { rows } = await client.query(
        'select role from group_members where group_id = $1 and user_id = $2',
        [group.id, owner.id],
      );
      expect(rows[0].role).toBe('owner');
    });
  });

  it('transferring ownership makes the target the owner and the old owner an admin', async () => {
    await withTransaction(async (client) => {
      const owner = await createProfile(client);
      const member = await createProfile(client);
      const group = await createGroup(client, owner.id, [member.id]);

      await actAs(client, 'authenticated', owner.id);
      await client.query('select transfer_group_ownership($1, $2)', [group.id, member.id]);

      await actAsAdmin(client);
      const { rows } = await client.query(
        'select user_id, role from group_members where group_id = $1 order by role',
        [group.id],
      );
      const byUser = new Map(rows.map((r: { user_id: string; role: string }) => [r.user_id, r.role]));
      expect(byUser.get(member.id)).toBe('owner');
      expect(byUser.get(owner.id)).toBe('admin');
    });
  });

  it('only the owner may transfer ownership, and only to an existing member', async () => {
    await withTransaction(async (client) => {
      const owner = await createProfile(client);
      const admin = await createProfile(client);
      const outsider = await createProfile(client);
      const group = await createGroup(client, owner.id, [admin.id]);
      await client.query(
        "update group_members set role = 'admin' where group_id = $1 and user_id = $2",
        [group.id, admin.id],
      );

      await actAs(client, 'authenticated', admin.id);
      const notOwnerErr = await expectRejection(client, () =>
        client.query('select transfer_group_ownership($1, $2)', [group.id, admin.id]),
      );
      expect(notOwnerErr.message).toMatch(/not available/);

      await actAs(client, 'authenticated', owner.id);
      const notMemberErr = await expectRejection(client, () =>
        client.query('select transfer_group_ownership($1, $2)', [group.id, outsider.id]),
      );
      expect(notMemberErr.message).toMatch(/not available/);
    });
  });
});

describe('leaving a group (03-data-model.md#joining-a-group)', () => {
  it('a member can leave without anyone else approving', async () => {
    await withTransaction(async (client) => {
      const owner = await createProfile(client);
      const member = await createProfile(client);
      const group = await createGroup(client, owner.id, [member.id]);

      await actAs(client, 'authenticated', member.id);
      await client.query('delete from group_members where group_id = $1 and user_id = $2', [
        group.id,
        member.id,
      ]);

      await actAsAdmin(client);
      const { rows } = await client.query(
        'select 1 from group_members where group_id = $1 and user_id = $2',
        [group.id, member.id],
      );
      expect(rows).toHaveLength(0);
    });
  });

  it('the owner cannot leave — must transfer ownership first', async () => {
    await withTransaction(async (client) => {
      const owner = await createProfile(client);
      const group = await createGroup(client, owner.id);

      await actAs(client, 'authenticated', owner.id);
      // No-op, not a rejection — see the identical note above: `role <> 'owner'` in
      // `group_members_delete`'s own `using` clause excludes the owner's own row.
      const result = await client.query(
        'delete from group_members where group_id = $1 and user_id = $2',
        [group.id, owner.id],
      );
      expect(result.rowCount).toBe(0);
    });
  });
});

describe('adding someone to a game never adds them to the group (01-product-spec.md)', () => {
  it('approving a join request seats a player without touching group_members', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const member = await createProfile(client);
      const group = await createGroup(client, host.id, [member.id]);
      const gameId = await createGame(client, host.id);
      await setGameGroup(client, gameId, group.id);
      await client.query("update games set status = 'active' where id = $1", [gameId]);

      await actAs(client, 'authenticated', member.id);
      await client.query(
        `insert into join_requests (game_id, user_id, requested_name, requested_role, source)
         values ($1, $2, 'Member', 'player', 'in_app')`,
        [gameId, member.id],
      );

      await actAsAdmin(client);
      const { rows: beforeRows } = await client.query(
        'select role from group_members where group_id = $1 and user_id = $2',
        [group.id, member.id],
      );
      expect(beforeRows[0].role).toBe('member');

      const { rows: reqRows } = await client.query(
        'select id from join_requests where game_id = $1 and user_id = $2',
        [gameId, member.id],
      );

      await actAs(client, 'authenticated', host.id);
      await client.query('select decide_join_request($1, true)', [reqRows[0].id]);

      await actAsAdmin(client);
      const { rows: afterRows } = await client.query(
        'select role from group_members where group_id = $1 and user_id = $2',
        [group.id, member.id],
      );
      expect(afterRows[0].role).toBe('member');
      expect(afterRows).toHaveLength(1);
    });
  });
});

describe('share_links insert rejects a non-host caller on a private game (docs/build/PLAN.md step 14 exit criterion)', () => {
  it('a seated non-host player cannot create a share link on a private game', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const player = await createProfile(client);
      const gameId = await createGame(client, host.id);
      await client.query('update games set is_private = true where id = $1', [gameId]);
      await addPlayer(client, gameId, host.id, player.id);

      await actAs(client, 'authenticated', player.id);
      const err = await expectRejection(client, () =>
        client.query(
          `insert into share_links (game_id, token_hash, token_prefix, created_by)
           values ($1, decode(repeat('00', 32), 'hex'), 'abcd1234', $2)`,
          [gameId, player.id],
        ),
      );
      expect(err).toBeTruthy();
    });
  });

  it('the host can create a share link on a private game', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const gameId = await createGame(client, host.id);
      await client.query('update games set is_private = true where id = $1', [gameId]);

      await actAs(client, 'authenticated', host.id);
      await client.query(
        `insert into share_links (game_id, token_hash, token_prefix, created_by)
         values ($1, decode(repeat('00', 32), 'hex'), 'abcd1234', $2)`,
        [gameId, host.id],
      );

      await actAsAdmin(client);
      const { rows } = await client.query('select 1 from share_links where game_id = $1', [gameId]);
      expect(rows).toHaveLength(1);
    });
  });
});

describe('invite_player_to_game — the private-game player-invite path (03-data-model.md#private-games)', () => {
  it('a current player (not just the host) can invite a fellow group member, logging the event', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const seated = await createProfile(client);
      const target = await createProfile(client);
      const group = await createGroup(client, host.id, [seated.id, target.id]);
      const gameId = await createGame(client, host.id);
      await setGameGroup(client, gameId, group.id);
      await addPlayer(client, gameId, host.id, seated.id);

      await actAs(client, 'authenticated', seated.id);
      await client.query('select invite_player_to_game($1, $2)', [gameId, target.id]);

      await actAsAdmin(client);
      const { rows } = await client.query(
        "select * from game_events where game_id = $1 and type = 'player_invited'",
        [gameId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].payload.userId).toBe(target.id);
      expect(rows[0].payload.invitedBy).toBe(seated.id);
    });
  });

  it('rejects someone who is neither the host nor a seated player', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const outsider = await createProfile(client);
      const target = await createProfile(client);
      const group = await createGroup(client, host.id, [outsider.id, target.id]);
      const gameId = await createGame(client, host.id);
      await setGameGroup(client, gameId, group.id);

      await actAs(client, 'authenticated', outsider.id);
      const err = await expectRejection(client, () =>
        client.query('select invite_player_to_game($1, $2)', [gameId, target.id]),
      );
      expect(err.message).toMatch(/not available/);
    });
  });

  it("rejects a target who is not in the game's group", async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const target = await createProfile(client);
      const group = await createGroup(client, host.id);
      const gameId = await createGame(client, host.id);
      await setGameGroup(client, gameId, group.id);

      await actAs(client, 'authenticated', host.id);
      const err = await expectRejection(client, () =>
        client.query('select invite_player_to_game($1, $2)', [gameId, target.id]),
      );
      expect(err.message).toMatch(/not available/);
    });
  });

  it('rejects when the game has no group at all', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const target = await createProfile(client);
      const gameId = await createGame(client, host.id);

      await actAs(client, 'authenticated', host.id);
      const err = await expectRejection(client, () =>
        client.query('select invite_player_to_game($1, $2)', [gameId, target.id]),
      );
      expect(err.message).toMatch(/not available/);
    });
  });
});
