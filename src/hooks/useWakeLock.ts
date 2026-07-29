import { useEffect } from 'react';

/**
 * Keeps the screen awake while a game is open — the host's phone sleeping
 * every 30 seconds mid-count is the single most annoying thing this app could
 * do (04-ux-spec.md). The OS releases the lock whenever the tab is hidden, so
 * it's re-requested on every `visibilitychange` back to visible. Silently a
 * no-op where the API doesn't exist; there is no acceptable fallback.
 */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          await lock.release();
          return;
        }
        sentinel = lock;
      } catch {
        // Denied or unsupported in this context — nothing to fall back to.
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && sentinel === null) {
        void acquire();
      }
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      void sentinel?.release();
      sentinel = null;
    };
  }, [enabled]);
}
