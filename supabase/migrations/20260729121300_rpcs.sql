-- The audited write paths that can't be plain RLS-gated table writes, because each one
-- touches more than one table atomically and/or needs to run under elevated privilege.
--
-- Every rejection below raises the same generic message and errcode regardless of cause
-- (game missing vs. not authorised) — 09-roadmap.md#testing's "every rejection returns the
-- same generic shape", scoped to what step 10 can actually reach (the anonymous share-link
-- RPCs in 03-data-model.md#anonymous-share-access are step 13's).

-- ---------------------------------------------------------------------------
-- take_over_host — 03-data-model.md#host-takeover
-- ---------------------------------------------------------------------------

create function take_over_host(p_game_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous_host_id uuid;
begin
  if auth.uid() is null or not is_in_game(p_game_id) then
    raise exception 'not available' using errcode = 'insufficient_privilege';
  end if;

  select host_id into v_previous_host_id from games where id = p_game_id;
  if v_previous_host_id is null then
    raise exception 'not available' using errcode = 'insufficient_privilege';
  end if;

  update games set host_id = auth.uid() where id = p_game_id;

  insert into game_events (
    game_id, player_id, actor_id, type, payload, client_event_id, client_created_at
  ) values (
    p_game_id, null, auth.uid(), 'host_taken_over',
    jsonb_build_object('previousHostId', v_previous_host_id),
    gen_random_uuid(), now()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- The join-request path
-- ---------------------------------------------------------------------------
--
-- "Ask to join" is a plain RLS-gated insert (see join_requests_insert in the RLS migration —
-- a group member asking about a live game in their own group needs no elevated privilege).
-- This trigger appends the matching join_requested game_events row so the ask still shows up
-- in the host's audit log, since the log is the event stream and a direct table insert
-- wouldn't otherwise produce one.
--
-- Only the signed-in, in-app path is reachable right now (see the RLS migration's comment on
-- join_requests_insert), so new.user_id is always populated here. Revisit when step 13 adds
-- the anonymous share-link path — actor_id is NOT NULL, so a genuinely anonymous requester
-- needs its own handling, not this trigger as-is.

create function log_join_requested() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into game_events (
    game_id, player_id, actor_id, type, payload, client_event_id, client_created_at
  ) values (
    new.game_id, null, new.user_id, 'join_requested',
    jsonb_build_object(
      'requestId', new.id,
      'userId', new.user_id,
      'requestedName', new.requested_name,
      'requestedRole', new.requested_role,
      'source', new.source
    ),
    gen_random_uuid(), new.created_at
  );
  return new;
end;
$$;

create trigger join_requests_log_event
  after insert on join_requests
  for each row
  execute function log_join_requested();

-- Deciding a request is host-only and, on approval, atomically creates the player or viewer
-- row and appends the decision event — real multi-table work, unlike the ask above.
create function decide_join_request(p_request_id uuid, p_approve boolean) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request join_requests%rowtype;
  v_player_id uuid;
  v_seat_order integer;
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

      insert into game_events (
        game_id, player_id, actor_id, type, payload, client_event_id, client_created_at
      ) values (
        v_request.game_id, v_player_id, auth.uid(), 'player_added',
        jsonb_build_object(
          'userId', v_request.user_id,
          'guestName',
            case when v_request.user_id is null then v_request.requested_name else null end,
          'nickname', null,
          'seatOrder', v_seat_order
        ),
        gen_random_uuid(), now()
      );
    else
      insert into game_viewers (game_id, user_id, added_by)
      values (v_request.game_id, v_request.user_id, auth.uid());
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
-- mark_event_undone — the one exception to game_events being insert-only
-- ---------------------------------------------------------------------------
--
-- 03-data-model.md states both "an undo appends an inverse event and sets undone_by on the
-- original" and, separately, that game_events is "insert-only — no update, no delete, ever...
-- enforced with a rule denying update/delete... to all roles including the host". Both hold:
-- there is no UPDATE grant or policy usable by any API-facing role (see the RLS migration),
-- and this narrow SECURITY DEFINER function is the sole, audited exception, forward-only
-- (undone_by can only go from null to set, never back, and never to a different value) —
-- see docs/build/NOTES.md.

create function mark_event_undone(
  p_original_client_event_id uuid,
  p_inverse_client_event_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_original game_events%rowtype;
  v_inverse game_events%rowtype;
begin
  select * into v_original from game_events where client_event_id = p_original_client_event_id;
  select * into v_inverse from game_events where client_event_id = p_inverse_client_event_id;

  if v_original.id is null or v_inverse.id is null
     or v_original.game_id <> v_inverse.game_id
     or not is_host(v_original.game_id) then
    raise exception 'not available' using errcode = 'insufficient_privilege';
  end if;

  if v_original.undone_by is not null then
    -- Already linked. A retried push must stay idempotent, so this is a silent no-op, not an
    -- error — undo-of-undo does not resurrect, and the original's undone_by never changes
    -- once set.
    return;
  end if;

  update game_events set undone_by = v_inverse.id where id = v_original.id;
end;
$$;
