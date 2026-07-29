-- Local/CI stand-in for the `auth` schema a real Supabase project provides out of the box.
--
-- Never applied to a real Supabase project — it already has a real `auth` schema, owned by
-- the platform, with real GoTrue-issued JWTs behind auth.uid()/auth.role(). This file exists
-- purely so supabase/migrations/*.sql (which assume `auth.users` and `auth.uid()` already
-- exist, exactly as they would on the real platform) can be applied to a plain local Postgres
-- for testing, since the Supabase CLI's own local stack needs Docker and this sandbox has none
-- (see docs/build/NOTES.md).
--
-- auth.uid()/auth.role() mirror Supabase's real implementation: they read GUCs that PostgREST
-- sets per-request from the caller's verified JWT. Tests simulate a caller by doing
-- `set local role authenticated; set local request.jwt.claim.sub = '<uuid>';` before a query,
-- or `set local role anon;` with no claim for anonymous.

create schema if not exists auth;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  created_at timestamptz not null default now()
);

create function auth.uid() returns uuid
  language sql stable
  as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create function auth.role() returns text
  language sql stable
  as $$
    select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user);
$$;

-- The two Postgres roles PostgREST authenticates requests as on the real platform.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$$;

grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;

-- The real platform grants anon/authenticated coarse table/sequence/function access by
-- default, before any app migration runs, so that RLS is the *only* real gate
-- (docs/02-architecture.md#security-model: "everything rests on RLS"). ALTER DEFAULT
-- PRIVILEGES makes every table/sequence/function the migrations create afterward inherit
-- these grants automatically; a later explicit REVOKE in a migration (e.g. game_events'
-- update/delete) still wins, since REVOKE always runs after the CREATE TABLE it targets.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated;
alter default privileges in schema public
  grant execute on functions to anon, authenticated;
