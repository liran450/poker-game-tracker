import { useTranslation } from 'react-i18next';

export interface BuyInCounterProps {
  count: number;
  playerName: string;
  onIncrement: () => void;
  onDecrement: () => void;
  disabled?: boolean;
}

/**
 * `− n +` (04-ux-spec.md#the-buy-in-counter--the-most-important-interaction-in-the-app).
 * Both buttons are the same 48px tap target — the asymmetry the spec asks for
 * ("the − is deliberately smaller") collides with the 48px floor, so it's
 * expressed as visual weight (filled accent vs. a quieter outline) instead of
 * a smaller hit area. See docs/11's collision #1 / docs/build/NOTES.md.
 *
 * `key={count}` on the number forces a fresh mount on every change, replaying
 * the `animate-count-up` token (~200ms) — the cross-cutting rule that changed
 * numbers should draw the eye. `prefers-reduced-motion` disables it globally
 * in reset.css, not here.
 */
export function BuyInCounter({
  count,
  playerName,
  onIncrement,
  onDecrement,
  disabled = false,
}: BuyInCounterProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label={t('buyIn.decrement', { name: playerName })}
        disabled={disabled || count === 0}
        onClick={onDecrement}
        className={[
          'grid size-12 shrink-0 place-items-center rounded-full border border-line-strong',
          'text-title font-semibold text-fg-secondary transition-transform active:scale-90',
          'disabled:opacity-30',
        ].join(' ')}
      >
        {'−'}
      </button>
      <span
        key={count}
        className="min-w-8 text-center text-title font-bold tabular-nums animate-count-up"
      >
        {count}
      </span>
      <button
        type="button"
        aria-label={t('buyIn.increment', { name: playerName })}
        disabled={disabled}
        onClick={onIncrement}
        className={[
          'grid size-12 shrink-0 place-items-center rounded-full bg-accent',
          'text-title font-bold text-on-accent transition-transform active:scale-90',
          'disabled:opacity-30',
        ].join(' ')}
      >
        {'+'}
      </button>
    </div>
  );
}
