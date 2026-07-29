import { useEffect } from 'react';

/**
 * Warns before the tab closes while the outbox is non-empty
 * (02-architecture.md#offline-first). Browsers ignore any custom message
 * text on `beforeunload` today, but `preventDefault` + setting `returnValue`
 * is still what triggers their built-in confirmation prompt.
 */
export function useBeforeUnloadGuard(hasPendingChanges: boolean): void {
  useEffect(() => {
    if (!hasPendingChanges) return;

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasPendingChanges]);
}
