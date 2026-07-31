import type { SupabaseClient } from '@supabase/supabase-js';
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
