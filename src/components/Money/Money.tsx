import { useTranslation } from 'react-i18next';

import { formatMoney, type Minor } from '@core/money';

export type MoneySize = 'sm' | 'md' | 'lg' | 'xl';

export interface MoneyProps {
  value: Minor;
  currency: string;
  showSign?: boolean;
  size?: MoneySize;
  className?: string;
}

const sizeClasses: Record<MoneySize, string> = {
  sm: 'text-body-sm',
  md: 'text-body',
  lg: 'text-title',
  xl: 'text-heading',
};

export function Money({ value, currency, showSign = false, size = 'md', className }: MoneyProps) {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'he';

  const formatted = formatMoney(value, { locale, currency, showSign });

  const colorClass = showSign
    ? value > 0
      ? 'text-positive'
      : value < 0
        ? 'text-negative'
        : ''
    : '';

  return (
    <span
      dir="ltr"
      className={[
        'inline-block tabular-nums',
        'isolate',
        sizeClasses[size],
        colorClass,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {formatted}
    </span>
  );
}
