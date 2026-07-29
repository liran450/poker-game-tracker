-- Mirrors auth.users. auth.users itself is provided by the Supabase platform, not by our
-- migrations — see supabase/tests/support/auth-shim.sql for the local/CI stand-in.

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  display_name text not null,
  default_nickname text,
  avatar_url text,
  phone text,
  locale text not null default 'he',
  stats_visibility stats_visibility not null default 'group',
  created_at timestamptz not null default now(),
  constraint username_not_blank check (btrim(username) <> '')
);

comment on table profiles is
  'Real name, username and avatar are readable to co-members of a shared group '
  'via the profiles_public view (see the RLS migration); everything else is self-only.';
