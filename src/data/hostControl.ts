import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

/**
 * The two ways host control moves between devices (04-ux-spec.md#host-handover-and-takeover):
 * `handOverHost` is voluntary and gated on the target already being a signed-in player or viewer
 * — guests can't be host, they have no account. `takeOverHost` is unilateral and ungated, for
 * when the current host's phone has died; both RPCs already existed server-side
 * (`take_over_host` since step 10, `hand_over_host` new in step 13's migration) but neither was
 * wired to a client caller before this.
 */

function requireClient(client: SupabaseClient | null = supabase): SupabaseClient {
  if (!client) {
    throw new Error(
      'hostControl: no Supabase client configured (VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY missing)',
    );
  }
  return client;
}

export async function handOverHost(
  gameId: string,
  newHostId: string,
  client: SupabaseClient = requireClient(),
): Promise<void> {
  const { error } = await client.rpc('hand_over_host', {
    p_game_id: gameId,
    p_new_host_id: newHostId,
  });
  if (error) throw error;
}

export async function takeOverHost(
  gameId: string,
  client: SupabaseClient = requireClient(),
): Promise<void> {
  const { error } = await client.rpc('take_over_host', { p_game_id: gameId });
  if (error) throw error;
}

/**
 * `games.host_last_synced_at` is server-only — it's not part of the event log, so it never
 * reaches local IndexedDB state the way everything else in `GameState` does (`core/offline`'s
 * fold has nothing to derive it from). The takeover warning modal
 * (04-ux-spec.md#host-takeover-warning) needs a fresh read at the moment it's shown, not a
 * locally-cached value that could itself be stale.
 */
export async function getHostLastSyncedAt(
  gameId: string,
  client: SupabaseClient = requireClient(),
): Promise<string | null> {
  const { data, error } = await client
    .from('games')
    .select('host_last_synced_at')
    .eq('id', gameId)
    .maybeSingle()
    .returns<{ host_last_synced_at: string | null } | null>();
  if (error) throw error;
  return data?.host_last_synced_at ?? null;
}
