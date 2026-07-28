import type { ReactNode } from 'react';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={[
        'flex flex-col items-center gap-3 px-8 py-16 text-center',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {icon && <div className="mb-1 text-display text-fg-disabled">{icon}</div>}
      <h3 className="text-title font-semibold text-fg-secondary">{title}</h3>
      {description && (
        <p className="text-body-sm leading-relaxed text-fg-tertiary">{description}</p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
