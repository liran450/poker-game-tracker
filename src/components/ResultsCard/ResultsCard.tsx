import type { ReactNode } from 'react';

import { Card } from '@components/shared/Card';

export interface ResultsCardProps {
  gameName: string;
  date: string;
  playerCount: string;
  result?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function ResultsCard({
  gameName,
  date,
  playerCount,
  result,
  children,
  className,
}: ResultsCardProps) {
  return (
    <Card className={['overflow-hidden', className].filter(Boolean).join(' ')}>
      <div className="flex items-start justify-between p-4">
        <div className="flex flex-col gap-1">
          <span className="text-title font-semibold">{gameName}</span>
          <span className="text-body-sm text-fg-tertiary">{date}</span>
          <span className="text-caption text-fg-disabled">{playerCount}</span>
        </div>
        {result && <div className="text-heading font-bold">{result}</div>}
      </div>
      {children && (
        <div className="border-t border-line px-4 py-3">{children}</div>
      )}
    </Card>
  );
}
