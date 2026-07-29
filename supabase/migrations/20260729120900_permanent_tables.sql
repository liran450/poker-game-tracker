-- Written once, when a game reaches finished, and kept forever
-- (03-data-model.md#permanent-tables). Writable by nobody at the RLS layer — only
-- finalize_game(), running as the table owner, may insert (built in step 11, not here).

create table game_summaries (
  -- Same id as the original game; the games row may no longer exist once purged.
  game_id uuid primary key,
  group_id uuid,
  name text not null,
  played_on date not null,
  currency text not null,
  buy_amount_minor integer not null,
  chips_per_buy integer not null,
  player_count integer not null,
  duration_minutes integer not null,
  total_buy_ins_minor integer not null,
  total_cash_pot_minor integer not null,
  unaccounted_minor integer not null,
  shared_costs_minor integer not null,
  is_private boolean not null default false,
  -- Reserved — denormalised so a purged game can still feed a "most-played place" stat.
  location_name text,
  finished_at timestamptz not null
);

create table player_results (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references game_summaries (game_id),
  group_id uuid,
  is_private boolean not null default false,
  user_id uuid references profiles (id),
  guest_name text,
  display_name text not null,
  buys_count integer not null,
  owed_minor integer not null,
  cash_paid_minor integer not null,
  chips_final integer not null,
  cash_out_minor integer not null,
  net_minor integer not null,
  shared_costs_share_minor integer not null,
  minutes_played integer not null,
  settled_position integer
);

create index player_results_game_id_idx on player_results (game_id);
create index player_results_group_id_idx on player_results (group_id) where group_id is not null;
create index player_results_user_id_idx on player_results (user_id) where user_id is not null;

create table transfer_summaries (
  game_id uuid not null references game_summaries (game_id),
  from_name text not null,
  to_name text not null,
  from_user_id uuid references profiles (id),
  to_user_id uuid references profiles (id),
  amount_minor integer not null check (amount_minor >= 0),
  order_index integer not null
);

create index transfer_summaries_game_id_idx on transfer_summaries (game_id);

-- player_results now exists — add the FK reserved in 20260729120800_sharing_and_requests.sql.
alter table player_claims
  add constraint player_claims_player_result_id_fkey
  foreign key (player_result_id) references player_results (id);
