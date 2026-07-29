import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@components/BottomSheet';
import { Money } from '@components/Money';
import { SlideToConfirm } from '@components/SlideToConfirm';
import { abs, formatMoneyPlainText, isZero, type Minor } from '@core/money';

export interface EndGameConfirmSheetProps {
  open: boolean;
  onClose: () => void;
  playerCount: number;
  totalPotMinor: Minor;
  sharedCostsMinor: Minor;
  currency: string;
  locale: string;
  unsettledPlayerNames: readonly string[];
  hasPendingSync: boolean;
  discrepancyMinor: Minor;
  onConfirm: () => void;
}

/**
 * The pre-settlement confirmation (04-ux-spec.md#ending-the-game): a summary
 * of what's about to be locked, the missing-players check, and — if the pot
 * banner is red — an explicit separate acknowledgement before the slide is
 * even enabled. Slide, not a tap, per #22.
 */
export function EndGameConfirmSheet({
  open,
  onClose,
  playerCount,
  totalPotMinor,
  sharedCostsMinor,
  currency,
  locale,
  unsettledPlayerNames,
  hasPendingSync,
  discrepancyMinor,
  onConfirm,
}: EndGameConfirmSheetProps) {
  const { t } = useTranslation();
  const [acknowledged, setAcknowledged] = useState(false);

  const hasDiscrepancy = !isZero(discrepancyMinor);
  const blocked = unsettledPlayerNames.length > 0;
  const canSlide = !blocked && (!hasDiscrepancy || acknowledged);

  return (
    <BottomSheet open={open} onClose={onClose} title={t('endGame.title')}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5 rounded-lg bg-surface-raised px-3.5 py-3">
          <div className="flex items-center justify-between text-body-sm">
            <span className="text-fg-tertiary">{t('endGame.playerCount', { count: playerCount })}</span>
          </div>
          <div className="flex items-center justify-between text-body-sm">
            <span className="text-fg-tertiary">{t('endGame.pot')}</span>
            <Money value={totalPotMinor} currency={currency} size="sm" />
          </div>
          {sharedCostsMinor > 0 && (
            <div className="flex items-center justify-between text-body-sm">
              <span className="text-fg-tertiary">{t('endGame.sharedCosts')}</span>
              <Money value={sharedCostsMinor} currency={currency} size="sm" />
            </div>
          )}
        </div>

        {blocked && (
          <p role="alert" className="text-body-sm font-semibold text-negative">
            {t('endGame.playersStillOpen', { count: unsettledPlayerNames.length })}
            {': '}
            {unsettledPlayerNames.join(', ')}
          </p>
        )}

        {hasDiscrepancy && (
          <div className="flex flex-col gap-2 rounded-lg bg-tint-negative px-3.5 py-3">
            <p className="text-body-sm font-bold text-negative">
              {t('endGame.discrepancyPrompt', {
                amount: formatMoneyPlainText(abs(discrepancyMinor), { locale, currency }),
              })}
            </p>
            <label className="flex items-center gap-2 text-body-sm font-semibold text-negative">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="size-5 accent-negative"
              />
              {t('endGame.acknowledgeDiscrepancy')}
            </label>
          </div>
        )}

        {hasPendingSync && (
          <p className="text-body-sm text-fg-tertiary">{t('endGame.pendingSync')}</p>
        )}

        {canSlide && (
          <SlideToConfirm label={t('endGame.slideLabel')} onConfirm={onConfirm} />
        )}
      </div>
    </BottomSheet>
  );
}
