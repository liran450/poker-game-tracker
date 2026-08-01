-- Step 14 — Groups, roles, private games (docs/build/PLAN.md).
--
-- The schema (groups/group_members/group_invites) and its RLS were both already built in step 10
-- (20260729120200_groups.sql, 20260729121100_rls_policies.sql) — step 10 built every table's core
-- shape and RLS in one pass, per docs/build/NOTES.md. What that migration's own comments point at
-- as still missing is exactly what this one adds: the audited RPCs a plain RLS policy can't be,
-- because they either need to write a row the caller has no general INSERT policy for
-- (accepting an invite — group_members has none, on purpose) or need to pick which of two
-- possible transitions is legal for which actor (group_invites_update's own comment: "which of
-- the two transitions is legal for which actor is enforced by the accept/decline/revoke RPCs
-- (step 14), not by this policy alone"). Plus `find_user_by_username`
-- (03-data-model.md#joining-a-group) and the private-game player-invite path
-- (03-data-model.md#private-games).

-- ---------------------------------------------------------------------------
-- find_user_by_username — 03-data-model.md#joining-a-group
-- ---------------------------------------------------------------------------
-- Exact match only, three display columns only, security definer so it can read past a
-- stranger's self-only `profiles` RLS. A partial-match search would be an endpoint for
-- enumerating every account in the app — see 03-data-model.md's own reasoning against it.

create function find_user_by_username(p_username text)
returns table (id uuid, username text, display_name text, avatar_url text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not available' using errcode = 'insufficient_privilege';
  end if;

  return query
    select p.id, p.username, p.display_name, p.avatar_url
    from profiles p
    where p.username = p_username;
end;
$$;

-- ---------------------------------------------------------------------------
-- respond_to_group_invite / revoke_group_invite — 03-data-model.md#joining-a-group
-- ---------------------------------------------------------------------------
-- Two different actors, two different intents, kept as two functions rather than one with a
-- mode flag: the invitee decides accept/decline on their own invite, the owner/admin revokes a
-- still-pending one before it's decided. `group_invites_update`'s RLS already lets both actors
-- write a status column; these enforce which transition each is actually allowed to make.

create function respond_to_group_invite(p_invite_id uuid, p_accept boolean) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite group_invites%rowtype;
begin
  select * into v_invite from group_invites where id = p_invite_id;

  if v_invite.id is null or v_invite.invited_user_id <> auth.uid() or v_invite.status <> 'pending' then
    raise exception 'not available' using errcode = 'insufficient_privilege';
  end if;

  if p_accept then
    update group_invites set status = 'accepted', decided_at = now() where id = p_invite_id;
    -- The one place a non-owner group_members row is ever written — group_members has no
    -- general INSERT policy so that "rows only ever appear when someone accepts an invite"
    -- (03-data-model.md#joining-a-group) can't be bypassed by a raw insert from anywhere else.
    insert into group_members (group_id, user_id, role)
    values (v_invite.group_id, v_invite.invited_user_id, 'member')
    on conflict (group_id, user_id) do nothing;
  else
    update group_invites set status = 'declined', decided_at = now() where id = p_invite_id;
  end if;
end;
$$;

create function revoke_group_invite(p_invite_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite group_invites%rowtype;
begin
  select * into v_invite from group_invites where id = p_invite_id;

  if v_invite.id is null or not is_group_admin_or_owner(v_invite.group_id) or v_invite.status <> 'pending' then
    raise exception 'not available' using errcode = 'insufficient_privilege';
  end if;

  update group_invites set status = 'revoked', decided_at = now() where id = p_invite_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- promote_group_member / demote_group_admin / transfer_group_ownership
-- 03-data-model.md#group-roles
-- ---------------------------------------------------------------------------
-- Promote (member → admin): owner or admin, per the roles table ("admin: ... promote a member to
-- admin"). Demote (admin → member): owner-only ("admin: ... Cannot demote another admin").
-- Neither ever touches an `owner` row — `group_members_update`'s own RLS already refuses that
-- unconditionally (`using (... and role <> 'owner') with check (role <> 'owner')`), so these two
-- functions inherit "no path demotes or removes the owner" from the table's RLS itself rather
-- than having to re-check it, and the exit criterion is tested against the RLS directly too (see
-- supabase/tests/groups.test.ts).

create function promote_group_member(p_group_id uuid, p_user_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role group_role;
begin
  if not is_group_admin_or_owner(p_group_id) then
    raise exception 'not available' using errcode = 'insufficient_privilege';
  end if;

  select role into v_role from group_members where group_id = p_group_id and user_id = p_user_id;
  if v_role is distinct from 'member' then
    raise exception 'not available' using errcode = 'insufficient_privilege';
  end if;

  update group_members set role = 'admin' where group_id = p_group_id and user_id = p_user_id;
end;
$$;

create function demote_group_admin(p_group_id uuid, p_user_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role group_role;
begin
  if not is_group_owner(p_group_id) then
    raise exception 'not available' using errcode = 'insufficient_privilege';
  end if;

  select role into v_role from group_members where group_id = p_group_id and user_id = p_user_id;
  if v_role is distinct from 'admin' then
    raise exception 'not available' using errcode = 'insufficient_privilege';
  end if;

  update group_members set role = 'member' where group_id = p_group_id and user_id = p_user_id;
end;
$$;

-- "Ownership moves only if the owner themselves transfers it" (03-data-model.md#group-roles) —
-- the target must already be a member, and the outgoing owner becomes an admin rather than a
-- plain member, matching how host handover treats the outgoing host (still fully privileged,
-- just no longer the one name with the un-displaceable role). Demoting the old owner before
-- promoting the new one keeps `one_owner_per_group`'s partial unique index satisfied at every
-- statement boundary — a group with zero owners for the instant between the two updates is fine,
-- a group with two never is.
create function transfer_group_ownership(p_group_id uuid, p_new_owner_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role group_role;
begin
  if not is_group_owner(p_group_id) then
    raise exception 'not available' using errcode = 'insufficient_privilege';
  end if;
  if p_new_owner_id = auth.uid() then
    raise exception 'not available' using errcode = 'insufficient_privilege';
  end if;

  select role into v_role from group_members where group_id = p_group_id and user_id = p_new_owner_id;
  if v_role is null then
    raise exception 'not available' using errcode = 'insufficient_privilege';
  end if;

  update group_members set role = 'admin' where group_id = p_group_id and user_id = auth.uid();
  update group_members set role = 'owner' where group_id = p_group_id and user_id = p_new_owner_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- invite_player_to_game — the private-game half of 03-data-model.md#private-games
-- ---------------------------------------------------------------------------
-- "Invite a group member | Host or any current player in the game" — game_events itself is
-- host-only-insert (`game_events_insert`, step 10; CLAUDE.md's "writes are host-only,
-- permanently"), so a non-host player needs a narrow, audited way to append exactly this one
-- log-only event type, the same shape as `log_join_requested`'s trigger giving a plain insert an
-- event nothing else could produce. `player_invited` has no state effect of its own (it doesn't
-- seat anyone) — the invited person still goes through the ordinary host-approved join-request
-- path afterwards, this just makes the game askable-about in the first place. The target must
-- already share the game's group; there's no "invite a stranger" path here, that's what a host's
-- share link is for.
create function invite_player_to_game(p_game_id uuid, p_user_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
begin
  if auth.uid() is null or not (is_host(p_game_id) or is_game_player(p_game_id)) then
    raise exception 'not available' using errcode = 'insufficient_privilege';
  end if;

  v_group_id := game_group_id(p_game_id);
  if v_group_id is null or not exists (
    select 1 from group_members where group_id = v_group_id and user_id = p_user_id
  ) then
    raise exception 'not available' using errcode = 'insufficient_privilege';
  end if;

  insert into game_events (
    game_id, player_id, actor_id, type, payload, client_event_id, client_created_at
  ) values (
    p_game_id, null, auth.uid(), 'player_invited',
    jsonb_build_object('userId', p_user_id, 'invitedBy', auth.uid()),
    gen_random_uuid(), now()
  );
end;
$$;

-- `get_group_live_games` (step 13) excludes every private game unconditionally today — the
-- conservative default step 13's own migration comment already flagged for step 14 to revisit.
-- Left exactly as-is: docs/build/PLAN.md's own step-14 exit criterion is "a private game is
-- absent from every group-scoped figure and list", which the existing behaviour already
-- satisfies for everyone who *hasn't* been invited. Loosening it specifically for an invited
-- caller (so the invite above is actually actionable) is real, scoped follow-up work — not done
-- here, see docs/build/PROGRESS.md's step 14 entry for the reasoning not to fold it in blind.
