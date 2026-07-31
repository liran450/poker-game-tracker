import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

/**
 * player_claims (03-data-model.md#player_claims) — "that guest row is me." Same two-path shape
 * as join_requests: a group member inserts directly (`player_claims_insert`, extended in step 13
 * to enforce the claim window), a share-link holder goes through `submit_claim_via_link`. Both
 * are gated host-side by `decide_claim`
 * (`supabase/migrations/20260731150000_step13_sharing_and_takeover.sql`).
 */

export interface PlayerClaim {
  readonly id: string;
  readonly gameId: string;
  readonly gamePlayerId: string;
  readonly claimantUserId: string;
  readonly status: 'pending' | 'approved' | 'rejected';
  readonly createdAt: string;
}

interface PlayerClaimRow {
  readonly id: string;
  readonly game_id: string;
  readonly game_player_id: string;
  readonly claimant_user_id: string;
  readonly status: 'pending' | 'approved' | 'rejected';
  readonly created_at: string;
}

function toPlayerClaim(row: PlayerClaimRow): PlayerClaim {
  return {
    id: row.id,
    gameId: row.game_id,
    gamePlayerId: row.game_player_id,
    claimantUserId: row.claimant_user_id,
    status: row.status,
    createdAt: row.created_at,
  };
}

function requireClient(client: SupabaseClient | null = supabase): SupabaseClient {
  if (!client) {
    throw new Error(
      'claims: no Supabase client configured (VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY missing)',
    );
  }
  return client;
}

const COLUMNS = 'id, game_id, game_player_id, claimant_user_id, status, created_at';

export async function listPendingClaims(
  gameId: string,
  client: SupabaseClient = requireClient(),
): Promise<PlayerClaim[]> {
  const { data, error } = await client
    .from('player_claims')
    .select(COLUMNS)
    .eq('game_id', gameId)
    .eq('status', 'pending')
    .returns<PlayerClaimRow[]>();
  if (error) throw error;
  return (data ?? []).map(toPlayerClaim);
}

/** The in-app path — a group member claiming a guest row directly. */
export async function submitClaimInApp(
  gameId: string,
  gamePlayerId: string,
  claimantUserId: string,
  client: SupabaseClient = requireClient(),
): Promise<void> {
  const { error } = await client.from('player_claims').insert({
    game_id: gameId,
    game_player_id: gamePlayerId,
    claimant_user_id: claimantUserId,
  });
  if (error) throw error;
}

/** The share-link path — `submit_claim_via_link` (signed-in callers only). */
export async function submitClaimViaLink(
  token: string,
  gamePlayerId: string,
  client: SupabaseClient = requireClient(),
): Promise<string> {
  const { data, error } = await client
    .rpc('submit_claim_via_link', { p_token: token, p_game_player_id: gamePlayerId })
    .single()
    .returns<string>();
  if (error) throw error;
  if (data === null) throw new Error('submitClaimViaLink: rpc returned no id');
  return data;
}

export async function decideClaim(
  claimId: string,
  approve: boolean,
  client: SupabaseClient = requireClient(),
): Promise<void> {
  const { error } = await client.rpc('decide_claim', { p_claim_id: claimId, p_approve: approve });
  if (error) throw error;
}
