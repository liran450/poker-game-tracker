import { useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { SyncState } from '@components/SyncIndicator';
import { getOutboxSummary } from './outbox';
import { isSyncing, subscribeSyncing } from './syncEngine';

export interface UseSyncStateResult {
  readonly state: SyncState;
  readonly pendingCount: number;
}

const EMPTY_SUMMARY = { pendingCount: 0, failedCount: 0 };

/** Drives `<SyncIndicator>` from the real outbox — never a derived guess. */
export function useSyncState(gameId?: string): UseSyncStateResult {
  const summary = useLiveQuery(() => getOutboxSummary(gameId), [gameId]) ?? EMPTY_SUMMARY;
  const syncing = useSyncExternalStore(subscribeSyncing, () => isSyncing(gameId));

  const state: SyncState = syncing
    ? 'syncing'
    : summary.failedCount > 0
      ? 'failed'
      : summary.pendingCount > 0
        ? 'pending'
        : 'synced';

  return { state, pendingCount: summary.pendingCount + summary.failedCount };
}
