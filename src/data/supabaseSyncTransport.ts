import type { SupabaseClient } from '@supabase/supabase-js';
import { gameEventSchema, type GameEvent } from '@core/events';
import type { SyncPullResult, SyncPushResult, SyncTransport } from '@core/offline/syncTransport';
import { HOUSE_ID, POT_ID } from '@core/settlement';
import { supabase } from './supabaseClient';

/**
 * The real transport behind `core/offline`'s `SyncTransport` seam
 * (docs/build/PLAN.md step 12). Takes a `SupabaseClient` explicitly rather
 * than reaching for the module singleton, so tests can inject a mock one —
 * there is no live PostgREST endpoint reachable from this environment to
 * integration-test against (see docs/build/NOTES.md), so correctness here is
 * proven by asserting the exact calls made against a mocked client, the same
 * way a real production app would unit-test a thin data-layer class.
 *
 * Scope: `push`/`pull` replicate `game_events` — the log itself — plus the
 * handful of tables step 10 deliberately built as "written directly by the
 * host" rather than derived from the log by the server-side trigger
 * (`shared_costs`/`shared_cost_shares`, `transfers` —
 * 20260729121200_game_events_trigger.sql's scope note). Every other event
 * type (buy-ins, chip counts, settling, viewers, ...) needs nothing beyond
 * the plain `game_events` insert; the server's own trigger derives
 * `game_players` from it exactly as it already does for a directly-created
 * Supabase game.
 *
 * Deliberately NOT this class's job: creating the `games` row itself for a
 * game that has never been pushed before (a brand-new local-only game, or
 * this device's very first game after sign-in). `push()` assumes the parent
 * `games` row already exists — a foreign-key violation on `game_events` if
 * it doesn't, which `flushOutbox` already treats as an ordinary failed-push
 * retry. Ensuring the row exists first is a separate, one-time step (see
 * `ensureGameRowExists` — local-only game migration, PROGRESS.md).
 */
export class SupabaseSyncTransport implements SyncTransport {
  constructor(private readonly client: SupabaseClient = requireClient()) {}

  async push(events: readonly GameEvent[]): Promise<SyncPushResult> {
    if (events.length === 0) return { acceptedEventIds: [] };

    const plain = events.filter((e) => e.undoneBy === null);
    const undoMarkers = events.filter((e) => e.undoneBy !== null);

    if (plain.length > 0) {
      const { error } = await this.client
        .from('game_events')
        .upsert(plain.map(toEventRow), { onConflict: 'client_event_id', ignoreDuplicates: true });
      if (error) throw error;

      for (const event of plain) {
        await this.applyDirectTableWrite(event);
      }
    }

    for (const event of undoMarkers) {
      // event.undoneBy is the inverse event's clientEventId; event.clientEventId is the
      // original being marked undone — mark_event_undone(original, inverse).
      const { error } = await this.client.rpc('mark_event_undone', {
        p_original_client_event_id: event.clientEventId,
        p_inverse_client_event_id: event.undoneBy,
      });
      if (error) throw error;
    }

    const gameIds = new Set(events.map((e) => e.gameId));
    await Promise.all([...gameIds].map((gameId) => this.stampHostLastSyncedAt(gameId)));

    return { acceptedEventIds: events.map((e) => e.clientEventId) };
  }

  async pull(gameId: string, cursor?: string): Promise<SyncPullResult> {
    const base = this.client
      .from('game_events')
      .select('id, game_id, player_id, actor_id, type, payload, client_event_id, client_created_at, undone_by')
      .eq('game_id', gameId)
      .order('id', { ascending: true });
    const query = cursor ? base.gt('id', Number(cursor)) : base;

    const { data: rows, error } = await query.returns<GameEventRow[]>();
    if (error) throw error;

    // undone_by on the wire is the *inverse* event's server bigint id, not a
    // clientEventId — resolve it back to the domain's own id space so
    // fold()'s undo linkage (which only ever deals in clientEventIds) works
    // whether the undo was authored on this device or pulled from another.
    const idToClientId = new Map(rows.map((row) => [row.id, row.client_event_id]));
    const events = rows.map((row) => toGameEvent(row, idToClientId));

    const maxId = rows.length > 0 ? Math.max(...rows.map((row) => row.id)) : Number(cursor ?? 0);
    return { events, cursor: String(maxId) };
  }

  private async applyDirectTableWrite(event: GameEvent): Promise<void> {
    switch (event.type) {
      case 'shared_cost_added':
      case 'shared_cost_updated': {
        const p = event.payload;
        const { error: costError } = await this.client.from('shared_costs').upsert({
          id: p.costId,
          game_id: event.gameId,
          label: p.label,
          amount_minor: p.amountMinor,
          paid_by_player_id: p.paidByPlayerId,
          split_mode: p.splitMode,
        });
        if (costError) throw costError;

        const { error: deleteSharesError } = await this.client
          .from('shared_cost_shares')
          .delete()
          .eq('cost_id', p.costId);
        if (deleteSharesError) throw deleteSharesError;

        const shareRows = Object.entries(p.shares).map(([gamePlayerId, amountMinor]) => ({
          cost_id: p.costId,
          game_player_id: gamePlayerId,
          amount_minor: amountMinor,
        }));
        if (shareRows.length > 0) {
          const { error: insertSharesError } = await this.client
            .from('shared_cost_shares')
            .insert(shareRows);
          if (insertSharesError) throw insertSharesError;
        }
        return;
      }

      case 'shared_cost_removed': {
        const { error } = await this.client
          .from('shared_costs')
          .delete()
          .eq('id', event.payload.costId);
        if (error) throw error;
        return;
      }

      case 'transfer_edited': {
        await this.upsertTransfer(event.gameId, event.payload);
        return;
      }

      // games.status/started_at/ended_at/claim_deadline/reopen_deadline were never written by
      // anything server-side before step 13 — the game_events trigger's scope is deliberately
      // narrow (game_players only) and these four event types have empty payloads, so there was
      // nothing here to derive them from until now. Step 13's claim window and get_shared_game's
      // live/finished routing both need games.status to be real. clientCreatedAt, not wall-clock
      // "now", since a push can land long after the action happened offline (docs/build/NOTES.md).
      case 'game_started': {
        const { error } = await this.client
          .from('games')
          .update({ status: 'active', started_at: event.clientCreatedAt })
          .eq('id', event.gameId);
        if (error) throw error;
        return;
      }

      case 'game_settling': {
        const { error } = await this.client
          .from('games')
          .update({ status: 'settling' })
          .eq('id', event.gameId);
        if (error) throw error;
        return;
      }

      case 'game_ended': {
        const endedAt = event.clientCreatedAt;
        const { error } = await this.client
          .from('games')
          .update({
            status: 'finished',
            ended_at: endedAt,
            claim_deadline: addHours(endedAt, 48),
            reopen_deadline: addHours(endedAt, 24),
          })
          .eq('id', event.gameId);
        if (error) throw error;

        // The permanent snapshot (03-data-model.md#permanent-tables) — statistics (step 15) and
        // a purged game's results card (step 16) both read only from game_summaries/
        // player_results/transfer_summaries, never from the live tables above. Before this fix,
        // finalize_game() was only ever called from localGameMigration.ts's one-time backlog
        // push, so a normal signed-in host ending a game never got a permanent snapshot at all —
        // see docs/build/NOTES.md. Idempotent (finalize_game wipes and rewrites its own three
        // tables), so a retried push after a partial failure is safe.
        const { error: finalizeError } = await this.client.rpc('finalize_game', {
          p_game_id: event.gameId,
        });
        if (finalizeError) throw finalizeError;
        return;
      }

      case 'game_reopened': {
        const { error } = await this.client
          .from('games')
          .update({ status: 'active', ended_at: null, claim_deadline: null, reopen_deadline: null })
          .eq('id', event.gameId);
        if (error) throw error;
        return;
      }

      default:
        return;
    }
  }

  private async upsertTransfer(
    gameId: string,
    payload: { transferId: string; fromPlayerId: string; toPlayerId: string; amountMinor: number },
  ): Promise<void> {
    const { data: existing, error: selectError } = await this.client
      .from('transfers')
      .select('id')
      .eq('id', payload.transferId)
      .maybeSingle();
    if (selectError) throw selectError;

    const [fromParty, fromPlayerId] = toParty(payload.fromPlayerId);
    const [toPartyValue, toPlayerId] = toParty(payload.toPlayerId);

    if (existing) {
      const { error } = await this.client
        .from('transfers')
        .update({
          from_party: fromParty,
          from_player_id: fromPlayerId,
          to_party: toPartyValue,
          to_player_id: toPlayerId,
          amount_minor: payload.amountMinor,
          is_manual: true,
        })
        .eq('id', payload.transferId);
      if (error) throw error;
      return;
    }

    const { count, error: countError } = await this.client
      .from('transfers')
      .select('*', { count: 'exact', head: true })
      .eq('game_id', gameId);
    if (countError) throw countError;

    const { error } = await this.client.from('transfers').insert({
      id: payload.transferId,
      game_id: gameId,
      from_party: fromParty,
      from_player_id: fromPlayerId,
      to_party: toPartyValue,
      to_player_id: toPlayerId,
      amount_minor: payload.amountMinor,
      is_manual: true,
      order_index: count ?? 0,
    });
    if (error) throw error;
  }

  private async stampHostLastSyncedAt(gameId: string): Promise<void> {
    // Silently touches 0 rows if this device isn't the host — RLS's usual
    // "UPDATE filters non-matching rows rather than erroring" behaviour
    // (docs/build/NOTES.md), which is exactly right here: a deposed host's
    // late push still succeeds, it just doesn't get to claim the stamp.
    await this.client
      .from('games')
      .update({ host_last_synced_at: new Date().toISOString() })
      .eq('id', gameId);
  }
}

function addHours(isoString: string, hours: number): string {
  return new Date(new Date(isoString).getTime() + hours * 60 * 60 * 1000).toISOString();
}

function requireClient(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'SupabaseSyncTransport: no Supabase client configured (VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY missing)',
    );
  }
  return supabase;
}

/** `POT_ID`/`HOUSE_ID` ⇄ the server's `settlement_party` enum (docs/build/NOTES.md: "transfers needs a party column"). */
function toParty(id: string): readonly [party: 'player' | 'pot' | 'house', playerId: string | null] {
  if (id === POT_ID) return ['pot', null];
  if (id === HOUSE_ID) return ['house', null];
  return ['player', id];
}

function toEventRow(event: GameEvent) {
  return {
    game_id: event.gameId,
    player_id: event.playerId,
    actor_id: event.actorId,
    type: event.type,
    payload: event.payload,
    client_event_id: event.clientEventId,
    client_created_at: event.clientCreatedAt,
  };
}

interface GameEventRow {
  id: number;
  game_id: string;
  player_id: string | null;
  actor_id: string;
  type: GameEvent['type'];
  payload: unknown;
  client_event_id: string;
  client_created_at: string;
  undone_by: number | null;
}

/**
 * Validated at this boundary via the same `gameEventSchema` `core/events.ts`
 * uses for events arriving from anywhere else (CLAUDE.md: "validate on the
 * way in") — a row this shape-wrong would mean either a bug in `push()`'s
 * own mapping or a schema drift `eventEnumParity.test.ts` didn't catch, and
 * either way `fold()` should never see it.
 */
function toGameEvent(row: GameEventRow, idToClientId: ReadonlyMap<number, string>): GameEvent {
  // The cast is safe, not a shortcut around validation: `.parse()` above already throws on
  // anything that doesn't match one of `gameEventSchema`'s variants. The type-level cast is only
  // needed because the schema's own discriminated union is built via a `z.core.$ZodLooseShape`
  // cast (core/events.ts, docs/build/NOTES.md's "Zod v4 discriminatedUnion type assertion" —
  // a type-level-only issue, same file, same trap), which erases `z.infer`'s ability to narrow
  // the parsed result back to the real `GameEvent` union.
  return gameEventSchema.parse({
    clientEventId: row.client_event_id,
    gameId: row.game_id,
    playerId: row.player_id,
    actorId: row.actor_id,
    clientCreatedAt: row.client_created_at,
    undoneBy: row.undone_by === null ? null : (idToClientId.get(row.undone_by) ?? null),
    type: row.type,
    payload: row.payload,
  }) as unknown as GameEvent;
}
