-- Viewers, share links, and the two-paths-in-one-gate join/claim flow
-- (03-data-model.md#game_viewers-5-14, #share_links-5, #join_requests-21, #player_claims-21).

create table game_viewers (
  game_id uuid not null references games (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  -- NULL means they joined via the share link, not an explicit host add.
  added_by uuid references profiles (id),
  added_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

create table share_links (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  -- SHA-256 of the token. The plaintext token is never stored — see 03-data-model.md#link-security.
  token_hash bytea not null unique,
  token_prefix text not null,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_viewed_at timestamptz,
  view_count integer not null default 0,
  constraint token_hash_length check (octet_length(token_hash) = 32)
);

create index share_links_game_id_idx on share_links (game_id);

create table join_requests (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  user_id uuid references profiles (id),
  requested_name text not null,
  requested_role join_request_role not null default 'player',
  source join_request_source not null,
  status approval_status not null default 'pending',
  decided_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint requested_name_not_blank check (btrim(requested_name) <> '')
);

-- One open request per person.
create unique index one_pending_join_request_per_person
  on join_requests (game_id, user_id)
  where status = 'pending' and user_id is not null;

create table player_claims (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  game_player_id uuid not null references game_players (id) on delete cascade,
  -- Set once the game is finished. player_results doesn't exist until the permanent-tables
  -- migration, so the FK is added there (see 20260729121000_permanent_tables.sql).
  player_result_id uuid,
  claimant_user_id uuid not null references profiles (id),
  status approval_status not null default 'pending',
  decided_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

-- Two people can't both own the same row. Multiple pending claims on one row are fine; the
-- host picks one and the rest are rejected.
create unique index one_approved_claim_per_player
  on player_claims (game_player_id)
  where status = 'approved';
