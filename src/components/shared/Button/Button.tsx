import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-on-accent font-bold hover:bg-accent-hover active:scale-[0.97]',
  secondary:
    'bg-surface-raised text-fg border border-line-strong font-semibold hover:brightness-110 active:scale-[0.97]',
  ghost:
    'bg-transparent text-fg-secondary font-semibold hover:bg-surface-raised/50 active:scale-[0.97]',
  destructive:
    'bg-negative/15 text-negative font-semibold hover:bg-negative/25 active:scale-[0.97]',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-10 px-3 text-body-sm rounded-md',
  md: 'min-h-12 px-4 text-body rounded-lg',
  lg: 'min-h-[54px] px-5 text-title rounded-xl',
};

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={[
        'inline-flex items-center justify-center gap-2 transition-transform',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && 'w-full',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}
