-- Step 13 — Sharing, viewers, join requests, takeover (docs/build/PLAN.md).
--
-- Everything here builds on schema/RLS/RPCs already in place since step 10
-- (game_viewers, share_links, join_requests, player_claims tables; is_host/is_game_player/
-- is_game_viewer/is_group_member/is_in_game/can_read_game/game_group_id helpers;
-- take_over_host/decide_join_request/mark_event_undone RPCs). See docs/build/NOTES.md's
-- "step-10 RPCs, and what's deliberately not one" entry for what was intentionally deferred to
-- this step.

-- digest() (sha256 token hashing) needs pgcrypto. gen_random_uuid() doesn't (built into
-- Postgres 13+ core), which is why no earlier migration needed this.
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- A real, pre-existing gap found while building this step: games.status/started_at/ended_at
-- were never updated server-side by anything. The game_events trigger's scope is deliberately
-- narrow (game_players only, see 20260729121200_game_events_trigger.sql), and step 12's
-- SupabaseSyncTransport.applyDirectTableWrite only ever handled shared_cost_*/transfer_edited —
-- game_started/game_settling/game_ended/game_reopened were pushed as plain game_events rows and
-- nothing else. Harmless for step 12 (nothing server-side read games.status yet), but this step's
-- claim window (games.claim_deadline) and get_shared_game's live/finished routing both need it to
-- be real. Fixed on the client side (src/data/supabaseSyncTransport.ts), matching the established
-- pattern of direct table writes alongside the event append — not a new server trigger. See
-- docs/build/NOTES.md.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- player_results.game_player_id — needed to resolve a claim approved after the game has already
-- been finalised back to the permanent row it must also update (03-data-model.md#player_claims:
-- "Sets user_id on the live game_players row and on the permanent player_results row"). Nothing
-- on player_results correlated back to game_players before this; finalize_game() populates it,
-- decide_claim() (below) reads it. Deliberately a bare uuid, no foreign key — the same reasoning
-- game_summaries/transfer_summaries already follow for everything they reference in the live
-- schema: player_results is permanent and must stay byte-identical across a purge
-- (docs/build/PLAN.md step 11's own exit criterion, still enforced by
-- supabase/tests/purgeExpiredGameData.test.ts), and a real FK with `on delete set null` would
-- silently null this column out the moment the live game_players row is purged — a change, which
-- byte-identical forbids. A claim is only ever decided while the game is live or within 48h of
-- ending (can_submit_claim, below), i.e. always well before purge, so the dangling reference
-- after purge is harmless; nothing reads it by then.
-- ---------------------------------------------------------------------------

alter table player_results add column game_player_id uuid;
create index player_results_game_player_id_idx on player_results (game_player_id)
  where game_player_id is not null;

create or replace function finalize_game(p_game_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game games%rowtype;
begin
  select * into v_game from games where id = p_game_id;

  if v_game.id is null or not is_host(p_game_id) or v_game.status <> 'finished'
     or v_game.ended_at is null then
    raise exception 'not available' using errcode = 'insufficient_privilege';
  end if;

  delete from transfer_summaries where game_id = p_game_id;
  delete from player_results where game_id = p_game_id;
  delete from game_summaries where game_id = p_game_id;

  drop table if exists tmp_finalize_players;

  create temporary table tmp_finalize_players on commit drop as
  with active_players as (
    select gp.id, gp.user_id, gp.guest_name, gp.nickname, gp.seat_order, gp.joined_at,
           gp.left_at, gp.buys_count, gp.cash_paid_minor, gp.chips_final,
           p.display_name as account_display_name
    from game_players gp
    left join profiles p on p.id = gp.user_id
    where gp.game_id = p_game_id and not gp.is_removed
  ),
  based as (
    select ap.*,
      case
        when ap.user_id is null then coalesce(ap.guest_name, '')
        when ap.nickname is not null then ap.nickname || ' (' || ap.account_display_name || ')'
        else ap.account_display_name
      end as base_name
    from active_players ap
  ),
  numbered as (
    select b.*,
      (row_number() over (partition by b.base_name order by b.seat_order, b.joined_at) - 1)
        as dup_index
    from based b
  ),
  settled_order as (
    select id, row_number() over (order by settled_at) as position
    from game_players
    where game_id = p_game_id and is_settled
  )
  select
    n.*,
    case when n.dup_index = 0 then n.base_name else n.base_name || ' (' || n.dup_index || ')' end
      as display_name,
    so.position as settled_position
  from numbered n
  left join settled_order so on so.id = n.id;

  insert into game_summaries (
    game_id, group_id, name, played_on, currency, buy_amount_minor, chips_per_buy,
    player_count, duration_minutes, total_buy_ins_minor, total_cash_pot_minor,
    unaccounted_minor, shared_costs_minor, is_private, location_name, finished_at
  )
  select
    p_game_id,
    v_game.group_id,
    v_game.name,
    v_game.played_on,
    v_game.currency,
    v_game.buy_amount_minor,
    v_game.chips_per_buy,
    count(*),
    case when v_game.started_at is null then 0
      else greatest(0, round(extract(epoch from (v_game.ended_at - v_game.started_at)) / 60))::integer
    end,
    coalesce(sum(t.buys_count), 0) * v_game.buy_amount_minor,
    coalesce(sum(t.cash_paid_minor), 0),
    v_game.unaccounted_minor,
    coalesce((select sum(amount_minor) from shared_costs where game_id = p_game_id), 0),
    v_game.is_private,
    null,
    v_game.ended_at
  from tmp_finalize_players t;

  -- game_player_id is new here (see the migration header comment); every other column and the
  -- select body below are unchanged from 20260731120000_finalize_game.sql.
  insert into player_results (
    id, game_id, group_id, is_private, user_id, guest_name, display_name,
    buys_count, owed_minor, cash_paid_minor, chips_final, cash_out_minor, net_minor,
    shared_costs_share_minor, minutes_played, settled_position, game_player_id
  )
  select
    gen_random_uuid(),
    p_game_id,
    v_game.group_id,
    v_game.is_private,
    t.user_id,
    t.guest_name,
    t.display_name,
    t.buys_count,
    t.buys_count * v_game.buy_amount_minor,
    t.cash_paid_minor,
    coalesce(t.chips_final, 0),
    chips_to_money_minor(coalesce(t.chips_final, 0), v_game.buy_amount_minor, v_game.chips_per_buy),
    chips_to_money_minor(coalesce(t.chips_final, 0), v_game.buy_amount_minor, v_game.chips_per_buy)
      - t.buys_count * v_game.buy_amount_minor,
    coalesce(paid.paid_minor, 0) - coalesce(shares.share_minor, 0),
    greatest(0, round(extract(epoch from (coalesce(t.left_at, v_game.ended_at) - t.joined_at))
      / 60))::integer,
    t.settled_position,
    t.id
  from tmp_finalize_players t
  left join (
    select paid_by_player_id, sum(amount_minor) as paid_minor
    from shared_costs
    where game_id = p_game_id and paid_by_player_id is not null
    group by paid_by_player_id
  ) paid on paid.paid_by_player_id = t.id
  left join (
    select scs.game_player_id, sum(scs.amount_minor) as share_minor
    from shared_cost_shares scs
    join shared_costs sc on sc.id = scs.cost_id
    where sc.game_id = p_game_id
    group by scs.game_player_id
  ) shares on shares.game_player_id = t.id;

  insert into transfer_summaries (game_id, from_name, to_name, from_user_id, to_user_id,
    amount_minor, order_index)
  select
    p_game_id,
    case tr.from_party
      when 'pot' then 'קופה'
      when 'house' then 'לא מזוהה / הבית'
      else coalesce(fp.display_name, '')
    end,
    case tr.to_party
      when 'pot' then 'קופה'
      when 'house' then 'לא מזוהה / הבית'
      else coalesce(tp.display_name, '')
    end,
    case tr.from_party when 'player' then fp.user_id else null end,
    case tr.to_party when 'player' then tp.user_id else null end,
    tr.amount_minor,
    row_number() over (order by tr.order_index) - 1
  from transfers tr
  left join tmp_finalize_players fp on fp.id = tr.from_player_id
  left join tmp_finalize_players tp on tp.id = tr.to_player_id
  where tr.game_id = p_game_id and tr.amount_minor > 0
  order by tr.order_index;

  drop table if exists tmp_finalize_players;
end;
$$;

-- ---------------------------------------------------------------------------
-- Share links (03-data-model.md#link-security, #link-lifetime, #anonymous-share-access)
-- ---------------------------------------------------------------------------
--
-- Token generation, hashing to store, and the URL fragment are all client-side
-- (src/data/shareLinks.ts) — share_links_insert (is_host) already lets the host write the row
-- directly, and revoke/rotate are likewise plain host-authorised updates/inserts through the
-- same RLS-gated table, needing no RPC. What genuinely needs SECURITY DEFINER is looking a
-- token up *without* any existing row access — the whole point of a share link.

-- Failed-lookup throttling (03-data-model.md#link-security: "after a handful of bad tokens from
-- the same caller, back off") is deliberately NOT built as DB state here. A rejection in this
-- function means `find_valid_share_link` (or its caller) raises an exception, and Postgres rolls
-- back the *entire* enclosing transaction when an uncaught exception propagates out of it — not
-- just the statement that raised, everything since the transaction began, including any row this
-- same function inserted moments earlier to record the failure. Proven by writing exactly that
-- and watching the row count stay zero, not assumed: a table + "insert-then-raise" was the first
-- attempt, and it silently logged nothing, ever, no matter how many bad tokens were tried.
-- Persisting a counter across a rollback needs a genuinely separate transaction (dblink or the
-- pg_background extension are the standard answers), which this project has no other use for and
-- won't add solely for a mechanism 03-data-model.md itself calls a courtesy, not a real defence
-- ("brute-forcing 256 bits is not a real threat; this just keeps enumeration noise out of the
-- logs"). Real protection against enumeration here is the 256-bit token's own infeasibility to
-- guess and Supabase's platform-level API rate limiting, both outside this migration's reach.
-- See docs/build/NOTES.md.

-- The one internal helper every share-link RPC below funnels through: hash lookup, revoked
-- check, and the 7-day/30-day window from 03-data-model.md#link-lifetime, evaluated by who's
-- asking right now (auth.uid() under SECURITY DEFINER is still the real caller's, not the
-- function owner's — only table-privilege checks change under SECURITY DEFINER, not auth.uid()
-- itself). p_stamp_view is false for the join/claim RPCs below (submitting a request isn't "a
-- view") and true for the two read RPCs, which is also where last_viewed_at/view_count actually
-- get bumped.
--
-- Every rejection here — missing, revoked, or expired — raises the identical generic error, so
-- a caller fishing for which reason applies learns nothing (03-data-model.md#anonymous-share-
-- access: "the same generic 'not available' shape regardless of cause").
create function find_valid_share_link(p_token text, p_stamp_view boolean default false)
returns share_links
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link share_links%rowtype;
  v_is_member boolean;
  v_window interval;
begin
  select * into v_link from share_links where token_hash = digest(p_token, 'sha256');

  if v_link.id is null or v_link.revoked_at is not null then
    raise exception 'not available' using errcode = 'insufficient_privilege';
  end if;

  v_is_member := auth.uid() is not null and is_group_member(game_group_id(v_link.game_id));
  v_window := case when v_is_member then interval '30 days' else interval '7 days' end;

  if v_link.created_at < now() - v_window then
    raise exception 'not available' using errcode = 'insufficient_privilege';
  end if;

  if p_stamp_view then
    update share_links set last_viewed_at = now(), view_count = view_count + 1
      where id = v_link.id
      returning * into v_link;
  end if;

  return v_link;
end;
$$;

-- Internal-only, like the trigger functions in 20260730150100_revoke_public_execute_on_triggers.sql
-- — never called directly by a client, only from inside the SECURITY DEFINER functions below,
-- where the call still succeeds regardless of this revoke (docs/build/NOTES.md: "revoking
-- EXECUTE on a trigger function does not break the trigger" — the same reasoning applies to any
-- function called only from inside another SECURITY DEFINER function).
revoke execute on function find_valid_share_link(text, boolean) from anon, authenticated;

-- get_shared_game(token) — live games only (03-data-model.md#anonymous-share-access). A
-- currently-finished game's link is still valid (the token itself isn't expired), it just isn't
-- this RPC's to serve — {"kind": "finished"} tells the client to call get_shared_settlement
-- instead, without re-running (and re-counting as a failure) the token validation, since the
-- token IS valid; it's simply the wrong endpoint for this game's current status. That distinction
-- is not a security-sensitive one (the caller already holds a proven-valid token for this exact
-- game), unlike the token-validity rejections above, which must all look identical.
create function get_shared_game(p_token text) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link share_links%rowtype;
  v_game games%rowtype;
  v_result jsonb;
begin
  v_link := find_valid_share_link(p_token, true);
  select * into v_game from games where id = v_link.game_id;

  if v_game.id is null then
    raise exception 'not available' using errcode = 'insufficient_privilege';
  end if;

  if v_game.status = 'finished' then
    return jsonb_build_object('kind', 'finished');
  end if;

  if v_game.status not in ('active', 'settling') then
    raise exception 'not available' using errcode = 'insufficient_privilege';
  end if;

  -- "A signed-in caller is also inserted into game_viewers so the host sees who's watching"
  -- (03-data-model.md). Anonymous visitors get the same read below but are never recorded —
  -- game_viewers.user_id is NOT NULL by design (docs/build/NOTES.md: every write in this app is
  -- attributed to a signed-in actor; anonymous access is read-only, never a row). added_by is
  -- left null, the table's own documented meaning for "joined via the share link" rather than an
  -- explicit host add.
  if auth.uid() is not null then
    insert into game_viewers (game_id, user_id, added_by)
    values (v_game.id, auth.uid(), null)
    on conflict (game_id, user_id) do nothing;
  end if;

  select jsonb_build_object(
    'kind', 'live',
    'game', jsonb_build_object(
      'id', v_game.id,
      'name', v_game.name,
      'status', v_game.status,
      'currency', v_game.currency,
      'buyAmountMinor', v_game.buy_amount_minor,
      'chipsPerBuy', v_game.chips_per_buy,
      'isPrivate', v_game.is_private,
      'startedAt', v_game.started_at,
      'unaccountedMinor', v_game.unaccounted_minor
    ),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', gp.id,
        'userId', gp.user_id,
        'guestName', gp.guest_name,
        'nickname', gp.nickname,
        'seatOrder', gp.seat_order,
        'buysCount', gp.buys_count,
        'cashPaidMinor', gp.cash_paid_minor,
        'chipsFinal', gp.chips_final,
        'isSettled', gp.is_settled,
        'joinedAt', gp.joined_at
      ) order by gp.seat_order)
      from game_players gp where gp.game_id = v_game.id and not gp.is_removed
    ), '[]'::jsonb),
    'sharedCosts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sc.id,
        'label', sc.label,
        'amountMinor', sc.amount_minor,
        'paidByPlayerId', sc.paid_by_player_id,
        'splitMode', sc.split_mode
      ))
      from shared_costs sc where sc.game_id = v_game.id
    ), '[]'::jsonb),
    'viewerCount', (select count(*) from game_viewers where game_id = v_game.id)
  ) into v_result;

  return v_result;
end;
$$;

-- get_shared_settlement(token) — finished games, sourced from the permanent tables so it keeps
-- working after the live rows are purged (03-data-model.md).
create function get_shared_settlement(p_token text) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link share_links%rowtype;
  v_summary game_summaries%rowtype;
  v_result jsonb;
begin
  v_link := find_valid_share_link(p_token, true);
  select * into v_summary from game_summaries where game_id = v_link.game_id;

  -- No snapshot yet — either the game hasn't been finalised (a narrow race with finalize_game(),
  -- the client should retry get_shared_game) or it's genuinely gone. Same generic shape either
  -- way; the token itself already proved valid above.
  if v_summary.game_id is null then
    raise exception 'not available' using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
    'kind', 'settled',
    'game', jsonb_build_object(
      'gameId', v_summary.game_id,
      'name', v_summary.name,
      'playedOn', v_summary.played_on,
      'currency', v_summary.currency,
      'playerCount', v_summary.player_count,
      'durationMinutes', v_summary.duration_minutes,
      'isPrivate', v_summary.is_private,
      'finishedAt', v_summary.finished_at
    ),
    'playerResults', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pr.id, 'userId', pr.user_id, 'guestName', pr.guest_name,
        'displayName', pr.display_name, 'buysCount', pr.buys_count,
        'owedMinor', pr.owed_minor, 'cashPaidMinor', pr.cash_paid_minor,
        'chipsFinal', pr.chips_final, 'cashOutMinor', pr.cash_out_minor,
        'netMinor', pr.net_minor, 'sharedCostsShareMinor', pr.shared_costs_share_minor,
        'settledPosition', pr.settled_position
      ) order by pr.net_minor desc)
      from player_results pr where pr.game_id = v_summary.game_id
    ), '[]'::jsonb),
    'transfers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'fromName', ts.from_name, 'toName', ts.to_name,
        'fromUserId', ts.from_user_id, 'toUserId', ts.to_user_id,
        'amountMinor', ts.amount_minor, 'orderIndex', ts.order_index
      ) order by ts.order_index)
      from transfer_summaries ts where ts.game_id = v_summary.game_id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Joining via a share link (03-data-model.md#two-paths-in-one-gate, path 1)
-- ---------------------------------------------------------------------------
--
-- Scoped to signed-in callers. game_events.actor_id is NOT NULL (every event has a real actor —
-- a locked, heavily-tested invariant since step 4/10) and join_requests.user_id, while nullable
-- in the schema, has no code path that ever leaves it null once log_join_requested (step 10)
-- uses it directly as the appended event's actor_id. 04-ux-spec.md's "anyone holding the
-- link — signed in or not — gets one action" describes who can *see* the בקש להצטרף button; the
-- tap itself is a write, and every write in this app is attributed to a signed-in actor
-- (03-data-model.md#anonymous-share-access already draws exactly this line: "anonymous clients
-- never get direct table access... every rejection returns the same generic shape" — a write
-- was never in scope for anon). An anonymous tap routes through the existing /account sign-in
-- flow first, same as any other write action would. See docs/build/NOTES.md.
create function submit_join_request_via_link(
  p_token text,
  p_requested_name text,
  p_requested_role join_request_role default 'player'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link share_links%rowtype;
  v_id uuid;
begin
  if auth.uid() is null or btrim(coalesce(p_requested_name, '')) = '' then
    raise exception 'not available' using errcode = 'insufficient_privilege';
  end if;

  v_link := find_valid_share_link(p_token, false);

  if is_game_player(v_link.game_id) or is_game_viewer(v_link.game_id) then
    raise exception 'not available' using errcode = 'insufficient_privilege';
  end if;

  -- A repeated tap goes quiet rather than erroring (04-ux-spec.md: "the app... goes quiet") —
  -- one_pending_join_request_per_person already guarantees at most one open request either way.
  insert into join_requests (game_id, user_id, requested_name, requested_role, source)
  values (v_link.game_id, auth.uid(), btrim(p_requested_name), p_requested_role, 'link')
  on conflict (game_id, user_id) where status = 'pending' and user_id is not null do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from join_requests
      where game_id = v_link.game_id and user_id = auth.uid() and status = 'pending';
  end if;

  return v_id;
end;
$$;

-- decide_join_request (step 10) already seeds nickname as always null on approval. A registered
-- requester's account-level default_nickname (step 12) is a better seed than nothing, still
-- host-editable afterward like any nickname — "Nicknames for registered players"
-- (docs/build/PLAN.md step 13).
create or replace function decide_join_request(p_request_id uuid, p_approve boolean) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request join_requests%rowtype;
  v_player_id uuid;
  v_seat_order integer;
  v_default_nickname text;
begin
  select * into v_request from join_requests where id = p_request_id;

  if v_request.id is null or not is_host(v_request.game_id) or v_request.status <> 'pending' then
    raise exception 'not available' using errcode = 'insufficient_privilege';
  end if;

  if p_approve then
    if v_request.requested_role = 'player' then
      v_player_id := gen_random_uuid();

      select coalesce(max(seat_order), -1) + 1 into v_seat_order
        from game_players where game_id = v_request.game_id;

      if v_request.user_id is not null then
        select default_nickname into v_default_nickname
          from profiles where id = v_request.user_id;
      else
        v_default_nickname := null;
      end if;

      insert into game_events (
        game_id, player_id, actor_id, type, payload, client_event_id, client_created_at
      ) values (
        v_request.game_id, v_player_id, auth.uid(), 'player_added',
        jsonb_build_object(
          'userId', v_request.user_id,
          'guestName',
            case when v_request.user_id is null then v_request.requested_name else null end,
          'nickname', v_default_nickname,
          'seatOrder', v_seat_order
        ),
        gen_random_uuid(), now()
      );
    else
      insert into game_viewers (game_id, user_id, added_by)
      values (v_request.game_id, v_request.user_id, auth.uid())
      on conflict (game_id, user_id) do nothing;
    end if;

    update join_requests set status = 'approved', decided_by = auth.uid(), decided_at = now()
      where id = p_request_id;

    insert into game_events (
      game_id, player_id, actor_id, type, payload, client_event_id, client_created_at
    ) values (
      v_request.game_id, v_player_id, auth.uid(), 'join_approved',
      jsonb_build_object('requestId', p_request_id, 'playerId', v_player_id),
      gen_random_uuid(), now()
    );
  else
    update join_requests set status = 'rejected', decided_by = auth.uid(), decided_at = now()
      where id = p_request_id;

    insert into game_events (
      game_id, player_id, actor_id, type, payload, client_event_id, client_created_at
    ) values (
      v_request.game_id, null, auth.uid(), 'join_rejected',
      jsonb_build_object('requestId', p_request_id),
      gen_random_uuid(), now()
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Guest-row claims (03-data-model.md#player_claims)
-- ---------------------------------------------------------------------------

-- One source of truth for "may this guest row be claimed right now", shared by the group-member
-- direct-insert RLS path below and the share-link RPC — a row must still be an unclaimed guest,
-- and the game must be live or within claim_deadline (48h after ended_at).
create function can_submit_claim(p_game_player_id uuid) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from game_players gp
    join games g on g.id = gp.game_id
    where gp.id = p_game_player_id
      and not gp.is_removed
      and gp.user_id is null
      and (
        g.status in ('active', 'settling')
        or (g.status = 'finished' and g.claim_deadline is not null and now() <= g.claim_deadline)
      )
  );
$$;

-- The group-member path was already a plain RLS-gated insert since step 10
-- (docs/build/NOTES.md); it never enforced the claim window or "still unclaimed" until now.
drop policy player_claims_insert on player_claims;
create policy player_claims_insert on player_claims
  for insert with check (
    claimant_user_id = auth.uid()
    and is_group_member(game_group_id(game_id))
    and can_submit_claim(game_player_id)
  );

-- No trigger logged claim_requested before this step (deliberately deferred — see
-- 20260729121300_rpcs.sql's header comment). One trigger covers both the group-member direct
-- insert above and the share-link RPC below, the same shape as log_join_requested.
create function log_claim_requested() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into game_events (
    game_id, player_id, actor_id, type, payload, client_event_id, client_created_at
  ) values (
    new.game_id, new.game_player_id, new.claimant_user_id, 'claim_requested',
    jsonb_build_object(
      'claimId', new.id,
      'gamePlayerId', new.game_player_id,
      'claimantUserId', new.claimant_user_id
    ),
    gen_random_uuid(), new.created_at
  );
  return new;
end;
$$;

create trigger player_claims_log_event
  after insert on player_claims
  for each row
  execute function log_claim_requested();

create function submit_claim_via_link(p_token text, p_game_player_id uuid) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link share_links%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not available' using errcode = 'insufficient_privilege';
  end if;

  v_link := find_valid_share_link(p_token, false);

  if not exists (
    select 1 from game_players where id = p_game_player_id and game_id = v_link.game_id
  ) or not can_submit_claim(p_game_player_id) then
    raise exception 'not available' using errcode = 'insufficient_privilege';
  end if;

  insert into player_claims (game_id, game_player_id, claimant_user_id)
  values (v_link.game_id, p_game_player_id, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

-- Host-only. "Sets user_id on the live game_players row" is the claim_approved case the
-- game_events trigger already carries (20260729121200_game_events_trigger.sql — built ahead of
-- time in step 10, unused until now); "and on the permanent player_results row" is this
-- function's own direct write, the only field ever mutable on player_results after finalisation.
-- "Multiple pending claims on one row are allowed; the host picks one and the rest are rejected"
-- (03-data-model.md) is handled here, not left to the unique index alone — the index only stops
-- two *approved* claims from coexisting, it doesn't clear out the losers.
create function decide_claim(p_claim_id uuid, p_approve boolean) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim player_claims%rowtype;
  v_player_result_id uuid;
begin
  select * into v_claim from player_claims where id = p_claim_id;

  if v_claim.id is null or not is_host(v_claim.game_id) or v_claim.status <> 'pending' then
    raise exception 'not available' using errcode = 'insufficient_privilege';
  end if;

  if p_approve then
    update player_claims set status = 'approved', decided_by = auth.uid(), decided_at = now()
      where id = p_claim_id;

    update player_claims set status = 'rejected', decided_by = auth.uid(), decided_at = now()
      where game_player_id = v_claim.game_player_id and status = 'pending' and id <> p_claim_id;

    insert into game_events (
      game_id, player_id, actor_id, type, payload, client_event_id, client_created_at
    ) values (
      v_claim.game_id, v_claim.game_player_id, auth.uid(), 'claim_approved',
      jsonb_build_object(
        'claimId', v_claim.id,
        'gamePlayerId', v_claim.game_player_id,
        'claimantUserId', v_claim.claimant_user_id
      ),
      gen_random_uuid(), now()
    );

    select id into v_player_result_id from player_results
      where game_player_id = v_claim.game_player_id;

    if v_player_result_id is not null then
      update player_results set user_id = v_claim.claimant_user_id where id = v_player_result_id;
      update player_claims set player_result_id = v_player_result_id where id = p_claim_id;
    end if;
  else
    update player_claims set status = 'rejected', decided_by = auth.uid(), decided_at = now()
      where id = p_claim_id;

    insert into game_events (
      game_id, player_id, actor_id, type, payload, client_event_id, client_created_at
    ) values (
      v_claim.game_id, v_claim.game_player_id, auth.uid(), 'claim_rejected',
      jsonb_build_object('claimId', v_claim.id),
      gen_random_uuid(), now()
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Host handover — voluntary, distinct from take_over_host (which is unilateral, ungated
-- seizure). 03-data-model.md#host-takeover: "guests can't be host — they have no account".
-- ---------------------------------------------------------------------------

create function hand_over_host(p_game_id uuid, p_new_host_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not is_host(p_game_id) then
    raise exception 'not available' using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from game_players where game_id = p_game_id and user_id = p_new_host_id and not is_removed
  ) and not exists (
    select 1 from game_viewers where game_id = p_game_id and user_id = p_new_host_id
  ) then
    raise exception 'not available' using errcode = 'insufficient_privilege';
  end if;

  update games set host_id = p_new_host_id where id = p_game_id;

  insert into game_events (
    game_id, player_id, actor_id, type, payload, client_event_id, client_created_at
  ) values (
    p_game_id, null, auth.uid(), 'host_changed',
    jsonb_build_object('newHostId', p_new_host_id),
    gen_random_uuid(), now()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- The in-app half of "two paths in, one gate" (03-data-model.md#two-paths-in-one-gate, path 2)
-- — a deliberately thin projection so a group member can see a live game exists without being
-- able to read anything inside it. Built here (docs/build/PLAN.md step 13's own build list names
-- it), even though the groups screen that would call it doesn't exist until step 14 — see
-- docs/build/PROGRESS.md's step 13 entry. Private-game visibility nuance ("only for people
-- already invited or in the game", 03-data-model.md#private-games) is deliberately not built
-- here either — private games are entirely step 14's ("Private games" is a step-14 build-list
-- item, not step 13's), so this excludes every private game unconditionally, the conservative
-- default, and step 14 revisits it as part of its own is_private exclusion work.
create function get_group_live_games(p_group_id uuid)
returns table (
  game_id uuid,
  name text,
  host_display_name text,
  player_count integer,
  started_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not is_group_member(p_group_id) then
    raise exception 'not available' using errcode = 'insufficient_privilege';
  end if;

  return query
    select
      g.id,
      g.name,
      p.display_name,
      (select count(*)::integer from game_players gp where gp.game_id = g.id and not gp.is_removed),
      g.started_at
    from games g
    join profiles p on p.id = g.host_id
    where g.group_id = p_group_id
      and g.status in ('active', 'settling')
      and not g.is_private
    order by g.started_at desc nulls last;
end;
$$;
