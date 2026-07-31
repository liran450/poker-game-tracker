-- Follow-up fixing two real gaps get_advisors(type: 'security') surfaced against the live
-- project after step 11's three migrations were applied — same pattern as
-- 20260730150000_security_advisor_fixes.sql for step 10: fixed as a new migration, not by
-- editing the original files, since those were already applied to the real project.

-- ---------------------------------------------------------------------------
-- group_player_results was missing its own narrowing, unlike profiles_public
-- ---------------------------------------------------------------------------
--
-- A plain `create view` defaults to security_invoker = false (the pre-PG15 behaviour): the view
-- runs with its *owner's* privileges, bypassing the querying user's RLS on player_results/
-- game_summaries entirely. profiles_public relies on exactly this to see rows the caller's own
-- restrictive policy would hide — but it compensates with its own WHERE clause enforcing
-- "co-members only" (see the RLS migration's comment). group_player_results had no equivalent:
-- it only filtered `not gs.is_private`, so *any* authenticated caller could read *every* group's
-- statistics, not just their own — the advisor's "Security Definer View" ERROR was real, not a
-- false positive.
--
-- The fix is security_invoker = true, not a duplicated is_group_member() check: with it, the
-- view evaluates player_results_select/game_summaries_select (both already "group member or
-- self") as the actual calling role. PostgREST always executes as anon/authenticated, never as
-- the table owner, so there is no owner-bypass loophole this time — the same RLS the base tables
-- already enforce for every other read now applies here too, with is_private still filtered by
-- the view itself on top.
alter view group_player_results set (security_invoker = true);

-- Views need their own grant even when the underlying tables already have RLS-gated access to
-- anon/authenticated by default (docs/build/NOTES.md's step-10 watch-out: "view privileges and
-- table privileges are separate") — profiles_public needed the same.
grant select on group_player_results to authenticated;

-- ---------------------------------------------------------------------------
-- chips_to_money_minor was missing set search_path = public
-- ---------------------------------------------------------------------------
--
-- Every other function in this schema has it; this one was a plain miss, the same class of gap
-- 20260730150000_security_advisor_fixes.sql already fixed once for
-- prevent_buy_terms_change_after_buy_ins.
create or replace function chips_to_money_minor(
  chips integer,
  buy_amount_minor integer,
  chips_per_buy integer
) returns integer
language sql
immutable
set search_path = public
as $$
  select (
    case
      when 2 * ((chips::bigint * buy_amount_minor) % chips_per_buy) < chips_per_buy
        then (chips::bigint * buy_amount_minor) / chips_per_buy
      when 2 * ((chips::bigint * buy_amount_minor) % chips_per_buy) > chips_per_buy
        then (chips::bigint * buy_amount_minor) / chips_per_buy + 1
      when ((chips::bigint * buy_amount_minor) / chips_per_buy) % 2 = 0
        then (chips::bigint * buy_amount_minor) / chips_per_buy
      else (chips::bigint * buy_amount_minor) / chips_per_buy + 1
    end
  )::integer;
$$;
