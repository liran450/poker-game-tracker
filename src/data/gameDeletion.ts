import type { SupabaseClient } from '@supabase/supabase-js';
import { deleteGameLocally } from '@core/offline/gameActions';
import { supabase } from './supabaseClient';

/**
 * `מחק משחק` (03-data-model.md#retention-and-archiving, docs/build/PLAN.md step 16). Always
 * clears this device's own copy first (`core/offline/gameActions.ts#deleteGameLocally`), then —
 * if the app is cloud-configured at all — attempts the remote `games` row too. That attempt is
 * safe to make unconditionally, even for a game this device never pushed, or when signed out:
 * `games_delete`'s RLS (`host_id = auth.uid()`) simply matches zero rows rather than erroring for
 * anyone but the real host (the same "no path, not an error" shape group_members_delete already
 * relies on, docs/build/NOTES.md), and deleting a row that was never there is a no-op. The remote
 * delete cascades every tier-2/3 table (`on delete cascade` from `games`, 20260729120500_
 * game_events.sql onward); the permanent tier-1 snapshot survives untouched because
 * game_summaries/player_results/transfer_summaries carry no foreign key back to `games` at all
 * (20260729120900_permanent_tables.sql's own comment: "the games row may no longer exist once
 * purged") — exactly "the detailed data is deleted, the statistics are kept" the confirmation
 * copy promises.
 */
export async function deleteGame(gameId: string, client: SupabaseClient | null = supabase): Promise<void> {
  await deleteGameLocally(gameId);
  if (!client) return;
  const { error } = await client.from('games').delete().eq('id', gameId);
  if (error) throw error;
}
