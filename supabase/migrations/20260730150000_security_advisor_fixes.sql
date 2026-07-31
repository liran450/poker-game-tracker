-- Fixes for gaps the Supabase security advisor surfaced once a real project existed to run it
-- against (get_advisors is a platform feature -- local Postgres in supabase/tests/ has no
-- equivalent, so this is genuinely new information, not something step 10's local testing could
-- have caught). See docs/build/NOTES.md for the reasoning kept alongside this.

-- prevent_buy_terms_change_after_buy_ins (20260729120300_games.sql) was the one function in the
-- whole schema created without `set search_path = public` -- every sibling helper/RPC function
-- has it. A mutable search_path on a SECURITY INVOKER trigger function is lower severity than on
-- a SECURITY DEFINER one (it can't be tricked into operating with elevated privilege), but it can
-- still be tricked into resolving `game_events`/`buy_in_added` against a schema shadowed earlier
-- in a caller's search_path, so it gets the same treatment as everything else here.
alter function prevent_buy_terms_change_after_buy_ins() set search_path = public;

-- apply_game_event_to_player_cache and log_join_requested are AFTER INSERT trigger functions
-- only -- nothing is meant to call them directly. Every function in `public` gets an implicit
-- EXECUTE grant to PUBLIC (anon + authenticated, in Supabase's default grants) unless revoked,
-- which is what let the advisor flag both as callable via /rest/v1/rpc/<name>. Revoking EXECUTE
-- does not affect trigger firing -- Postgres's trigger manager invokes a trigger function
-- directly by OID when the trigger fires, which is not subject to the EXECUTE ACL check that
-- gates an explicit SQL call to the same function; that check only applies to the latter. The
-- RLS helper functions (is_host, can_read_game, etc.) are deliberately left alone even though
-- the advisor flags those too: RLS policies for the anon/authenticated roles call them directly
-- inside USING/WITH CHECK, and that call *is* subject to the EXECUTE check, so revoking there
-- would break every policy that uses them. Same reasoning for take_over_host/
-- decide_join_request/mark_event_undone: those are meant to be called directly, as RPCs.
revoke execute on function apply_game_event_to_player_cache() from anon, authenticated;
revoke execute on function log_join_requested() from anon, authenticated;
