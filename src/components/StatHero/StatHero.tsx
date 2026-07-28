import { Money } from '@components/Money';
import type { Minor } from '@core/money';

export interface StatHeroProps {
  value: Minor;
  currency: string;
  label: string;
  sampleSize?: string;
  className?: string;
}

export function StatHero({ value, currency, label, sampleSize, className }: StatHeroProps) {
  return (
    <div
      className={[
        'flex flex-col items-center gap-1 py-4 text-center',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Money value={value} currency={currency} showSign size="xl" className="text-display font-extrabold" />
      <span className="text-body-sm font-semibold text-fg-secondary">{label}</span>
      {sampleSize && (
        <span className="text-caption text-fg-tertiary">{sampleSize}</span>
      )}
    </div>
  );
}
