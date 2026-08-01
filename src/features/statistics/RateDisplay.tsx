import { useTranslation } from 'react-i18next';
import type { Rate } from '@core/statistics';
import { PercentValue } from './PercentValue';

export interface RateDisplayProps {
  rate: Rate;
  className?: string;
}

/**
 * `62% (13 משחקים)`, or `נתונים חלקיים` under 5 games (06-statistics.md#presentation-rules) — a
 * 100% rate from one game is misinformation, so the number is hidden, not just annotated.
 */
export function RateDisplay({ rate, className }: RateDisplayProps) {
  const { t } = useTranslation();
  if (rate.suppressed || rate.value === null) {
    return <span className={['text-body-sm text-fg-tertiary', className].filter(Boolean).join(' ')}>{t('statistics.partialData')}</span>;
  }
  return (
    <span className={className}>
      <PercentValue fraction={rate.value} />{' '}
      <span className="text-caption text-fg-tertiary">
        {t('statistics.sampleSize', { count: rate.sampleSize })}
      </span>
    </span>
  );
}
