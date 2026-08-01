import { useTranslation } from 'react-i18next';
import { formatPercent } from './format';

export interface PercentValueProps {
  fraction: number;
  showSign?: boolean;
  className?: string;
}

/** The percent twin of `<Money>` — same LTR isolation, same reason (CLAUDE.md#rendering-amounts). */
export function PercentValue({ fraction, showSign = false, className }: PercentValueProps) {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'he';
  const formatted = formatPercent(fraction, locale, showSign);

  const colorClass = showSign ? (fraction > 0 ? 'text-positive' : fraction < 0 ? 'text-negative' : '') : '';

  return (
    <span
      dir="ltr"
      className={['inline-block tabular-nums isolate', colorClass, className].filter(Boolean).join(' ')}
    >
      {formatted}
    </span>
  );
}
