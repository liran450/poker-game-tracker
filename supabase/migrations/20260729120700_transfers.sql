-- Produced by settlement, then editable (03-data-model.md#transfers).
--
-- Deviation from 03-data-model.md: that doc's transfers table has a single nullable
-- from_player_id/to_player_id pair ("NULL = the pot"), written before step 8 added a second
-- non-player settlement node — the house/unaccounted node (core/settlement.ts's HOUSE_ID).
-- core/events.ts's transfer_edited payload already moved to two string sentinels (POT_ID,
-- HOUSE_ID) for exactly this reason (see docs/build/NOTES.md, step 9). Cramming two sentinels
-- into one nullable uuid column would mean inventing magic non-null uuid constants with no
-- real row behind them; a small party enum keeps from_player_id a genuine, FK-checked
-- reference to game_players whenever the transfer is actually a player, and party carries the
-- pot/house/player distinction explicitly instead.

create table transfers (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  from_party settlement_party not null default 'player',
  from_player_id uuid references game_players (id),
  to_party settlement_party not null default 'player',
  to_player_id uuid references game_players (id),
  amount_minor integer not null check (amount_minor >= 0),
  is_manual boolean not null default false,
  order_index integer not null,
  constraint from_player_id_matches_party check (
    (from_party = 'player' and from_player_id is not null)
    or (from_party <> 'player' and from_player_id is null)
  ),
  constraint to_player_id_matches_party check (
    (to_party = 'player' and to_player_id is not null)
    or (to_party <> 'player' and to_player_id is null)
  )
);

create index transfers_game_id_idx on transfers (game_id);

comment on table transfers is
  'There is deliberately no "mark as paid" flag — see 03-data-model.md#transfers.';
