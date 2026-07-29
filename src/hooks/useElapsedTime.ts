import { useEffect, useState } from 'react';

/**
 * The header's running clock (04-ux-spec.md#game-page--the-main-screen) —
 * needed for profit-per-hour (#24) and "genuinely useful at 2am". Formatted
 * `H:MM`, not `MM:SS`: a poker night runs hours, not seconds, and the
 * mockup's `02:14` reads as 2h14m in that context. Ticks once a minute; a
 * clock display doesn't need second-level re-renders.
 */
export function useElapsedTime(startedAt: string | null): string {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [startedAt]);

  if (!startedAt) return '00:00';

  const elapsedMs = Math.max(0, now - new Date(startedAt).getTime());
  const totalMinutes = Math.floor(elapsedMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
