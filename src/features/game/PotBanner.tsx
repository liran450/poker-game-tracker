import { useTranslation } from 'react-i18next';
import { abs, formatMoneyPlainText } from '@core/money';
import type { PotStatus } from '@core/pot';

export interface PotBannerProps {
  status: PotStatus;
  currency: string;
  locale: string;
  onOpenResolution: () => void;
}

/**
 * The pot verification banner (05-settlement.md#the-safeguard-20): compact
 * and green when balanced, a tappable red alert when not. Sits directly under
 * the header so a discrepancy is visible without scrolling.
 */
export function PotBanner({ status, currency, locale, onOpenResolution }: PotBannerProps) {
  const { t } = useTranslation();
  const buyTotal = formatMoneyPlainText(status.totalBuyInsMinor, { locale, currency });
  const chipTotal = formatMoneyPlainText(status.totalChipsMinor, { locale, currency });

  if (status.isBalanced) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 rounded-lg bg-tint-positive px-3.5 py-2 text-body-sm font-semibold text-positive"
      >
        <span aria-hidden="true">{'🟢'}</span>
        <span>{t('money.balanced', { buyTotal, chipTotal })}</span>
      </div>
    );
  }

  const amount = formatMoneyPlainText(abs(status.discrepancyMinor), { locale, currency });

  return (
    <button
      type="button"
      onClick={onOpenResolution}
      role="alert"
      aria-live="polite"
      className="flex w-full items-center gap-2 rounded-lg bg-tint-negative px-3.5 py-2 text-start text-body-sm font-semibold text-negative"
    >
      <span aria-hidden="true">{'🔴'}</span>
      <span className="flex-1">{t('money.discrepancy', { amount, buyTotal, chipTotal })}</span>
    </button>
  );
}
