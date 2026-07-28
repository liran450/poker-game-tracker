import type { ButtonHTMLAttributes } from 'react';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: 'sm' | 'md';
}

const sizeClasses = {
  sm: 'size-10',
  md: 'size-12',
} as const;

export function IconButton({
  label,
  size = 'md',
  className,
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={[
        'inline-grid place-items-center rounded-lg text-fg-secondary transition-colors',
        'hover:bg-surface-raised/50 active:scale-[0.95]',
        sizeClasses[size],
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
