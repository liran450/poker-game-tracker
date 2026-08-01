import type { SupabaseClient } from '@supabase/supabase-js';
import { fold, type GameEvent } from '@core/events';
import { db } from '@core/offline/db';
import { getLocalActorId } from '@core/offline/localIdentity';
import { loadGameEvents } from '@core/offline/outbox';
import { syncOutbox } from '@core/offline/syncEngine';
import { supabase } from './supabaseClient';
import { SupabaseSyncTransport } from './supabaseSyncTransport';

const ACTOR_MIGRATION_KEY = 'actorIdMigratedTo';

function requireClient(client: SupabaseClient | null = supabase): SupabaseClient {
  if (!client) {
    throw new Error(
      'localGameMigration: no Supabase client configured (VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY missing)',
    );
  }
  return client;
}

/** Narrows and rewrites the one payload field that can carry this device's own actor id (docs/build/PROGRESS.md step 12 "Left undone #3"). */
function rewriteEventActor(event: GameEvent, oldActorId: string, newUserId: string): GameEvent {
  const withActor = event.actorId === oldActorId ? { ...event, actorId: newUserId } : event;
  if (withActor.type === 'host_changed' && withActor.payload.newHostId === oldActorId) {
    return { ...withActor, payload: { ...withActor.payload, newHostId: newUserId } };
  }
  return withActor;
}

/**
 * Rewrites every locally-authored event's `actorId` from this device's
 * pre-sign-in `localActorId` to the real, signed-in profile id. Needed once:
 * `game_events.actor_id references profiles(id) not null`, so pushing an
 * event stamped with a random device id would fail that FK forever, not
 * just on the very first push. Games created *after* sign-in never have
 * this problem — they're authored with the real id from the start (nothing
 * here needs to touch them).
 *
 * Idempotent via a recorded marker, not just "safe to re-run": a second call
 * with the same `newUserId` (a re-mount, a second sign-in on the same
 * device) is a no-op rather than re-scanning the whole local log.
 */
export async function rewriteLocalActorId(newUserId: string): Promise<void> {
  const marker = await db.meta.get(ACTOR_MIGRATION_KEY);
  if (marker?.value === newUserId) return;

  const oldActorId = await getLocalActorId();
  if (oldActorId !== newUserId) {
    await db.transaction('rw', db.events, db.outbox, async () => {
      const events = await db.events.toArray();
      for (const event of events) {
        if (event.actorId !== oldActorId) continue;
        const rewritten = rewriteEventActor(event, oldActorId, newUserId);
        await db.events.put(rewritten);
        const outboxEntry = await db.outbox.get(event.clientEventId);
        if (outboxEntry) await db.outbox.put({ ...outboxEntry, event: rewritten });
      }
    });
  }

  await db.meta.put({ key: ACTOR_MIGRATION_KEY, value: newUserId });
}

/**
 * Creates the server-side `games` row for a game that has never been pushed
 * before — a brand-new local-only game, or this device's very first game
 * after sign-in — from the local `CachedGameRecord` and the folded state.
 * A no-op once the row exists, so callers can always call this before a
 * push rather than tracking "have I already done this" themselves.
 */
export async function ensureGameRowExists(
  gameId: string,
  hostUserId: string,
  client: SupabaseClient = requireClient(),
): Promise<void> {
  const { data: existing, error: selectError } = await client
    .from('games')
    .select('id')
    .eq('id', gameId)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return;

  const record = await db.games.get(gameId);
  if (!record || record.name === undefined || record.buyAmountMinor === undefined || record.chipsPerBuy === undefined) {
    throw new Error(`ensureGameRowExists: no complete local game record for ${gameId}`);
  }
  const state = fold(await loadGameEvents(gameId));

  const { error } = await client.from('games').insert({
    id: gameId,
    name: record.name,
    currency: record.currencyCode ?? 'ILS',
    buy_amount_minor: record.buyAmountMinor,
    chips_per_buy: record.chipsPerBuy,
    is_private: record.isPrivate ?? false,
    group_id: record.groupId ?? null,
    status: state.status,
    host_id: hostUserId,
    created_by: hostUserId,
    started_at: state.startedAt,
    ended_at: state.endedAt,
    unaccounted_minor: state.unaccountedMinor,
  });
  if (error) throw error;
}

/**
 * The full first-push path for one local game (PLAN.md step 12): ensure its
 * `games` row exists, push its whole outbox, and — if it already finished
 * locally — invoke `finalize_game` so the permanent snapshot exists
 * server-side too, exactly as it would have if the game had been played
 * signed-in from the start.
 */
export async function uploadLocalGame(
  gameId: string,
  hostUserId: string,
  client: SupabaseClient = requireClient(),
): Promise<void> {
  await ensureGameRowExists(gameId, hostUserId, client);
  await syncOutbox(new SupabaseSyncTransport(client), gameId);

  const state = fold(await loadGameEvents(gameId));
  if (state.status === 'finished') {
    const { error } = await client.rpc('finalize_game', { p_game_id: gameId });
    if (error) throw error;
  }
}

/**
 * Runs once per sign-in (PLAN.md step 12's exit criterion: "a pre-existing
 * local game survives first sign-in with its snapshot intact"): rewrites the
 * device's actor id, then uploads every locally-cached game. One game
 * failing (a transient network error, say) must not stop the rest — each is
 * independently retriable next time this runs, since every step it calls is
 * itself idempotent.
 */
export async function migrateAllLocalGames(
  hostUserId: string,
  client: SupabaseClient = requireClient(),
): Promise<void> {
  await rewriteLocalActorId(hostUserId);

  const games = await db.games.toArray();
  for (const game of games) {
    try {
      await uploadLocalGame(game.id, hostUserId, client);
    } catch (error) {
      console.error(`migrateAllLocalGames: failed to upload game ${game.id}`, error);
    }
  }
}
