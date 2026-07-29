import { useTranslation } from 'react-i18next';
import { Button } from '@components/shared/Button';
import { add, formatMoneyPlainText, type Minor } from '@core/money';
import type { BuyInBatchEntry } from './buyInBatch';
import { formatBuyInChange, isolated } from './buyInText';

export interface BuyInBatchBarProps {
  entries: readonly BuyInBatchEntry[];
  /** Player name and live buysCount, keyed by playerId — the batch bar never shows a resulting count, but still needs a name. */
  playerNames: ReadonlyMap<string, string>;
  buyAmountMinor: Minor;
  chipsPerBuy: number;
  currency: string;
  locale: string;
  onUndoAll: () => void;
  onConfirm: () => void;
}

/**
 * The batch bar (04-ux-spec.md#the-buy-in-counter--the-most-important-interaction-in-the-app):
 * the coalescing snackbar upgrades to this once a second row is touched
 * inside the same window. One line per row, a total, and both
 * "undo everything" and "dismiss now" — the list scrolls past four rows and
 * never covers more than half the screen.
 */
export function BuyInBatchBar({
  entries,
  playerNames,
  buyAmountMinor,
  chipsPerBuy,
  currency,
  locale,
  onUndoAll,
  onConfirm,
}: BuyInBatchBarProps) {
  const { t } = useTranslation();

  const totalChips = entries.reduce((sum, e) => sum + e.deltaBuys * chipsPerBuy, 0);
  const totalMoney = entries.reduce(
    (sum, e) => add(sum, (e.deltaBuys * buyAmountMinor) as Minor),
    0 as Minor,
  );

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'fixed inset-inline-3 bottom-20 z-30 mx-auto max-w-md',
        'flex flex-col gap-2 rounded-lg border border-accent/30',
        'bg-surface-amber-dim px-4 py-3 shadow-lg animate-rise',
      ].join(' ')}
    >
      <div className="flex max-h-[50dvh] flex-col gap-1.5 overflow-y-auto">
        {entries.map((entry) => (
          <p key={entry.playerId} className="text-body-sm font-medium text-fg">
            {formatBuyInChange(t, {
              name: playerNames.get(entry.playerId) ?? '',
              deltaBuys: entry.deltaBuys,
              showResultingCount: false,
              resultingBuysCount: 0,
              buyAmountMinor,
              chipsPerBuy,
              currency,
              locale,
            })}
          </p>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line pt-2">
        <p className="text-body-sm font-bold text-fg">
          {t('buyIn.batchTotal', {
            chips: isolated(`${totalChips >= 0 ? '+' : ''}${totalChips}`),
            money: formatMoneyPlainText(totalMoney, { locale, currency, showSign: true }),
          })}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" size="sm" onClick={onUndoAll}>
            {t('ui.undoAll')}
          </Button>
          <Button variant="primary" size="sm" onClick={onConfirm}>
            {t('ui.confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}
