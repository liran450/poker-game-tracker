-- RLS on every table, no exceptions (docs/02-architecture.md#security-model). Enforcement
-- shape follows the table in 03-data-model.md#row-level-security. Where a permission needs
-- app logic step 10 doesn't build yet (accepting a group invite, deciding a promotion, the
-- anonymous share-link RPCs), the policy is left narrow rather than guessed wide — see
-- docs/build/NOTES.md for what's deliberately deferred to steps 13/14 and why.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

alter table profiles enable row level security;

create policy profiles_select_self on profiles
  for select using (id = auth.uid());

create policy profiles_insert_self on profiles
  for insert with check (id = auth.uid());

create policy profiles_update_self on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Username/display_name/avatar_url readable to co-members of a shared group; everything else
-- (phone, locale, stats_visibility, default_nickname) stays self-only. RLS is row-level, not
-- column-level, so the narrowing lives in this view rather than in a profiles policy: the view
-- runs with its owner's privileges (security_invoker = false) so it can see rows the caller's
-- own `profiles_select_self` policy would otherwise hide, and its WHERE clause — not a table
-- policy — is what actually enforces "co-members only".
create view profiles_public
  with (security_invoker = false)
  as
  select p.id, p.username, p.display_name, p.avatar_url
  from profiles p
  where p.id = auth.uid()
     or exists (
       select 1 from group_members gm_self
       join group_members gm_other
         on gm_other.group_id = gm_self.group_id
       where gm_self.user_id = auth.uid() and gm_other.user_id = p.id
     );

grant select on profiles_public to authenticated;

-- ---------------------------------------------------------------------------
-- groups / group_members / group_invites
-- ---------------------------------------------------------------------------

alter table groups enable row level security;

create policy groups_select on groups
  for select using (is_group_member(id));

create policy groups_insert on groups
  for insert with check (created_by = auth.uid());

create policy groups_update on groups
  for update using (is_group_admin_or_owner(id)) with check (is_group_admin_or_owner(id));

create policy groups_delete on groups
  for delete using (is_group_owner(id));

alter table group_members enable row level security;

create policy group_members_select on group_members
  for select using (is_group_member(group_id));

-- The one exception to "no raw insert" below: a group's creator becomes its owner. Every
-- other membership row is written by the accept-invite RPC (step 14) — there is no general
-- INSERT policy here on purpose, matching "rows only ever appear when someone accepts an
-- invite" (03-data-model.md#joining-a-group).
create policy group_members_insert_owner on group_members
  for insert with check (
    role = 'owner'
    and user_id = auth.uid()
    and user_id = group_created_by(group_id)
  );

-- Owner/admin may change another member's role; nobody may touch the owner row through a
-- plain update (transfer is a dedicated, owner-only action — step 14). This is a baseline
-- guard, not the full guarantee: step 14's own exit criteria re-test "no path demotes or
-- removes the owner" once promotion/demotion RPCs exist.
create policy group_members_update on group_members
  for update
  using (is_group_admin_or_owner(group_id) and role <> 'owner')
  with check (role <> 'owner');

create policy group_members_delete on group_members
  for delete using (
    role <> 'owner'
    and (is_group_admin_or_owner(group_id) or user_id = auth.uid())
  );

alter table group_invites enable row level security;

create policy group_invites_select on group_invites
  for select using (invited_user_id = auth.uid() or is_group_admin_or_owner(group_id));

create policy group_invites_insert on group_invites
  for insert with check (is_group_admin_or_owner(group_id) and invited_by = auth.uid());

-- Owner/admin revoke; only the invitee accepts or declines. Both are "update status", so both
-- need write access here — which of the two transitions is legal for which actor is enforced
-- by the accept/decline/revoke RPCs (step 14), not by this policy alone.
create policy group_invites_update on group_invites
  for update
  using (invited_user_id = auth.uid() or is_group_admin_or_owner(group_id))
  with check (invited_user_id = auth.uid() or is_group_admin_or_owner(group_id));

-- ---------------------------------------------------------------------------
-- games
-- ---------------------------------------------------------------------------

alter table games enable row level security;

-- Deliberately not can_read_game(id)/is_host(id) here: those helpers re-query `games` itself
-- from inside a SECURITY DEFINER function, and a self-referential re-query of the very table
-- a policy is protecting can miss the row currently being written — Postgres's RLS +
-- RETURNING evaluates the SELECT policy against a snapshot that doesn't yet reflect this same
-- command's own INSERT, so `insert into games (...) returning id` spuriously failed
-- "new row violates row-level security policy" even though host_id = auth.uid() was true.
-- Referencing games' own host_id column directly (no subquery back into games) sidesteps it,
-- and is_game_player/is_game_viewer are safe here since they query different, already-committed
-- tables. See docs/build/NOTES.md.
create policy games_select on games
  for select using (
    host_id = auth.uid()
    or is_game_player(id)
    or is_game_viewer(id)
  );

create policy games_insert on games
  for insert with check (host_id = auth.uid() and created_by = auth.uid());

create policy games_update on games
  for update using (host_id = auth.uid()) with check (host_id = auth.uid());

create policy games_delete on games
  for delete using (host_id = auth.uid());

-- ---------------------------------------------------------------------------
-- game_players
-- ---------------------------------------------------------------------------

alter table game_players enable row level security;

create policy game_players_select on game_players
  for select using (can_read_game(game_id));

-- In the normal path these rows are written by the game_events trigger (SECURITY DEFINER,
-- bypasses this policy) — see 20260729121200_game_events_trigger.sql. This policy is the
-- doc-mandated direct-write fallback for the host, per 03-data-model.md's RLS table.
create policy game_players_insert on game_players
  for insert with check (is_host(game_id));

create policy game_players_update on game_players
  for update using (is_host(game_id)) with check (is_host(game_id));

create policy game_players_delete on game_players
  for delete using (is_host(game_id));

-- ---------------------------------------------------------------------------
-- game_events — insert-only, no update, no delete, ever (03-data-model.md#game_events)
-- ---------------------------------------------------------------------------

alter table game_events enable row level security;

create policy game_events_select on game_events
  for select using (can_read_game(game_id));

create policy game_events_insert on game_events
  for insert with check (is_host(game_id));

-- No update/delete policy: RLS default-denies both outright. Belt and braces against the
-- table owner's implicit bypass, since a future SECURITY DEFINER function is the only sanctioned
-- way undone_by ever gets set (see mark_event_undone in 20260729121300_rpcs.sql) — nothing
-- reachable through the API grants should ever be able to touch an existing row otherwise.
revoke update, delete on game_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- shared_costs / shared_cost_shares
-- ---------------------------------------------------------------------------

alter table shared_costs enable row level security;

create policy shared_costs_select on shared_costs
  for select using (can_read_game(game_id));

create policy shared_costs_insert on shared_costs
  for insert with check (is_host(game_id));

create policy shared_costs_update on shared_costs
  for update using (is_host(game_id)) with check (is_host(game_id));

create policy shared_costs_delete on shared_costs
  for delete using (is_host(game_id));

alter table shared_cost_shares enable row level security;

create policy shared_cost_shares_select on shared_cost_shares
  for select using (
    can_read_game((select game_id from shared_costs sc where sc.id = cost_id))
  );

create policy shared_cost_shares_insert on shared_cost_shares
  for insert with check (
    is_host((select game_id from shared_costs sc where sc.id = cost_id))
  );

create policy shared_cost_shares_update on shared_cost_shares
  for update
  using (is_host((select game_id from shared_costs sc where sc.id = cost_id)))
  with check (is_host((select game_id from shared_costs sc where sc.id = cost_id)));

create policy shared_cost_shares_delete on shared_cost_shares
  for delete using (
    is_host((select game_id from shared_costs sc where sc.id = cost_id))
  );

-- ---------------------------------------------------------------------------
-- transfers
-- ---------------------------------------------------------------------------

alter table transfers enable row level security;

create policy transfers_select on transfers
  for select using (can_read_game(game_id));

create policy transfers_insert on transfers
  for insert with check (is_host(game_id));

create policy transfers_update on transfers
  for update using (is_host(game_id)) with check (is_host(game_id));

create policy transfers_delete on transfers
  for delete using (is_host(game_id));

-- ---------------------------------------------------------------------------
-- game_viewers
-- ---------------------------------------------------------------------------

alter table game_viewers enable row level security;

create policy game_viewers_select on game_viewers
  for select using (can_read_game(game_id));

-- Self-insert through the share-link RPC (03-data-model.md's other stated write path) arrives
-- in step 13, once that RPC exists — no policy stands in for it yet.
create policy game_viewers_insert on game_viewers
  for insert with check (is_host(game_id));

create policy game_viewers_delete on game_viewers
  for delete using (is_host(game_id));

-- ---------------------------------------------------------------------------
-- share_links — is_host, both read and write (nobody else may even list a game's links)
-- ---------------------------------------------------------------------------

alter table share_links enable row level security;

create policy share_links_select on share_links
  for select using (is_host(game_id));

create policy share_links_insert on share_links
  for insert with check (is_host(game_id));

create policy share_links_update on share_links
  for update using (is_host(game_id)) with check (is_host(game_id));

create policy share_links_delete on share_links
  for delete using (is_host(game_id));

-- ---------------------------------------------------------------------------
-- join_requests
-- ---------------------------------------------------------------------------

alter table join_requests enable row level security;

create policy join_requests_select on join_requests
  for select using (user_id = auth.uid() or is_host(game_id));

-- The in-app path only: a group member asking to join a live game in their own group. The
-- share-link path ("everyone else") is an anonymous-capable RPC that needs token validation —
-- step 13, once share_links has real lookup logic behind it.
create policy join_requests_insert on join_requests
  for insert with check (
    user_id = auth.uid()
    and source = 'in_app'
    and is_group_member(game_group_id(game_id))
  );

create policy join_requests_update on join_requests
  for update using (is_host(game_id)) with check (is_host(game_id));

-- ---------------------------------------------------------------------------
-- player_claims
-- ---------------------------------------------------------------------------

alter table player_claims enable row level security;

create policy player_claims_select on player_claims
  for select using (claimant_user_id = auth.uid() or is_host(game_id));

-- Group-member path only, matching join_requests above — the share-link claimant path is
-- step 13's.
create policy player_claims_insert on player_claims
  for insert with check (
    claimant_user_id = auth.uid()
    and is_group_member(game_group_id(game_id))
  );

create policy player_claims_update on player_claims
  for update using (is_host(game_id)) with check (is_host(game_id));

-- ---------------------------------------------------------------------------
-- Permanent tables — writable by nobody. finalize_game() (step 11) runs as the table owner
-- and bypasses RLS entirely; no INSERT/UPDATE/DELETE policy exists for any role.
-- ---------------------------------------------------------------------------

alter table game_summaries enable row level security;

create policy game_summaries_select on game_summaries
  for select using (
    (group_id is not null and is_group_member(group_id))
    or exists (
      select 1 from player_results pr
      where pr.game_id = game_summaries.game_id and pr.user_id = auth.uid()
    )
  );

alter table player_results enable row level security;

create policy player_results_select on player_results
  for select using (
    (group_id is not null and is_group_member(group_id))
    or user_id = auth.uid()
  );

alter table transfer_summaries enable row level security;

create policy transfer_summaries_select on transfer_summaries
  for select using (
    exists (
      select 1 from game_summaries gs
      where gs.game_id = transfer_summaries.game_id
        and (
          (gs.group_id is not null and is_group_member(gs.group_id))
          or exists (
            select 1 from player_results pr
            where pr.game_id = gs.game_id and pr.user_id = auth.uid()
          )
        )
    )
  );
