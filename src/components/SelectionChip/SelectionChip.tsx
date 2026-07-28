import type { ButtonHTMLAttributes } from 'react';

export interface SelectionChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  label: string;
  selected?: boolean;
  groupMember?: boolean;
}

 
export function SelectionChip({
  label,
  selected = false,
  groupMember = false,
  className,
  ...rest
}: SelectionChipProps) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={[
        'inline-flex min-h-tap items-center gap-1.5 rounded-lg px-3.5 text-body font-semibold transition-colors',
        selected
          ? 'border-2 border-accent bg-surface-amber-dim text-fg'
          : 'border border-line-strong bg-surface-card text-fg-secondary',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {selected && (
        <span className="text-accent" aria-hidden="true">{'✓'}</span>
      )}
      {groupMember && !selected && (
        <span className="text-accent text-caption" aria-hidden="true">{'◈'}</span>
      )}
      {label}
    </button>
  );
}
 
