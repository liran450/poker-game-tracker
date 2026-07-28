import type { HTMLAttributes } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
}

export function Card({ elevated = false, className, children, ...rest }: CardProps) {
  return (
    <div
      className={[
        'rounded-lg border border-line',
        elevated ? 'bg-surface-raised' : 'bg-surface-card',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}
