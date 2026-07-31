-- Retention (03-data-model.md#retention-and-archiving, docs/build/PLAN.md step 11). Invoked by
-- maintenance.yml starting step 16 — this step only builds the function itself, callable and
-- testable directly against local Postgres. Not wired into the cron yet (docs/02-architecture.md
-- says the anon key calls it over the public REST endpoint, same as the keep-alive ping — no
-- service role, by design), and no auth.uid() check is meaningful here: this is a global
-- maintenance sweep, not scoped to any one host's game.
--
-- Tier 3 (game_events, the audit log) at 30 days past finished_at; tier 2 (games, game_players,
-- transfers, shared_costs and everything that cascades from games — shared_cost_shares,
-- game_viewers, share_links, join_requests, player_claims, and any game_events left over) at 90
-- days. Both windows are declared once, here, per "retention windows are constants in one
-- place, not scattered magic numbers".
--
-- "A game can only be purged after its snapshot exists" (docs/03): both deletes join against
-- game_summaries, so a finished game with no permanent snapshot yet is silently excluded from
-- both tiers rather than purged or erroring — it simply waits for finalize_game() to catch up.

create function purge_expired_game_data()
returns table (table_name text, deleted_count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier3_window constant interval := interval '30 days';
  v_tier2_window constant interval := interval '90 days';
  v_count bigint;
begin
  delete from game_events ge
  using games g
  join game_summaries gs on gs.game_id = g.id
  where ge.game_id = g.id
    and g.ended_at is not null
    and g.ended_at < now() - v_tier3_window;
  get diagnostics v_count = row_count;
  table_name := 'game_events';
  deleted_count := v_count;
  return next;

  -- Cascades (all `on delete cascade` from games) to game_players, shared_costs (and via that,
  -- shared_cost_shares), transfers, game_viewers, share_links, join_requests, player_claims, and
  -- any game_events the tier-3 delete above didn't already catch.
  delete from games g
  using game_summaries gs
  where gs.game_id = g.id
    and g.ended_at is not null
    and g.ended_at < now() - v_tier2_window;
  get diagnostics v_count = row_count;
  table_name := 'games';
  deleted_count := v_count;
  return next;

  return;
end;
$$;
