-- Append-only. The source of truth for a live game (03-data-model.md#game_events).

create table game_events (
  id bigint generated always as identity primary key,
  game_id uuid not null references games (id) on delete cascade,
  -- Deferred, not immediate: a player_added event's player_id points at a game_players row
  -- that the AFTER INSERT trigger (below) creates from this same event, inside the same
  -- transaction. An immediate FK would reject the insert before the trigger has a chance to run.
  player_id uuid references game_players (id) deferrable initially deferred,
  actor_id uuid not null references profiles (id),
  type game_event_type not null,
  payload jsonb not null default '{}'::jsonb,
  client_event_id uuid not null unique,
  client_created_at timestamptz not null,
  created_at timestamptz not null default now(),
  -- Points at the inverse event. Never cleared once set — undo-of-undo does not resurrect
  -- (core/events.ts's fold() relies on this staying permanent).
  undone_by bigint references game_events (id)
);

create index game_events_game_id_idx on game_events (game_id);
create index game_events_player_id_idx on game_events (player_id) where player_id is not null;

-- Now that game_events exists, attach the immutability guard from
-- 20260729120300_games.sql.
create trigger games_prevent_buy_terms_change
  before update on games
  for each row
  execute function prevent_buy_terms_change_after_buy_ins();
