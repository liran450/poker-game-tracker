import type { InputHTMLAttributes } from 'react';

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  className?: string;
}

export function TextField({ className, ...rest }: TextFieldProps) {
  return (
    <input
      className={[
        'min-h-tap w-full rounded-lg border border-line-strong bg-surface-card px-3.5',
        'text-body text-fg placeholder:text-fg-disabled',
        'focus:border-accent focus:outline-none',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    />
  );
}
