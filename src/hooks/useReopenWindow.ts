import { useEffect, useState } from 'react';

const REOPEN_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface ReopenWindow {
  readonly canReopen: boolean;
  readonly hoursRemaining: number | null;
}

/**
 * `פתח מחדש` availability (03-data-model.md#permanent-tables): open for 24h
 * after `game_ended`. Ticks every minute so the countdown in the `⋯` menu
 * — and the option disappearing exactly at the deadline — stays live
 * without a manual refresh.
 */
export function useReopenWindow(endedAt: string | null): ReopenWindow {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!endedAt) return;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [endedAt]);

  if (!endedAt) return { canReopen: false, hoursRemaining: null };

  const remainingMs = new Date(endedAt).getTime() + REOPEN_WINDOW_MS - now;
  const canReopen = remainingMs > 0;
  return {
    canReopen,
    hoursRemaining: canReopen ? Math.max(1, Math.ceil(remainingMs / (60 * 60 * 1000))) : null,
  };
}
