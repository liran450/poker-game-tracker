import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

/**
 * Groups (03-data-model.md#groups--חבורה) — the recurring circle of friends. Schema and RLS
 * already existed since step 10 (`groups`/`group_members`/`group_invites`); this module is the
 * first client caller, wrapping step 14's migration
 * (`supabase/migrations/20260801120000_step14_groups.sql`) — plain RLS-gated reads/writes where
 * one suffices, the audited RPCs where a transition needs one (accepting an invite, promoting,
 * demoting, transferring ownership).
 */

export type GroupRole = 'owner' | 'admin' | 'member';
export type GroupInviteStatus = 'pending' | 'accepted' | 'declined' | 'revoked';

export interface Group {
  readonly id: string;
  readonly name: string;
  readonly createdBy: string;
  readonly currency: string;
  readonly defaultBuyAmountMinor: number;
  readonly defaultChipsPerBuy: number;
  readonly createdAt: string;
}

export interface GroupMember {
  readonly groupId: string;
  readonly userId: string;
  readonly role: GroupRole;
  readonly joinedAt: string;
}

export interface GroupInvite {
  readonly id: string;
  readonly groupId: string;
  readonly invitedUserId: string;
  readonly invitedBy: string;
  readonly status: GroupInviteStatus;
  readonly createdAt: string;
  readonly decidedAt: string | null;
}

export interface PendingGroupInvite extends GroupInvite {
  readonly groupName: string;
}

export interface UsernameSearchResult {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
}

export interface GroupLiveGame {
  readonly gameId: string;
  readonly name: string;
  readonly hostDisplayName: string;
  readonly playerCount: number;
  readonly startedAt: string | null;
}

interface GroupRow {
  readonly id: string;
  readonly name: string;
  readonly created_by: string;
  readonly currency: string;
  readonly default_buy_amount_minor: number;
  readonly default_chips_per_buy: number;
  readonly created_at: string;
}

interface GroupMemberRow {
  readonly group_id: string;
  readonly user_id: string;
  readonly role: GroupRole;
  readonly joined_at: string;
}

interface GroupInviteRow {
  readonly id: string;
  readonly group_id: string;
  readonly invited_user_id: string;
  readonly invited_by: string;
  readonly status: GroupInviteStatus;
  readonly created_at: string;
  readonly decided_at: string | null;
}

function toGroup(row: GroupRow): Group {
  return {
    id: row.id,
    name: row.name,
    createdBy: row.created_by,
    currency: row.currency,
    defaultBuyAmountMinor: row.default_buy_amount_minor,
    defaultChipsPerBuy: row.default_chips_per_buy,
    createdAt: row.created_at,
  };
}

function toGroupMember(row: GroupMemberRow): GroupMember {
  return { groupId: row.group_id, userId: row.user_id, role: row.role, joinedAt: row.joined_at };
}

function toGroupInvite(row: GroupInviteRow): GroupInvite {
  return {
    id: row.id,
    groupId: row.group_id,
    invitedUserId: row.invited_user_id,
    invitedBy: row.invited_by,
    status: row.status,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  };
}

function requireClient(client: SupabaseClient | null = supabase): SupabaseClient {
  if (!client) {
    throw new Error(
      'groups: no Supabase client configured (VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY missing)',
    );
  }
  return client;
}

const GROUP_COLUMNS =
  'id, name, created_by, currency, default_buy_amount_minor, default_chips_per_buy, created_at';
const MEMBER_COLUMNS = 'group_id, user_id, role, joined_at';
const INVITE_COLUMNS = 'id, group_id, invited_user_id, invited_by, status, created_at, decided_at';

export interface CreateGroupInput {
  readonly name: string;
  readonly createdBy: string;
  readonly currency?: string;
  readonly defaultBuyAmountMinor?: number;
  readonly defaultChipsPerBuy?: number;
}

/**
 * Creates the group and its owner row in two plain inserts, not one RPC — `groups_insert` and
 * `group_members_insert_owner` already cover both, and the id is generated here (rather than
 * left to the column default) so the second insert never needs to read the first insert back.
 * That matters: `groups_select` is `is_group_member(id)`, false for this exact row until the
 * owner insert below completes, so `insert ... returning` would fail the same RLS+RETURNING gap
 * `docs/build/NOTES.md` documents for `games` (see `supabase/tests/groups.test.ts`).
 */
export async function createGroup(
  input: CreateGroupInput,
  client: SupabaseClient = requireClient(),
): Promise<Group> {
  const group: Group = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    createdBy: input.createdBy,
    currency: input.currency ?? 'ILS',
    defaultBuyAmountMinor: input.defaultBuyAmountMinor ?? 5000,
    defaultChipsPerBuy: input.defaultChipsPerBuy ?? 100,
    createdAt: new Date().toISOString(),
  };

  const { error: groupError } = await client.from('groups').insert({
    id: group.id,
    name: group.name,
    created_by: group.createdBy,
    currency: group.currency,
    default_buy_amount_minor: group.defaultBuyAmountMinor,
    default_chips_per_buy: group.defaultChipsPerBuy,
  });
  if (groupError) throw groupError;

  const { error: memberError } = await client.from('group_members').insert({
    group_id: group.id,
    user_id: group.createdBy,
    role: 'owner',
  });
  if (memberError) throw memberError;

  return group;
}

/** Every group the caller belongs to — `groups_select`'s RLS already scopes this, no filter needed. */
export async function listMyGroups(client: SupabaseClient = requireClient()): Promise<Group[]> {
  const { data, error } = await client.from('groups').select(GROUP_COLUMNS).returns<GroupRow[]>();
  if (error) throw error;
  return (data ?? []).map(toGroup);
}

export async function getGroup(
  groupId: string,
  client: SupabaseClient = requireClient(),
): Promise<Group | null> {
  const { data, error } = await client
    .from('groups')
    .select(GROUP_COLUMNS)
    .eq('id', groupId)
    .maybeSingle()
    .returns<GroupRow | null>();
  if (error) throw error;
  return data ? toGroup(data) : null;
}

export interface UpdateGroupInput {
  readonly name?: string;
  readonly defaultBuyAmountMinor?: number;
  readonly defaultChipsPerBuy?: number;
}

/** Owner/admin only, enforced by `groups_update`'s RLS, not by this function. */
export async function updateGroup(
  groupId: string,
  input: UpdateGroupInput,
  client: SupabaseClient = requireClient(),
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.defaultBuyAmountMinor !== undefined) patch.default_buy_amount_minor = input.defaultBuyAmountMinor;
  if (input.defaultChipsPerBuy !== undefined) patch.default_chips_per_buy = input.defaultChipsPerBuy;
  if (Object.keys(patch).length === 0) return;

  const { error } = await client.from('groups').update(patch).eq('id', groupId);
  if (error) throw error;
}

/** Owner-only, enforced by `groups_delete`'s RLS. */
export async function deleteGroup(
  groupId: string,
  client: SupabaseClient = requireClient(),
): Promise<void> {
  const { error } = await client.from('groups').delete().eq('id', groupId);
  if (error) throw error;
}

export async function listGroupMembers(
  groupId: string,
  client: SupabaseClient = requireClient(),
): Promise<GroupMember[]> {
  const { data, error } = await client
    .from('group_members')
    .select(MEMBER_COLUMNS)
    .eq('group_id', groupId)
    .returns<GroupMemberRow[]>();
  if (error) throw error;
  return (data ?? []).map(toGroupMember);
}

/** Exact match only (03-data-model.md#joining-a-group) — no prefix or fuzzy search. */
export async function findUserByUsername(
  username: string,
  client: SupabaseClient = requireClient(),
): Promise<UsernameSearchResult | null> {
  // Cast the whole result, not just `.returns<T[]>()` — supabase-js's typed builder rejects an
  // array cast here without a Database generic in scope (the codebase has none, matching every
  // other module in `src/data/`), and destructuring `{ data, error }` straight off the awaited
  // call while it's still `any` trips `@typescript-eslint/no-unsafe-assignment`. Casting the
  // whole response first, the same way `submitClaimViaLink`-style single casts are avoided by
  // staying off `.returns()`, sidesteps both for this genuinely multi-row RPC result.
  const result = (await client.rpc('find_user_by_username', { p_username: username.trim() })) as {
    data: { id: string; username: string; display_name: string; avatar_url: string | null }[] | null;
    error: Error | null;
  };
  if (result.error) throw result.error;
  const row = (result.data ?? [])[0];
  if (!row) return null;
  return { id: row.id, username: row.username, displayName: row.display_name, avatarUrl: row.avatar_url };
}

export async function inviteToGroup(
  groupId: string,
  invitedUserId: string,
  invitedBy: string,
  client: SupabaseClient = requireClient(),
): Promise<void> {
  const { error } = await client.from('group_invites').insert({
    group_id: groupId,
    invited_user_id: invitedUserId,
    invited_by: invitedBy,
  });
  if (error) throw error;
}

export async function listPendingInvitesForGroup(
  groupId: string,
  client: SupabaseClient = requireClient(),
): Promise<GroupInvite[]> {
  const { data, error } = await client
    .from('group_invites')
    .select(INVITE_COLUMNS)
    .eq('group_id', groupId)
    .eq('status', 'pending')
    .returns<GroupInviteRow[]>();
  if (error) throw error;
  return (data ?? []).map(toGroupInvite);
}

/**
 * The invitee's own pending invites, with the group's name attached — the home screen's "דנה
 * הזמינה אותך לחבורה" card (04-ux-spec.md#adding-a-group-member--invite-and-accept) needs the
 * name, not just an id. Two plain queries rather than a PostgREST embed: nothing else in this
 * codebase relies on embedded selects (see `docs/build/NOTES.md` on `fakePostgrestClient.ts`
 * only covering the query-builder surface actually used), and a batch `getGroup`-style lookup
 * keeps this module testable against the same fake as everything else in `src/data/`.
 */
export async function listMyPendingInvites(
  userId: string,
  client: SupabaseClient = requireClient(),
): Promise<PendingGroupInvite[]> {
  const { data, error } = await client
    .from('group_invites')
    .select(INVITE_COLUMNS)
    .eq('invited_user_id', userId)
    .eq('status', 'pending')
    .returns<GroupInviteRow[]>();
  if (error) throw error;
  const invites = (data ?? []).map(toGroupInvite);
  if (invites.length === 0) return [];

  const groupIds = [...new Set(invites.map((i) => i.groupId))];
  const { data: groupRows, error: groupError } = await client
    .from('groups')
    .select(GROUP_COLUMNS)
    .in('id', groupIds)
    .returns<GroupRow[]>();
  if (groupError) throw groupError;
  const namesById = new Map((groupRows ?? []).map((g) => [g.id, g.name]));

  return invites.map((invite) => ({ ...invite, groupName: namesById.get(invite.groupId) ?? '' }));
}

export async function respondToGroupInvite(
  inviteId: string,
  accept: boolean,
  client: SupabaseClient = requireClient(),
): Promise<void> {
  const { error } = await client.rpc('respond_to_group_invite', {
    p_invite_id: inviteId,
    p_accept: accept,
  });
  if (error) throw error;
}

export async function revokeGroupInvite(
  inviteId: string,
  client: SupabaseClient = requireClient(),
): Promise<void> {
  const { error } = await client.rpc('revoke_group_invite', { p_invite_id: inviteId });
  if (error) throw error;
}

export async function promoteGroupMember(
  groupId: string,
  userId: string,
  client: SupabaseClient = requireClient(),
): Promise<void> {
  const { error } = await client.rpc('promote_group_member', {
    p_group_id: groupId,
    p_user_id: userId,
  });
  if (error) throw error;
}

export async function demoteGroupAdmin(
  groupId: string,
  userId: string,
  client: SupabaseClient = requireClient(),
): Promise<void> {
  const { error } = await client.rpc('demote_group_admin', {
    p_group_id: groupId,
    p_user_id: userId,
  });
  if (error) throw error;
}

export async function transferGroupOwnership(
  groupId: string,
  newOwnerId: string,
  client: SupabaseClient = requireClient(),
): Promise<void> {
  const { error } = await client.rpc('transfer_group_ownership', {
    p_group_id: groupId,
    p_new_owner_id: newOwnerId,
  });
  if (error) throw error;
}

/**
 * Leaving and being removed are the same underlying write — a plain delete, RLS-gated
 * (`group_members_delete`) to "yourself" or "an owner/admin removing a non-owner". Kept as one
 * function since the two callers (a leave button on your own row, a remove button on someone
 * else's) differ only in whose id is passed, not in what happens.
 */
export async function removeGroupMember(
  groupId: string,
  userId: string,
  client: SupabaseClient = requireClient(),
): Promise<void> {
  const { error } = await client
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId);
  if (error) throw error;
}

/** The in-app half of "two paths in, one gate" (03-data-model.md#two-paths-in-one-gate). */
export async function getGroupLiveGames(
  groupId: string,
  client: SupabaseClient = requireClient(),
): Promise<GroupLiveGame[]> {
  // See findUserByUsername's comment — the whole result is cast, not `.returns()`, for a
  // multi-row RPC result without tripping the unsafe-destructuring-of-any lint.
  const result = (await client.rpc('get_group_live_games', { p_group_id: groupId })) as {
    data:
      | {
          game_id: string;
          name: string;
          host_display_name: string;
          player_count: number;
          started_at: string | null;
        }[]
      | null;
    error: Error | null;
  };
  if (result.error) throw result.error;
  const rows = result.data ?? [];
  return rows.map((row) => ({
    gameId: row.game_id,
    name: row.name,
    hostDisplayName: row.host_display_name,
    playerCount: row.player_count,
    startedAt: row.started_at,
  }));
}

/** The private-game player-invite path (03-data-model.md#private-games). */
export async function invitePlayerToGame(
  gameId: string,
  userId: string,
  client: SupabaseClient = requireClient(),
): Promise<void> {
  const { error } = await client.rpc('invite_player_to_game', { p_game_id: gameId, p_user_id: userId });
  if (error) throw error;
}
