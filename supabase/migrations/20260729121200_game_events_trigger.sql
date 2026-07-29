-- Mirrors core/events.ts's applyEvent() for the subset of event types that touch
-- game_players — the same cases the client's own fold() applies, kept in sync by hand since
-- Postgres has no way to import core/events.ts directly. See
-- src/test/db/eventEnumParity.test.ts for the one piece of this that *is* mechanically
-- checked (the enum values); the case-by-case logic below has no equivalent cross-check and
-- must be updated by hand if a payload shape changes.
--
-- Scope, deliberately narrow (matches docs/build/PLAN.md's step 10 wording, "the game_events
-- trigger maintaining the game_players caches" — not the other live tables): shared_costs,
-- transfers, join_requests, player_claims and game_viewers are each already a full live table
-- of current state, not a scalar cache, and are written directly by the host (see the RLS
-- migration) rather than replayed from the log here. games.status/host_id are also direct
-- writes (take_over_host, for example, updates games.host_id itself rather than relying on a
-- trigger to derive it from the host_taken_over event it appends) — see
-- docs/build/NOTES.md for the reasoning.
--
-- Known limitation, out of step 10's scope: this applies each event incrementally, in the
-- order rows actually land in game_events (server arrival order), not core/events.ts's
-- clientCreatedAt-based fold order. That's fine for a single host's in-order pushes, which is
-- all step 10 needs to support — true multi-device concurrent merge is step 12's problem and
-- may need this trigger revisited.

create function apply_game_event_to_player_cache() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  case new.type
    when 'player_added' then
      if new.player_id is not null then
        insert into game_players (
          id, game_id, user_id, guest_name, nickname, seat_order, joined_at
        ) values (
          new.player_id,
          new.game_id,
          (new.payload ->> 'userId')::uuid,
          new.payload ->> 'guestName',
          new.payload ->> 'nickname',
          (new.payload ->> 'seatOrder')::integer,
          new.client_created_at
        );
      end if;

    when 'player_removed' then
      update game_players set is_removed = true where id = new.player_id;

    when 'player_renamed' then
      update game_players set guest_name = new.payload ->> 'name' where id = new.player_id;

    when 'nickname_set' then
      update game_players set nickname = new.payload ->> 'nickname' where id = new.player_id;

    when 'buy_in_added' then
      update game_players set buys_count = buys_count + 1 where id = new.player_id;

    when 'buy_in_removed' then
      update game_players set buys_count = buys_count - 1 where id = new.player_id;

    when 'cash_paid_set' then
      update game_players set cash_paid_minor = (new.payload ->> 'amountMinor')::integer
        where id = new.player_id;

    when 'chips_set' then
      update game_players set chips_final = (new.payload ->> 'chips')::integer
        where id = new.player_id;

    when 'player_settled' then
      update game_players set
        is_settled = true,
        chips_final = (new.payload ->> 'chipsFinal')::integer,
        settled_at = (new.payload ->> 'settledAt')::timestamptz,
        left_at = (new.payload ->> 'settledAt')::timestamptz
      where id = new.player_id;

    when 'player_reopened' then
      update game_players set
        is_settled = false,
        chips_final = null,
        settled_at = null,
        left_at = null
      where id = new.player_id;

    -- Not built by any step-10 RPC yet (claim decisions arrive in step 13), but the payload
    -- shape is already fixed in core/events.ts and its only game_players-facing effect is this
    -- one column, so handling it now costs nothing and saves a forgotten update later.
    when 'claim_approved' then
      update game_players set user_id = (new.payload ->> 'claimantUserId')::uuid
        where id = (new.payload ->> 'gamePlayerId')::uuid;

    else
      -- Every other event type is a no-op against game_players (see the scope note above).
      null;
  end case;

  return new;
end;
$$;

create trigger game_events_apply_to_player_cache
  after insert on game_events
  for each row
  execute function apply_game_event_to_player_cache();
