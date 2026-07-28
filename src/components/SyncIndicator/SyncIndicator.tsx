import { useTranslation } from 'react-i18next';

export type SyncState = 'synced' | 'syncing' | 'pending' | 'failed';

export interface SyncIndicatorProps {
  state: SyncState;
  pendingCount?: number;
  onRetry?: () => void;
  onTap?: () => void;
}

export function SyncIndicator({ state, pendingCount = 0, onRetry, onTap }: SyncIndicatorProps) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={state === 'failed' ? onRetry : onTap}
      className="inline-flex min-h-tap min-w-tap items-center justify-center"
      aria-label={t(`sync.${state}`, { count: pendingCount })}
    >
      {state === 'synced' && (
         
        <span className="text-body text-positive/50" aria-hidden="true">{'✓'}</span>
      )}
      {state === 'syncing' && (
        <span className="size-2.5 animate-pulse rounded-full bg-accent" />
      )}
      {state === 'pending' && (
        <span className="grid min-w-5 place-items-center rounded-pill bg-accent/20 px-1.5 py-0.5 text-caption font-bold text-accent">
          {pendingCount}
        </span>
      )}
      {state === 'failed' && (
         
        <span className="grid min-w-5 place-items-center rounded-pill bg-negative/20 px-1.5 py-0.5 text-caption font-bold text-negative" aria-hidden="true">{'!'}</span>
      )}
    </button>
  );
}
