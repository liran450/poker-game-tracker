import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import styles from './Snackbar.module.scss';

export interface SnackbarProps {
  open: boolean;
  onClose: () => void;
  onUndo?: () => void;
  children: ReactNode;
  duration?: number;
  className?: string;
}

export function Snackbar({
  open,
  onClose,
  onUndo,
  children,
  duration = 4000,
  className,
}: SnackbarProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [open, onClose, duration]);

  if (!open) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'fixed inset-inline-3 bottom-20 z-30 mx-auto max-w-md',
        'flex items-center gap-3 rounded-lg border border-accent/30',
        'bg-surface-amber-dim px-4 py-3 shadow-lg animate-rise',
        'text-body-sm font-semibold text-fg',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="flex-1">{children}</span>
      {onUndo && (
        <button
          type="button"
          onClick={() => {
            onUndo();
            onClose();
          }}
          className="shrink-0 font-bold text-accent"
        >
          {t('ui.undo')}
        </button>
      )}
      <CountdownRing duration={duration} />
    </div>
  );
}

function CountdownRing({ duration }: { duration: number }) {
  const r = 18;
  const circumference = 2 * Math.PI * r;
  const circleRef = useRef<SVGCircleElement>(null);

  useEffect(() => {
    circleRef.current?.style.setProperty('animation-duration', `${duration}ms`);
  }, [duration]);

  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 40 40"
      className="shrink-0 -rotate-90"
      aria-hidden="true"
    >
      <circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        className="text-fg-disabled"
      />
      <circle
        ref={circleRef}
        cx="20"
        cy="20"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray={circumference}
        strokeDashoffset="0"
        strokeLinecap="round"
        className={['text-accent', styles['ring']].join(' ')}
      />
    </svg>
  );
}
