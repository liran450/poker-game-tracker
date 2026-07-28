import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}

export function BottomSheet({ open, onClose, title, children, className }: BottomSheetProps) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <div
        className="absolute inset-0 bg-black/60 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={[
          'relative z-10 w-full max-w-md animate-sheet-in',
          'rounded-t-xl bg-surface-card',
          'max-h-[85dvh] overflow-y-auto',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="flex justify-center py-2">
          <div className="h-1 w-10 rounded-pill bg-fg-disabled" />
        </div>
        {title && (
          <div className="flex items-center justify-between px-5 pb-3">
            <h2 className="text-title font-bold">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="grid size-10 place-items-center rounded-lg text-fg-secondary"
              aria-label={t('ui.close')}
            >
              {'✕'}
            </button>
          </div>
        )}
        <div className="px-5 pb-6">{children}</div>
      </div>
    </div>
  );
}
