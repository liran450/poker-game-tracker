import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMoneyPlainText, subtract, toMajor, type Minor } from '@core/money';
import styles from './SettlementBanner.module.scss';

export interface SettlementBannerProps {
  assignedMinor: Minor;
  totalToMoveMinor: Minor;
  isComplete: boolean;
  currency: string;
  locale: string;
}

/**
 * The sticky balance banner atop the settlement screen
 * (05-settlement.md#edit-mode-1617): `שויך ₪430 מתוך ₪480 · חסר ₪50` with a
 * progress bar, or `הכל שויך ✓` in green once every transfer reconciles.
 */
export function SettlementBanner({
  assignedMinor,
  totalToMoveMinor,
  isComplete,
  currency,
  locale,
}: SettlementBannerProps) {
  const { t } = useTranslation();
  const trackRef = useRef<HTMLDivElement>(null);
  const progress =
    totalToMoveMinor > 0 ? Math.min(1, Math.max(0, toMajor(assignedMinor) / toMajor(totalToMoveMinor))) : 1;

  useEffect(() => {
    trackRef.current?.style.setProperty('--settlement-progress', String(progress));
  }, [progress]);

  if (isComplete) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 rounded-lg bg-tint-positive px-3.5 py-2.5 text-body font-bold text-positive"
      >
        <span aria-hidden="true">{'✓'}</span>
        <span>{t('settlement.progress.complete')}</span>
      </div>
    );
  }

  const assigned = formatMoneyPlainText(assignedMinor, { locale, currency });
  const total = formatMoneyPlainText(totalToMoveMinor, { locale, currency });
  const missing = formatMoneyPlainText(subtract(totalToMoveMinor, assignedMinor), { locale, currency });

  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-1.5 rounded-lg bg-surface-raised px-3.5 py-2.5">
      <span className="text-body-sm font-semibold text-fg-secondary">
        {t('settlement.progress.incomplete', { assigned, total, missing })}
      </span>
      <div ref={trackRef} className={styles['progressTrack']}>
        <div className={styles['progressFill']} />
      </div>
    </div>
  );
}
