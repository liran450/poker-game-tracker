import { flushOutbox, pullGameEvents, type FlushResult, type PullResult } from './outbox';
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

/** Wraps `pullGameEvents` the same way `syncOutbox` wraps `flushOutbox` — same indicator, both directions. */
export async function syncPull(transport: SyncTransport, gameId: string): Promise<PullResult> {
  const k = key(gameId);
  inFlight.add(k);
  notify();
  try {
    return await pullGameEvents(transport, gameId);
  } finally {
    inFlight.delete(k);
    notify();
  }
}

/**
 * The 15s polling fallback (PLAN.md step 12) for networks that block
 * WebSockets — realtime's own subscription (`src/data/realtime.ts`) is the
 * fast path; this is what keeps an open game current if that channel never
 * connects at all, not just a backstop for a dropped one. Callers combine
 * both (`useLiveGameSync`); this function knows nothing about realtime.
 */
export function startPolling(
  transport: SyncTransport,
  gameId: string,
  intervalMs = 15_000,
): () => void {
  const id = setInterval(() => {
    void syncPull(transport, gameId);
  }, intervalMs);
  return () => clearInterval(id);
}
