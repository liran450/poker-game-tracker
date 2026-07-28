import type { ReactNode } from 'react';

export type BannerVariant = 'success' | 'error' | 'info';

export interface BannerProps {
  variant: BannerVariant;
  icon?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

const variantClasses: Record<BannerVariant, string> = {
  success: 'bg-tint-positive border-positive/20 text-positive',
  error: 'bg-tint-negative border-negative/20 text-negative',
  info: 'bg-surface-amber-dim border-accent/20 text-accent',
};

const dotClasses: Record<BannerVariant, string> = {
  success: 'bg-positive shadow-[0_0_8px] shadow-positive',
  error: 'bg-negative shadow-[0_0_8px] shadow-negative',
  info: 'bg-accent shadow-[0_0_8px] shadow-accent',
};

export function Banner({ variant, icon, children, action, className }: BannerProps) {
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={[
        'flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-body font-semibold',
        variantClasses[variant],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {icon ?? (
        <span
          className={['inline-block size-2 shrink-0 rounded-full', dotClasses[variant]].join(' ')}
          aria-hidden="true"
        />
      )}
      <span className="flex-1">{children}</span>
      {action}
    </div>
  );
}
