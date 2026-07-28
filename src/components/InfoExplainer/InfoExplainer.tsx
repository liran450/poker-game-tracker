import { useState, useRef, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export interface InfoExplainerProps {
  content: ReactNode;
  className?: string;
}

export function InfoExplainer({ content, className }: InfoExplainerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleOutside);
    return () => document.removeEventListener('pointerdown', handleOutside);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  return (
    <div ref={containerRef} className={['relative inline-block', className].filter(Boolean).join(' ')}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t('gallery.infoExplainer')}
        className="inline-grid size-[44px] place-items-center text-fg-tertiary"
      >
        <span className="grid size-5 place-items-center rounded-full border border-fg-disabled text-caption" aria-hidden="true">
          {'i'}
        </span>
      </button>
      {open && (
        <div
          role="tooltip"
          className="absolute inset-inline-start-0 top-full z-50 mt-1 w-64 animate-fade-in rounded-lg border border-line bg-surface-card p-3.5 text-body-sm text-fg-secondary shadow-lg"
        >
          {content}
        </div>
      )}
    </div>
  );
}
