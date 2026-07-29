import { create, type StoreApi, type UseBoundStore } from 'zustand';
import type { GameEvent } from '@core/events';

/**
 * The coalescing undo window behind the buy-in counter
 * (04-ux-spec.md#the-buy-in-counter--the-most-important-interaction-in-the-app).
 * A tap writes its event immediately (optimistic, already committed locally)
 * and also lands here so the snackbar/batch bar can show it and undo it. Every
 * new tap — on any row — resets the inactivity timer; the window closes
 * itself once `windowMs` passes with no further taps, which is what keeps the
 * app out of a "dirty, needs confirming" state.
 *
 * This is exactly the kind of per-tap, frequently-updating UI state
 * CLAUDE.md says doesn't belong in React Context — Zustand per
 * 02-architecture.md#frontend-stack.
 */
export interface BuyInBatchEntry {
  readonly playerId: string;
  /** Net change this window: +2 for two adds, 0 for an add cancelled by a remove. */
  readonly deltaBuys: number;
  /** Every buy_in_added/removed event in this window for this player, in tap order — undo replays all of them. */
  readonly events: readonly GameEvent[];
}

export interface BuyInBatchState {
  readonly entries: readonly BuyInBatchEntry[];
  /** Bumped on every tap in the current window — lets the UI force a fresh mount/timer per tap (e.g. `key={tapCount}`). */
  readonly tapCount: number;
  addTap: (playerId: string, delta: 1 | -1, event: GameEvent) => void;
  clear: () => void;
}

export const BUY_IN_BATCH_WINDOW_MS = 3000;

export function createBuyInBatchStore(
  windowMs: number = BUY_IN_BATCH_WINDOW_MS,
): UseBoundStore<StoreApi<BuyInBatchState>> {
  let closeTimer: ReturnType<typeof setTimeout> | null = null;

  return create<BuyInBatchState>((set, get) => ({
    entries: [],
    tapCount: 0,

    addTap: (playerId, delta, event) => {
      if (closeTimer !== null) clearTimeout(closeTimer);

      const { entries, tapCount } = get();
      const index = entries.findIndex((entry) => entry.playerId === playerId);
      const next =
        index === -1
          ? [...entries, { playerId, deltaBuys: delta, events: [event] }]
          : entries.map((entry, i) =>
              i === index
                ? { ...entry, deltaBuys: entry.deltaBuys + delta, events: [...entry.events, event] }
                : entry,
            );

      set({ entries: next, tapCount: tapCount + 1 });

      closeTimer = setTimeout(() => {
        closeTimer = null;
        set({ entries: [], tapCount: 0 });
      }, windowMs);
    },

    clear: () => {
      if (closeTimer !== null) clearTimeout(closeTimer);
      closeTimer = null;
      set({ entries: [], tapCount: 0 });
    },
  }));
}

export const useBuyInBatchStore = createBuyInBatchStore();
