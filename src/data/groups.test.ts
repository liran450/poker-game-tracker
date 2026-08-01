import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  createGroup,
  demoteGroupAdmin,
  findUserByUsername,
  getGroup,
  getGroupLiveGames,
  inviteToGroup,
  invitePlayerToGame,
  listGroupMembers,
  listMyGroups,
  listMyPendingInvites,
  listPendingInvitesForGroup,
  promoteGroupMember,
  removeGroupMember,
  respondToGroupInvite,
  revokeGroupInvite,
  transferGroupOwnership,
  updateGroup,
} from './groups';
import { FakePostgrestClient } from './testSupport/fakePostgrestClient';

function client(fake: FakePostgrestClient): SupabaseClient {
  return fake as unknown as SupabaseClient;
}

describe('createGroup', () => {
  it('inserts the group row and an owner group_members row', async () => {
    const fake = new FakePostgrestClient();
    const group = await createGroup({ name: '  הפוקר של יום חמישי  ', createdBy: 'u1' }, client(fake));

    expect(group.name).toBe('הפוקר של יום חמישי');
    expect(group.currency).toBe('ILS');
    expect(group.defaultBuyAmountMinor).toBe(5000);
    expect(group.defaultChipsPerBuy).toBe(100);

    const [groupRow] = fake.rows('groups');
    expect(groupRow?.id).toBe(group.id);
    expect(groupRow?.created_by).toBe('u1');

    const [memberRow] = fake.rows('group_members');
    expect(memberRow?.group_id).toBe(group.id);
    expect(memberRow?.user_id).toBe('u1');
    expect(memberRow?.role).toBe('owner');
  });

  it('honours explicit defaults over the built-in ones', async () => {
    const fake = new FakePostgrestClient();
    const group = await createGroup(
      { name: 'g', createdBy: 'u1', currency: 'USD', defaultBuyAmountMinor: 2000, defaultChipsPerBuy: 40 },
      client(fake),
    );
    expect(group.currency).toBe('USD');
    expect(group.defaultBuyAmountMinor).toBe(2000);
    expect(group.defaultChipsPerBuy).toBe(40);
  });
});

describe('listMyGroups / getGroup / updateGroup / deleteGroup', () => {
  it('lists and reads groups, and updates only the given fields', async () => {
    const fake = new FakePostgrestClient();
    fake.seed('groups', [
      {
        id: 'g1',
        name: 'Group One',
        created_by: 'u1',
        currency: 'ILS',
        default_buy_amount_minor: 5000,
        default_chips_per_buy: 100,
        created_at: '2026-08-01T00:00:00Z',
      },
    ]);

    const groups = await listMyGroups(client(fake));
    expect(groups).toHaveLength(1);
    expect(groups[0]!.name).toBe('Group One');

    const found = await getGroup('g1', client(fake));
    expect(found?.id).toBe('g1');
    expect(await getGroup('missing', client(fake))).toBeNull();

    await updateGroup('g1', { name: 'Renamed' }, client(fake));
    const [row] = fake.rows('groups');
    expect(row?.name).toBe('Renamed');
    expect(row?.default_buy_amount_minor).toBe(5000);
  });
});

describe('listGroupMembers', () => {
  it('returns members of the given group only', async () => {
    const fake = new FakePostgrestClient();
    fake.seed('group_members', [
      { group_id: 'g1', user_id: 'u1', role: 'owner', joined_at: '2026-08-01T00:00:00Z' },
      { group_id: 'g1', user_id: 'u2', role: 'member', joined_at: '2026-08-01T00:00:00Z' },
      { group_id: 'g2', user_id: 'u3', role: 'owner', joined_at: '2026-08-01T00:00:00Z' },
    ]);
    const members = await listGroupMembers('g1', client(fake));
    expect(members.map((m) => m.userId).sort()).toEqual(['u1', 'u2']);
  });
});

describe('findUserByUsername', () => {
  it('returns the match', async () => {
    const fake = new FakePostgrestClient();
    fake.onRpc('find_user_by_username', (args) => {
      expect(args.p_username).toBe('mor_l');
      return {
        data: [{ id: 'u1', username: 'mor_l', display_name: 'מור לוי', avatar_url: null }],
        error: null,
      };
    });
    const result = await findUserByUsername('mor_l', client(fake));
    expect(result).toEqual({ id: 'u1', username: 'mor_l', displayName: 'מור לוי', avatarUrl: null });
  });

  it('returns null when nothing matches', async () => {
    const fake = new FakePostgrestClient();
    fake.onRpc('find_user_by_username', () => ({ data: [], error: null }));
    expect(await findUserByUsername('nobody', client(fake))).toBeNull();
  });
});

describe('invites', () => {
  it('inviteToGroup inserts a pending invite row', async () => {
    const fake = new FakePostgrestClient();
    await inviteToGroup('g1', 'u2', 'u1', client(fake));
    const [row] = fake.rows('group_invites');
    expect(row?.group_id).toBe('g1');
    expect(row?.invited_user_id).toBe('u2');
    expect(row?.invited_by).toBe('u1');
  });

  it('listPendingInvitesForGroup filters by group and status', async () => {
    const fake = new FakePostgrestClient();
    fake.seed('group_invites', [
      {
        id: 'i1',
        group_id: 'g1',
        invited_user_id: 'u2',
        invited_by: 'u1',
        status: 'pending',
        created_at: '2026-08-01T00:00:00Z',
        decided_at: null,
      },
      {
        id: 'i2',
        group_id: 'g1',
        invited_user_id: 'u3',
        invited_by: 'u1',
        status: 'accepted',
        created_at: '2026-08-01T00:00:00Z',
        decided_at: '2026-08-01T00:00:00Z',
      },
    ]);
    const pending = await listPendingInvitesForGroup('g1', client(fake));
    expect(pending).toHaveLength(1);
    expect(pending[0]!.id).toBe('i1');
  });

  it('listMyPendingInvites attaches the group name', async () => {
    const fake = new FakePostgrestClient();
    fake.seed('group_invites', [
      {
        id: 'i1',
        group_id: 'g1',
        invited_user_id: 'u2',
        invited_by: 'u1',
        status: 'pending',
        created_at: '2026-08-01T00:00:00Z',
        decided_at: null,
      },
    ]);
    fake.seed('groups', [
      {
        id: 'g1',
        name: 'הפוקר של יום חמישי',
        created_by: 'u1',
        currency: 'ILS',
        default_buy_amount_minor: 5000,
        default_chips_per_buy: 100,
        created_at: '2026-08-01T00:00:00Z',
      },
    ]);
    const invites = await listMyPendingInvites('u2', client(fake));
    expect(invites).toHaveLength(1);
    expect(invites[0]!.groupName).toBe('הפוקר של יום חמישי');
  });

  it('listMyPendingInvites returns an empty list without querying groups', async () => {
    const fake = new FakePostgrestClient();
    const invites = await listMyPendingInvites('u2', client(fake));
    expect(invites).toEqual([]);
  });

  it('respondToGroupInvite and revokeGroupInvite call the matching rpc', async () => {
    const fake = new FakePostgrestClient();
    fake.onRpc('respond_to_group_invite', (args) => {
      expect(args).toEqual({ p_invite_id: 'i1', p_accept: true });
      return { data: null, error: null };
    });
    await respondToGroupInvite('i1', true, client(fake));

    fake.onRpc('revoke_group_invite', (args) => {
      expect(args).toEqual({ p_invite_id: 'i1' });
      return { data: null, error: null };
    });
    await revokeGroupInvite('i1', client(fake));
  });
});

describe('roles', () => {
  it('promoteGroupMember / demoteGroupAdmin / transferGroupOwnership call the matching rpc', async () => {
    const fake = new FakePostgrestClient();
    fake.onRpc('promote_group_member', (args) => {
      expect(args).toEqual({ p_group_id: 'g1', p_user_id: 'u2' });
      return { data: null, error: null };
    });
    await promoteGroupMember('g1', 'u2', client(fake));

    fake.onRpc('demote_group_admin', (args) => {
      expect(args).toEqual({ p_group_id: 'g1', p_user_id: 'u2' });
      return { data: null, error: null };
    });
    await demoteGroupAdmin('g1', 'u2', client(fake));

    fake.onRpc('transfer_group_ownership', (args) => {
      expect(args).toEqual({ p_group_id: 'g1', p_new_owner_id: 'u2' });
      return { data: null, error: null };
    });
    await transferGroupOwnership('g1', 'u2', client(fake));
  });

  it('removeGroupMember deletes the member row', async () => {
    const fake = new FakePostgrestClient();
    fake.seed('group_members', [
      { group_id: 'g1', user_id: 'u1', role: 'owner', joined_at: '2026-08-01T00:00:00Z' },
      { group_id: 'g1', user_id: 'u2', role: 'member', joined_at: '2026-08-01T00:00:00Z' },
    ]);
    await removeGroupMember('g1', 'u2', client(fake));
    expect(fake.rows('group_members').map((r) => r.user_id)).toEqual(['u1']);
  });
});

describe('getGroupLiveGames / invitePlayerToGame', () => {
  it('maps the live-games rpc result', async () => {
    const fake = new FakePostgrestClient();
    fake.onRpc('get_group_live_games', (args) => {
      expect(args).toEqual({ p_group_id: 'g1' });
      return {
        data: [
          { game_id: 'game1', name: 'Live', host_display_name: 'מור', player_count: 4, started_at: '2026-08-01T00:00:00Z' },
        ],
        error: null,
      };
    });
    const games = await getGroupLiveGames('g1', client(fake));
    expect(games).toEqual([
      { gameId: 'game1', name: 'Live', hostDisplayName: 'מור', playerCount: 4, startedAt: '2026-08-01T00:00:00Z' },
    ]);
  });

  it('invitePlayerToGame calls the matching rpc', async () => {
    const fake = new FakePostgrestClient();
    fake.onRpc('invite_player_to_game', (args) => {
      expect(args).toEqual({ p_game_id: 'game1', p_user_id: 'u2' });
      return { data: null, error: null };
    });
    await invitePlayerToGame('game1', 'u2', client(fake));
  });
});
