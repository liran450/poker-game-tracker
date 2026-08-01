-- Step 15 (docs/build/PLAN.md) — statistics. No new tables: game_summaries/player_results/
-- transfer_summaries and their RLS have existed since step 10, and group_player_results
-- (already is_private-filtered, security_invoker) since step 11. The one real gap is
-- `stats_visibility` (03-data-model.md#scoping, 06-statistics.md#scoping): "A stats_visibility =
-- private flag on the profile keeps someone off the group leaderboard while still counting them,
-- anonymously, in table-level aggregates" — which requires a group member to be able to *read*
-- their co-members' flag, and profiles_public's original comment (20260729121100_rls_policies.sql)
-- deliberately left it self-only, since nothing needed it before now.

-- Widening profiles_public's column list, not its WHERE clause: the existing "self or co-member"
-- predicate already governs exactly who this step needs to see the flag. stats_visibility itself
-- carries no sensitive information (it is a display preference, not account data) so exposing it
-- alongside the username/display_name/avatar_url this view already shares co-members is a matching
-- amount of trust, not a new category of one.
-- security_invoker stays false, unchanged from the original: this view's own WHERE clause is
-- what enforces "self or co-member" (see its comment below), and it depends on running as the
-- view's owner to see rows profiles_select_self's own RLS (id = auth.uid()) would otherwise hide
-- for every co-member row. Setting security_invoker = true here (unlike group_player_results in
-- 20260731140000_step11_security_advisor_fixes.sql, which delegates entirely to the base tables'
-- own RLS) would break every existing co-member lookup, not just the new column.
create or replace view profiles_public
  with (security_invoker = false)
  as
  select p.id, p.username, p.display_name, p.avatar_url, p.stats_visibility
  from profiles p
  where p.id = auth.uid()
     or exists (
       select 1 from group_members gm_self
       join group_members gm_other
         on gm_other.group_id = gm_self.group_id
       where gm_self.user_id = auth.uid() and gm_other.user_id = p.id
     );

comment on view profiles_public is
  'Co-member-readable profile fields (06-statistics.md#scoping): username/display_name/avatar_url '
  'for rendering names, stats_visibility so the group leaderboard can exclude a member who opted '
  'out while still counting them anonymously in table-level aggregates. Everything else on '
  '`profiles` (phone, locale, default_nickname) stays self-only.';
