import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export interface AnnouncementBannerProps {
  children: ReactNode;
  onDismiss?: () => void;
  className?: string;
}

export function AnnouncementBanner({ children, onDismiss, className }: AnnouncementBannerProps) {
  const { t } = useTranslation();

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'flex items-center gap-3 bg-surface-amber-dim px-4 py-3 text-body-sm font-semibold text-accent animate-fade-in',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="flex-1">{children}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-fg-tertiary"
          aria-label={t('ui.dismiss')}
        >
          {'✕'}
        </button>
      )}
    </div>
  );
}
