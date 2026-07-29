-- groups (חבורה), membership and the invite-only path in.

create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references profiles (id),
  currency text not null default 'ILS',
  default_buy_amount_minor integer not null default 5000,
  default_chips_per_buy integer not null default 100,
  created_at timestamptz not null default now(),
  constraint name_not_blank check (btrim(name) <> ''),
  constraint positive_defaults check (default_buy_amount_minor > 0 and default_chips_per_buy > 0)
);

create table group_members (
  group_id uuid not null references groups (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  role group_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- Exactly one owner per group (03-data-model.md#group-roles).
create unique index one_owner_per_group on group_members (group_id) where role = 'owner';

-- The only way into a group (03-data-model.md#joining-a-group). Rows are written by
-- accept/decline/revoke, never updated in place otherwise.
create table group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups (id) on delete cascade,
  invited_user_id uuid not null references profiles (id),
  invited_by uuid not null references profiles (id),
  status invite_status not null default 'pending',
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

-- One open invite per person.
create unique index one_pending_invite_per_person
  on group_invites (group_id, invited_user_id)
  where status = 'pending';
