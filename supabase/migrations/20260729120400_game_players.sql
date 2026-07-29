-- One person in one game, registered or guest. The row's id is minted client-side
-- (matches core/events.ts's GameEvent.playerId) and the row itself is created by the
-- game_events trigger on a player_added event, not by a direct insert — see
-- 20260729120500_game_events.sql.

create table game_players (
  id uuid primary key,
  game_id uuid not null references games (id) on delete cascade,
  user_id uuid references profiles (id),
  guest_name text,
  nickname text,
  seat_order integer not null,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  buys_count integer not null default 0,
  -- Reserved — non-standard/half buy-ins are deferred (09-roadmap.md#explicitly-deferred).
  custom_buys_minor integer,
  cash_paid_minor integer not null default 0,
  chips_final integer,
  is_settled boolean not null default false,
  settled_at timestamptz,
  is_removed boolean not null default false,
  -- A plain UNIQUE constraint already permits any number of NULL user_ids (guests), so this
  -- is exactly "unique (game_id, user_id) where user_id is not null" without needing a partial
  -- index.
  unique (game_id, user_id),
  constraint guest_or_registered check (user_id is not null or guest_name is not null),
  constraint buys_count_not_negative check (buys_count >= 0)
);

comment on column game_players.custom_buys_minor is
  'Reserved. Non-standard buy-in amounts are deferred — see 09-roadmap.md.';
