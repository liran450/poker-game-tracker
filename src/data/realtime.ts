import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

/**
 * Realtime Postgres changes on `game_events` for one game (PLAN.md step 12).
 * Only `game_events` INSERTs are listened for, not `game_players` too, even
 * though PLAN.md names both: every write this app makes to `game_players` is
 * itself derived, in the same transaction, from a `game_events` insert (the
 * `apply_game_event_to_player_cache` trigger, `NOTES.md`'s "cache trigger is
 * scoped to game_players only" entry) or from an RPC that also appends a
 * matching event (`take_over_host`, `decide_join_request`). There is no
 * write path that touches `game_players` without a `game_events` row landing
 * in the same instant, so subscribing to the log is sufficient to know when
 * to pull — a second subscription would only ever fire alongside the first.
 *
 * The callback is a plain "something changed, go pull" signal — it doesn't
 * carry the changed row, since `pull()`'s cursor-based fetch (not this
 * notification) is what stays the single source of truth for what's new,
 * including anything missed while the socket was down.
 */
export function subscribeToGameEvents(
  gameId: string,
  onChange: () => void,
  client: SupabaseClient | null = supabase,
): () => void {
  if (!client) return () => {};

  const channel = client
    .channel(`game_events:${gameId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'game_events', filter: `game_id=eq.${gameId}` },
      onChange,
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}
