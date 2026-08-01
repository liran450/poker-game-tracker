import type { ReactNode } from 'react';

export interface StatRowProps {
  label: string;
  value: ReactNode;
  caption?: string | undefined;
}

/** One label/value line in a statistics detail list (06-statistics.md's "detail table"). */
export function StatRow({ label, value, caption }: StatRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-3 last:border-b-0">
      <span className="text-body-sm text-fg-secondary">{label}</span>
      <div className="flex flex-col items-end gap-0.5">
        <span className="text-body font-semibold">{value}</span>
        {caption && <span className="text-caption text-fg-tertiary">{caption}</span>}
      </div>
    </div>
  );
}
