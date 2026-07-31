-- Follow-up to 20260731150000_step13_sharing_and_takeover.sql, applied after that migration went
-- live on the real Supabase project — same shape as 20260730150100_revoke_public_execute_on_
-- triggers.sql's own follow-up for step 10.
--
-- `find_valid_share_link` was already given a `revoke execute ... from anon, authenticated`
-- right after its own `create function`, but `get_advisors(type: 'security')` still flagged it
-- as anon/authenticated-executable afterward — the exact trap docs/build/NOTES.md already
-- documents from step 10: the function had never had an *explicit* anon/authenticated grant, only
-- the default `EXECUTE FROM PUBLIC` every new function gets, so revoking from the two named roles
-- was a no-op. `log_claim_requested` (the new claim-request trigger function, same shape as
-- `log_join_requested`) had no revoke at all in the original migration — an oversight, not a
-- reasoned choice; it should have gotten the same treatment
-- `20260730150100_revoke_public_execute_on_triggers.sql` already gave `log_join_requested`.
--
-- Confirmed via `pg_proc.proacl` before and after, on the real project: `find_valid_share_link`
-- carried an explicit `anon=X`/`authenticated=X` grant *in addition to* the PUBLIC default
-- (apparently added automatically on function creation, separate from Postgres's own PUBLIC
-- default), so both `revoke ... from public` and `revoke ... from anon, authenticated` were
-- needed for it to actually disappear from the advisor; `log_claim_requested` needed the same
-- two-step fix. Neither function is ever meant to be called directly — both are only reached from
-- inside another `SECURITY DEFINER` function or a trigger, which is unaffected by these revokes
-- (docs/build/NOTES.md: "revoking EXECUTE on a trigger function does not break the trigger" — the
-- same reasoning covers a function only ever called from inside another SECURITY DEFINER
-- function).

revoke execute on function find_valid_share_link(text, boolean) from public;
revoke execute on function log_claim_requested() from anon, authenticated;
