import { useEffect } from 'react';
import { isCloudConfigured } from '@data/auth';
import { subscribeToGameEvents } from '@data/realtime';
import { SupabaseSyncTransport } from '@data/supabaseSyncTransport';
import { startPolling, syncPull } from '@core/offline/syncEngine';

/**
 * Keeps an open game current with the server (PLAN.md step 12): an initial
 * pull, a realtime subscription for the fast path, and the 15s polling
 * fallback for networks that block WebSockets. Either one alone is
 * eventually sufficient to notice a change, so there's no coordination
 * needed between them beyond both calling the same `syncPull` — a realtime
 * notification and a poll landing back to back just makes the second one a
 * no-op (nothing new since the last cursor).
 *
 * A no-op wherever cloud sync isn't configured (every environment without
 * `VITE_SUPABASE_*`, this sandbox always) — offline-first has no step-12
 * exception, so a purely local game must behave identically whether or not
 * this hook does anything at all.
 */
export function useLiveGameSync(gameId: string | undefined): void {
  useEffect(() => {
    if (!gameId || !isCloudConfigured()) return;

    const transport = new SupabaseSyncTransport();
    void syncPull(transport, gameId);

    const unsubscribeRealtime = subscribeToGameEvents(gameId, () => {
      void syncPull(transport, gameId);
    });
    const stopPolling = startPolling(transport, gameId);

    return () => {
      unsubscribeRealtime();
      stopPolling();
    };
  }, [gameId]);
}
