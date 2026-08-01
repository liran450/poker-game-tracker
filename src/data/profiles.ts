import type { SupabaseClient } from '@supabase/supabase-js';
import type { StatsVisibility } from '@core/statistics';
import { supabase } from './supabaseClient';

/**
 * `profiles` (03-data-model.md, `20260729120100_profiles.sql`) has no
 * server-side "create on sign-up" trigger — `profiles_insert_self` is a
 * plain RLS-gated insert, so the client is what creates the row, once, right
 * after a real account first signs in and before it has a `username`
 * (PLAN.md step 12: "No profile-creation step ... needs its own small
 * flow"). Username uniqueness is enforced by the table's own `unique`
 * constraint, not a separate availability-check RPC — this module just
 * catches the resulting `23505` and turns it into a typed error the UI can
 * show inline.
 */
export interface Profile {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly defaultNickname: string | null;
}

export interface CreateProfileInput {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly defaultNickname?: string | null;
}

export class UsernameTakenError extends Error {
  constructor(readonly username: string) {
    super(`Username "${username}" is already taken`);
    this.name = 'UsernameTakenError';
  }
}

function requireClient(client: SupabaseClient | null = supabase): SupabaseClient {
  if (!client) {
    throw new Error(
      'profiles: no Supabase client configured (VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY missing)',
    );
  }
  return client;
}

interface ProfileRow {
  readonly id: string;
  readonly username: string;
  readonly display_name: string;
  readonly default_nickname: string | null;
}

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    defaultNickname: row.default_nickname,
  };
}

function isUniqueViolation(error: { code?: string; message?: string }): boolean {
  return error.code === '23505' || /duplicate key value|unique constraint/i.test(error.message ?? '');
}

export async function getProfile(
  userId: string,
  client: SupabaseClient = requireClient(),
): Promise<Profile | null> {
  const { data, error } = await client
    .from('profiles')
    .select('id, username, display_name, default_nickname')
    .eq('id', userId)
    .maybeSingle()
    .returns<ProfileRow | null>();
  if (error) throw error;
  return data ? toProfile(data) : null;
}

export interface PublicProfile {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  /** `'private'` means: keep off the group leaderboard, still count anonymously (06-statistics.md#scoping). */
  readonly statsVisibility: StatsVisibility;
}

interface PublicProfileRow {
  readonly id: string;
  readonly username: string;
  readonly display_name: string;
  readonly stats_visibility?: StatsVisibility;
}

/**
 * `profiles_public` (co-members-only username/display_name/avatar_url/stats_visibility — see the
 * RLS migration's comment and `20260802090000_step15_statistics.sql`) — used to render
 * viewer/player names the caller doesn't already know locally, e.g. the share sheet's viewer list
 * (docs/build/PLAN.md step 13) and the group leaderboard's suppression (step 15).
 */
export async function getProfilesPublic(
  userIds: readonly string[],
  client: SupabaseClient = requireClient(),
): Promise<PublicProfile[]> {
  if (userIds.length === 0) return [];
  const { data, error } = await client
    .from('profiles_public')
    .select('id, username, display_name, stats_visibility')
    .in('id', userIds)
    .returns<PublicProfileRow[]>();
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    // Defensive default for fixtures/fakes seeded before this column existed — the real column is
    // `not null default 'group'`, so this only ever bites a test, never production.
    statsVisibility: row.stats_visibility ?? 'group',
  }));
}

export async function createProfile(
  input: CreateProfileInput,
  client: SupabaseClient = requireClient(),
): Promise<Profile> {
  const { data, error } = await client
    .from('profiles')
    .insert({
      id: input.id,
      username: input.username.trim(),
      display_name: input.displayName.trim(),
      default_nickname: input.defaultNickname?.trim() || null,
    })
    .select('id, username, display_name, default_nickname')
    .maybeSingle()
    .returns<ProfileRow | null>();

  if (error) {
    if (isUniqueViolation(error)) throw new UsernameTakenError(input.username.trim());
    throw error;
  }
  if (!data) throw new Error('createProfile: insert returned no row');
  return toProfile(data);
}
