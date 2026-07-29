create table games (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups (id),
  name text not null,
  played_on date not null default current_date,
  currency text not null default 'ILS',
  buy_amount_minor integer not null check (buy_amount_minor > 0),
  chips_per_buy integer not null check (chips_per_buy > 0),
  status game_status not null default 'setup',
  host_id uuid not null references profiles (id),
  created_by uuid not null references profiles (id),
  started_at timestamptz,
  ended_at timestamptz,
  reopen_deadline timestamptz,
  host_last_synced_at timestamptz,
  unaccounted_minor integer not null default 0,
  is_private boolean not null default false,
  claim_deadline timestamptz,
  -- Reserved — planned features (03-data-model.md#reserved-for-planned-features).
  -- Not built yet; only the columns are, so neither needs a later migration.
  location_id uuid,
  scheduled_for timestamptz,
  notes text,
  constraint name_not_blank check (btrim(name) <> '')
);

comment on column games.location_id is
  'Reserved for the planned locations feature. No locations table yet — see 03-data-model.md.';
comment on column games.scheduled_for is
  'Reserved for the planned scheduled-games feature (a future "planned" status value).';

-- buy_amount_minor / chips_per_buy are immutable once a buy-in exists
-- (03-data-model.md#games: "Changing buy_amount_minor after buy-ins exist would silently
-- rewrite history"). game_events doesn't exist as a table yet at this point in the migration
-- order, so the trigger function is created here but attached in 20260729120500_game_events.sql
-- once game_events exists.
create function prevent_buy_terms_change_after_buy_ins()
returns trigger
language plpgsql
as $$
begin
  if new.buy_amount_minor is distinct from old.buy_amount_minor
     or new.chips_per_buy is distinct from old.chips_per_buy then
    if exists (
      select 1 from game_events
      where game_id = old.id and type = 'buy_in_added'
    ) then
      raise exception 'buy_amount_minor and chips_per_buy are immutable once a buy-in exists'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
