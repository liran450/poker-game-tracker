import { useTranslation } from 'react-i18next';
import { Money } from '@components/Money';
import { IconButton } from '@components/shared/IconButton';
import type { Minor } from '@core/money';

export interface PlayerRowProps {
  name: string;
  amountOwed: Minor;
  currency: string;
  /**
   * Row states from 04-ux-spec.md#player-row-anatomy. Only `isLateJoiner` is
   * reachable through real interaction in this step — settling a player and
   * syncing to a server both arrive later (steps 7 and 12) — but the visual
   * treatment is built now so those steps only wire behaviour, not looks.
   */
  isSettled?: boolean;
  isLateJoiner?: boolean;
  isPendingSync?: boolean;
  onOpenActions: () => void;
  className?: string;
}

export function PlayerRow({
  name,
  amountOwed,
  currency,
  isSettled = false,
  isLateJoiner = false,
  isPendingSync = false,
  onOpenActions,
  className,
}: PlayerRowProps) {
  const { t } = useTranslation();

  return (
    <div
      className={[
        'flex items-center gap-2 rounded-lg bg-surface-card px-4 py-3',
        isSettled ? 'opacity-40' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-body font-semibold">{name}</span>
        {isLateJoiner && (
          <span className="shrink-0 rounded-pill bg-surface-raised px-2 py-0.5 text-caption text-fg-tertiary">
            {t('players.lateJoiner')}
          </span>
        )}
        {isPendingSync && (
          <span
            className="size-1.5 shrink-0 rounded-full bg-accent"
            aria-label={t('sync.pending', { count: 1 })}
          />
        )}
      </div>
      <Money value={amountOwed} currency={currency} showSign size="md" />
      <IconButton label={t('players.rowActions', { name })} onClick={onOpenActions}>
        {'⋯'}
      </IconButton>
    </div>
  );
}
