-- Follow-up to 20260730150000_security_advisor_fixes.sql: apply_game_event_to_player_cache and
-- log_join_requested had never had an explicit anon/authenticated grant at all -- both were only
-- reachable via Postgres's default EXECUTE-to-PUBLIC grant (every function gets one at creation
-- unless revoked). Revoking from the two named roles was therefore a no-op; PUBLIC is the actual
-- grantee that needs revoking. Confirmed via pg_proc.proacl before and after this migration: the
-- advisor still flagged both functions after the first fix, which is what caught this.
revoke execute on function apply_game_event_to_player_cache() from public;
revoke execute on function log_join_requested() from public;
