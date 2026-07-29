-- RLS helper functions (03-data-model.md#row-level-security). SECURITY DEFINER so a policy on
-- e.g. `games` can call is_host() without the helper's own read of `games` being blocked by the
-- very policy it's evaluating — a plain SECURITY INVOKER helper would recurse into the caller's
-- restricted view of the table.

create function is_host(p_game_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from games where id = p_game_id and host_id = auth.uid()
  );
$$;

create function is_game_player(p_game_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from game_players
    where game_id = p_game_id and user_id = auth.uid() and not is_removed
  );
$$;

create function is_game_viewer(p_game_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from game_viewers where game_id = p_game_id and user_id = auth.uid()
  );
$$;

create function is_group_member(p_group_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_group_id is not null and exists (
    select 1 from group_members where group_id = p_group_id and user_id = auth.uid()
  );
$$;

create function is_group_admin_or_owner(p_group_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_group_id is not null and exists (
    select 1 from group_members
    where group_id = p_group_id and user_id = auth.uid() and role in ('owner', 'admin')
  );
$$;

create function is_group_owner(p_group_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_group_id is not null and exists (
    select 1 from group_members
    where group_id = p_group_id and user_id = auth.uid() and role = 'owner'
  );
$$;

-- Authorises host takeover: a player or a viewer, not merely a group member
-- (03-data-model.md#host-takeover).
create function is_in_game(p_game_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_game_player(p_game_id) or is_game_viewer(p_game_id);
$$;

create function can_read_game(p_game_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_host(p_game_id) or is_game_player(p_game_id) or is_game_viewer(p_game_id);
$$;

-- A plain `(select group_id from games where id = p_game_id)` inline in another table's
-- policy would run under the *calling* user's own RLS on games — exactly the group member
-- asking to join a game they can't see yet (that's the whole point of asking). SECURITY
-- DEFINER bypasses that, the same reasoning as every helper above.
create function game_group_id(p_game_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select group_id from games where id = p_game_id;
$$;

-- Same reasoning, for a group's creator claiming the owner row on a group they can't see via
-- groups_select yet (they aren't a member until this very insert succeeds).
create function group_created_by(p_group_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select created_by from groups where id = p_group_id;
$$;
