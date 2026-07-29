-- Pizza, tips, the table's beer. Affects settlement only, never poker statistics
-- (03-data-model.md#shared_cost_shares).

create table shared_costs (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  label text not null,
  amount_minor integer not null check (amount_minor > 0),
  paid_by_player_id uuid references game_players (id),
  split_mode split_mode not null,
  created_at timestamptz not null default now(),
  constraint label_not_blank check (btrim(label) <> '')
);

create table shared_cost_shares (
  cost_id uuid not null references shared_costs (id) on delete cascade,
  game_player_id uuid not null references game_players (id) on delete cascade,
  amount_minor integer not null check (amount_minor >= 0),
  primary key (cost_id, game_player_id)
);

create index shared_costs_game_id_idx on shared_costs (game_id);
