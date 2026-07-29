import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

export interface InstallPromptState {
  readonly canInstall: boolean;
  readonly promptInstall: () => void;
}

/**
 * Wraps the `beforeinstallprompt` event (Chromium/Android only — iOS Safari
 * has no equivalent API and needs manual "Add to Home Screen" instructions,
 * out of scope here). The browser fires this at most once per page load;
 * this hook just holds onto it until something wants to trigger it.
 */
export function useInstallPrompt(): InstallPromptState {
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    function handler(e: Event): void {
      e.preventDefault();
      setDeferredEvent(e as BeforeInstallPromptEvent);
    }
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  return {
    canInstall: deferredEvent !== null,
    promptInstall: () => {
      void deferredEvent?.prompt();
      setDeferredEvent(null);
    },
  };
}
