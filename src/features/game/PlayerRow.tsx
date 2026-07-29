import { useTranslation } from 'react-i18next';
import { Money } from '@components/Money';
import { IconButton } from '@components/shared/IconButton';
import { chipsToMoney, net, owed, type Minor } from '@core/money';
import { BuyInCounter } from './BuyInCounter';

export interface PlayerRowProps {
  name: string;
  buysCount: number;
  cashPaidMinor: Minor;
  buyAmountMinor: Minor;
  chipsPerBuy: number;
  currency: string;
  isSettled?: boolean;
  chipsFinal?: number | null;
  /** Formatted join time, e.g. "23:40" — set only for a player who joined after game_started. */
  lateJoinedAt?: string | null;
  isPendingSync?: boolean;
  onIncrement: () => void;
  onDecrement: () => void;
  onOpenCashPaid: () => void;
  onOpenActions: () => void;
  className?: string;
}

/**
 * The player row (04-ux-spec.md#player-row-anatomy): name and owed amount on
 * the first line, cash-paid and the buy counter on the second. A settled row
 * dims to ~40% opacity, disables the counter, and swaps the owed amount for
 * the locked net result — still in place in the list, never sorted to the
 * bottom (people find each other by position).
 */
export function PlayerRow({
  name,
  buysCount,
  cashPaidMinor,
  buyAmountMinor,
  chipsPerBuy,
  currency,
  isSettled = false,
  chipsFinal = null,
  lateJoinedAt = null,
  isPendingSync = false,
  onIncrement,
  onDecrement,
  onOpenCashPaid,
  onOpenActions,
  className,
}: PlayerRowProps) {
  const { t } = useTranslation();
  const owedMinor = owed(buysCount, buyAmountMinor);
  const netMinor =
    isSettled && chipsFinal !== null
      ? net(chipsToMoney(chipsFinal, buyAmountMinor, chipsPerBuy), owedMinor)
      : null;

  return (
    <div
      className={[
        'flex flex-col gap-2 rounded-lg bg-surface-card px-4 py-3',
        isSettled ? 'opacity-40' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-body font-semibold">{name}</span>
          {lateJoinedAt && (
            <span className="shrink-0 rounded-pill bg-surface-raised px-2 py-0.5 text-caption text-fg-tertiary">
              {t('players.lateJoiner', { time: lateJoinedAt })}
            </span>
          )}
          {isPendingSync && (
            <span
              className="size-1.5 shrink-0 rounded-full bg-accent"
              aria-label={t('sync.pending', { count: 1 })}
            />
          )}
        </div>
        {isSettled && netMinor !== null ? (
          <span className="inline-flex items-center gap-1">
            <Money value={netMinor} currency={currency} showSign size="md" />
            <span aria-hidden="true">{'🔒'}</span>
          </span>
        ) : (
          <Money value={owedMinor} currency={currency} showSign size="md" />
        )}
        <IconButton label={t('players.rowActions', { name })} onClick={onOpenActions}>
          {'⋯'}
        </IconButton>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onOpenCashPaid}
          disabled={isSettled}
          className={[
            'flex min-h-tap items-center gap-1 rounded-lg px-2 text-body-sm font-medium',
            cashPaidMinor > 0 ? 'text-fg-secondary' : 'text-fg-disabled',
          ].join(' ')}
        >
          <span aria-hidden="true">{'💵'}</span>
          {cashPaidMinor > 0 ? (
            <Money value={cashPaidMinor} currency={currency} size="sm" />
          ) : (
            t('cashPaid.addShort')
          )}
        </button>
        <BuyInCounter
          count={buysCount}
          playerName={name}
          onIncrement={onIncrement}
          onDecrement={onDecrement}
          disabled={isSettled}
        />
      </div>
    </div>
  );
}
