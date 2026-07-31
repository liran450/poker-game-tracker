import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

/**
 * join_requests (03-data-model.md#join_requests, #two-paths-in-one-gate). The in-app,
 * group-member path is a plain RLS-gated insert (`join_requests_insert`, step 10) — nothing here
 * wraps it beyond the read helpers, since there's no elevation to add. The share-link path needs
 * `submit_join_request_via_link` (step 13, signed-in only — see the migration's own comment and
 * docs/build/NOTES.md for why an anonymous requester isn't in scope).
 */

export interface JoinRequest {
  readonly id: string;
  readonly gameId: string;
  readonly userId: string | null;
  readonly requestedName: string;
  readonly requestedRole: 'player' | 'viewer';
  readonly source: 'link' | 'in_app';
  readonly status: 'pending' | 'approved' | 'rejected';
  readonly createdAt: string;
}

interface JoinRequestRow {
  readonly id: string;
  readonly game_id: string;
  readonly user_id: string | null;
  readonly requested_name: string;
  readonly requested_role: 'player' | 'viewer';
  readonly source: 'link' | 'in_app';
  readonly status: 'pending' | 'approved' | 'rejected';
  readonly created_at: string;
}

function toJoinRequest(row: JoinRequestRow): JoinRequest {
  return {
    id: row.id,
    gameId: row.game_id,
    userId: row.user_id,
    requestedName: row.requested_name,
    requestedRole: row.requested_role,
    source: row.source,
    status: row.status,
    createdAt: row.created_at,
  };
}

function requireClient(client: SupabaseClient | null = supabase): SupabaseClient {
  if (!client) {
    throw new Error(
      'joinRequests: no Supabase client configured (VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY missing)',
    );
  }
  return client;
}

const COLUMNS = 'id, game_id, user_id, requested_name, requested_role, source, status, created_at';

export async function listPendingJoinRequests(
  gameId: string,
  client: SupabaseClient = requireClient(),
): Promise<JoinRequest[]> {
  const { data, error } = await client
    .from('join_requests')
    .select(COLUMNS)
    .eq('game_id', gameId)
    .eq('status', 'pending')
    .returns<JoinRequestRow[]>();
  if (error) throw error;
  return (data ?? []).map(toJoinRequest);
}

/** The in-app path — a group member asking about a live game they can already see is live. */
export async function requestToJoinInApp(
  gameId: string,
  userId: string,
  requestedName: string,
  requestedRole: 'player' | 'viewer' = 'player',
  client: SupabaseClient = requireClient(),
): Promise<void> {
  const { error } = await client.from('join_requests').insert({
    game_id: gameId,
    user_id: userId,
    requested_name: requestedName.trim(),
    requested_role: requestedRole,
    source: 'in_app',
  });
  if (error) throw error;
}

/** The share-link path — `submit_join_request_via_link` (signed-in callers only). */
export async function requestToJoinViaLink(
  token: string,
  requestedName: string,
  requestedRole: 'player' | 'viewer' = 'player',
  client: SupabaseClient = requireClient(),
): Promise<string> {
  const { data, error } = await client
    .rpc('submit_join_request_via_link', {
      p_token: token,
      p_requested_name: requestedName.trim(),
      p_requested_role: requestedRole,
    })
    .single()
    .returns<string>();
  if (error) throw error;
  if (data === null) throw new Error('requestToJoinViaLink: rpc returned no id');
  return data;
}

export async function decideJoinRequest(
  requestId: string,
  approve: boolean,
  client: SupabaseClient = requireClient(),
): Promise<void> {
  const { error } = await client.rpc('decide_join_request', {
    p_request_id: requestId,
    p_approve: approve,
  });
  if (error) throw error;
}
