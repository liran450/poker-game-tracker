-- Enumerated types shared across the schema.
--
-- game_event_type must match core/events.ts's EVENT_TYPES character for character —
-- see src/test/db/eventEnumParity.test.ts, which reads both and fails the build if they drift.

create type game_status as enum ('setup', 'active', 'settling', 'finished');

create type stats_visibility as enum ('group', 'private');

create type group_role as enum ('owner', 'admin', 'member');

create type invite_status as enum ('pending', 'accepted', 'declined', 'revoked');

create type split_mode as enum ('equal', 'custom');

-- Shared by join_requests.status and player_claims.status (03-data-model.md gives both
-- tables the same three-value lifecycle).
create type approval_status as enum ('pending', 'approved', 'rejected');

create type join_request_role as enum ('player', 'viewer');

create type join_request_source as enum ('link', 'in_app');

-- Not in 03-data-model.md's transfers table, which predates the house/unaccounted node
-- (step 8). See the "transfers needs a party column" entry in docs/build/NOTES.md.
create type settlement_party as enum ('player', 'pot', 'house');

create type game_event_type as enum (
  'player_added',
  'player_removed',
  'player_renamed',
  'nickname_set',
  'buy_in_added',
  'buy_in_removed',
  'cash_paid_set',
  'chips_set',
  'player_settled',
  'player_reopened',
  'shared_cost_added',
  'shared_cost_removed',
  'shared_cost_updated',
  'game_started',
  'game_settling',
  'game_ended',
  'game_reopened',
  'host_changed',
  'host_taken_over',
  'viewer_added',
  'viewer_removed',
  'join_requested',
  'join_approved',
  'join_rejected',
  'player_invited',
  'claim_requested',
  'claim_approved',
  'claim_rejected',
  'unaccounted_set',
  'transfer_edited',
  'note'
);
