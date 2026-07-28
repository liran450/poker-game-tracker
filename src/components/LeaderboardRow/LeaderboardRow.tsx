import { Money } from '@components/Money';
import type { Minor } from '@core/money';

export interface LeaderboardRowProps {
  rank: number;
  name: string;
  value: Minor;
  currency: string;
  sampleSize?: string;
  className?: string;
}

export function LeaderboardRow({
  rank,
  name,
  value,
  currency,
  sampleSize,
  className,
}: LeaderboardRowProps) {
  return (
    <div
      className={[
        'flex items-center gap-3 rounded-lg bg-surface-card px-4 py-3',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-raised text-body-sm font-bold text-fg-muted">
        {rank}
      </span>
      <span className="flex-1 truncate text-body font-semibold">{name}</span>
      <div className="flex flex-col items-end gap-0.5">
        <Money value={value} currency={currency} showSign size="md" className="font-bold" />
        {sampleSize && (
          <span className="text-caption text-fg-tertiary">{sampleSize}</span>
        )}
      </div>
    </div>
  );
}
