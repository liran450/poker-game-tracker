import { flushOutbox, type FlushResult } from './outbox';
import type { SyncTransport } from './syncTransport';

/**
 * "Currently pushing" is transient, in-memory, per-game state — it isn't a
 * fact the outbox table itself records. A tiny external store keeps the UI
 * (`useSyncState`) reactive to it via `useSyncExternalStore` without pulling
 * in a state library for one boolean.
 */
const inFlight = new Set<string>();
const listeners = new Set<() => void>();

function key(gameId: string | undefined): string {
  return gameId ?? '__all__';
}

function notify(): void {
  for (const listener of listeners) listener();
}

export function isSyncing(gameId?: string): boolean {
  return inFlight.has(key(gameId));
}

export function subscribeSyncing(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Wraps `flushOutbox`, marking the game (or the whole outbox) as syncing for its duration. */
export async function syncOutbox(transport: SyncTransport, gameId?: string): Promise<FlushResult> {
  const k = key(gameId);
  inFlight.add(k);
  notify();
  try {
    return await flushOutbox(transport, gameId);
  } finally {
    inFlight.delete(k);
    notify();
  }
}
