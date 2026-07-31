-- Snapshot writing (03-data-model.md#permanent-tables, docs/build/PLAN.md step 11).
--
-- finalize_game(game_id) is deliberately given nothing but the id: by the time it's called the
-- game's live tables (games, game_players, shared_costs/shared_cost_shares, transfers) already
-- hold everything core/settlement.ts's buildGameSnapshot() would need, because game_players'
-- cache columns are kept current by the game_events trigger and shared_costs/shared_cost_shares/
-- transfers are written directly by the host (see 20260729121200_game_events_trigger.sql's scope
-- note). This function is a from-scratch SQL re-derivation of the same maths — Postgres has no
-- way to import core/settlement.ts, same limitation as the trigger file — verified to agree with
-- it on a shared fixture by supabase/tests/finalizeGame.test.ts.

-- ---------------------------------------------------------------------------
-- chips_to_money_minor — mirrors core/money.ts's chipsToMoney()/bankersRound()
-- ---------------------------------------------------------------------------
--
-- Round-half-to-even on chips * buyAmountMinor / chipsPerBuy, done with exact integer
-- arithmetic rather than floating point (unlike the TS original, which divides as a float and
-- only approximates "exactly .5" within an epsilon — see core/money.ts). That's a strictly more
-- precise implementation of the same rule, not a different one: both agree on every input,
-- since real halves only arise from exact-integer division here, whereas in the TS one the
-- epsilon check exists purely to compensate for float imprecision that this version doesn't
-- have. Precondition: chips >= 0 and buy_amount_minor >= 0 (both hold for every real game — chip
-- counts and buy-in amounts are never negative).

create function chips_to_money_minor(
  chips integer,
  buy_amount_minor integer,
  chips_per_buy integer
) returns integer
language sql
immutable
as $$
  select (
    case
      when 2 * ((chips::bigint * buy_amount_minor) % chips_per_buy) < chips_per_buy
        then (chips::bigint * buy_amount_minor) / chips_per_buy
      when 2 * ((chips::bigint * buy_amount_minor) % chips_per_buy) > chips_per_buy
        then (chips::bigint * buy_amount_minor) / chips_per_buy + 1
      -- Exact half: round to even.
      when ((chips::bigint * buy_amount_minor) / chips_per_buy) % 2 = 0
        then (chips::bigint * buy_amount_minor) / chips_per_buy
      else (chips::bigint * buy_amount_minor) / chips_per_buy + 1
    end
  )::integer;
$$;

-- ---------------------------------------------------------------------------
-- finalize_game
-- ---------------------------------------------------------------------------

create function finalize_game(p_game_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game games%rowtype;
begin
  select * into v_game from games where id = p_game_id;

  -- Same generic-rejection shape as every other RPC here (missing game vs. not authorised vs.
  -- not actually finished all look identical from the outside).
  if v_game.id is null or not is_host(p_game_id) or v_game.status <> 'finished'
     or v_game.ended_at is null then
    raise exception 'not available' using errcode = 'insufficient_privilege';
  end if;

  -- Idempotent across reopen and re-end (docs/03-data-model.md#permanent-tables: "Reopening
  -- within 24h deletes the snapshot and rewrites it on the next end, so there is never a stale
  -- duplicate"): wipe any previous snapshot for this game before rewriting it, rather than
  -- upserting piecemeal, so a second finalize_game() call can never leave a stale row behind
  -- from the first.
  delete from transfer_summaries where game_id = p_game_id;
  delete from player_results where game_id = p_game_id;
  delete from game_summaries where game_id = p_game_id;

  -- Active (non-removed) players, their rendered-on-the-night display name — same composition
  -- and per-game dedup rule as core/players.ts's renderPlayerName()/dedupeDisplayNames(), with
  -- seat_order (then joined_at, as a deterministic tiebreak the TS side gets for free from
  -- stable Map-insertion order) standing in for "insertion order" — and their settled_position,
  -- ranked across *every* player in the game (matching gameActions.ts#finalizeGame, which ranks
  -- before filtering to active players, so a settled-then-removed player still occupies a slot).
  -- Dropped explicitly rather than relying only on `on commit drop`: a caller invoking
  -- finalize_game() twice inside one still-open transaction (a real scenario in this test suite,
  -- which wraps each test in a transaction it rolls back rather than commits) would otherwise
  -- collide with the temp table from the first call.
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

  -- game_summaries first: player_results.game_id and transfer_summaries.game_id both reference
  -- game_summaries(game_id), not games(id) — see 20260729120900_permanent_tables.sql's comment
  -- ("the games row may no longer exist once purged"). Its aggregates are drawn from
  -- tmp_finalize_players directly rather than from player_results (which doesn't exist yet at
  -- this point) — total_buy_ins_minor is Σowed, which is Σbuys_count × the one constant
  -- buy_amount_minor for this game.
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
    -- No locations feature yet (games.location_id is reserved and unused) — see
    -- 20260729120300_games.sql.
    null,
    v_game.ended_at
  from tmp_finalize_players t;

  insert into player_results (
    id, game_id, group_id, is_private, user_id, guest_name, display_name,
    buys_count, owed_minor, cash_paid_minor, chips_final, cash_out_minor, net_minor,
    shared_costs_share_minor, minutes_played, settled_position
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
    t.settled_position
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

  -- The transfer list itself is never recomputed here — it was already produced by
  -- core/settlement.ts's computeTransfers() (or hand-edited by the host) and lives verbatim in
  -- the live `transfers` table (docs/build/NOTES.md: "transfers needs a party column"). A
  -- zero-amount row represents a deleted transfer (deleteTransfer() zeroes rather than removes
  -- it, since nothing is ever deleted from the log) and is excluded here, matching
  -- gameActions.ts#finalizeGame's own `.filter((t) => t.amountMinor > 0)`. order_index is
  -- reassigned densely over the surviving rows, exactly as buildGameSnapshot() does when handed
  -- a transfersOverride array.
  --
  -- 'קופה' and 'לא מזוהה / הבית' are frozen here to match src/i18n/locales/he.json's
  -- money.pot/money.unaccountedBucket strings — this table stores what was rendered on the
  -- night (03-data-model.md), a snapshot, not a live i18n-driven label, so there is no
  -- language-switching concern; update this by hand if that copy ever changes.
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
    (row_number() over (order by tr.order_index) - 1)::integer
  from transfers tr
  left join tmp_finalize_players fp on fp.id = tr.from_player_id
  left join tmp_finalize_players tp on tp.id = tr.to_player_id
  where tr.game_id = p_game_id and tr.amount_minor > 0;
end;
$$;
