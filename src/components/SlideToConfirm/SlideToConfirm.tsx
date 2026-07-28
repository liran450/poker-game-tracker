import { useRef, useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import styles from './SlideToConfirm.module.scss';

export interface SlideToConfirmProps {
  label: string;
  onConfirm: () => void;
  className?: string;
}

export function SlideToConfirm({ label, onConfirm, className }: SlideToConfirmProps) {
  const { t } = useTranslation();
  const trackRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const dragging = useRef(false);

  useEffect(() => {
    trackRef.current?.style.setProperty('--slide-progress', String(progress));
  }, [progress]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || !trackRef.current || confirmed) return;
    const rect = trackRef.current.getBoundingClientRect();
    const isRtl = getComputedStyle(trackRef.current).direction === 'rtl';
    const offsetX = isRtl
      ? rect.right - e.clientX
      : e.clientX - rect.left;
    const maxTravel = rect.width - 52;
    const pct = Math.max(0, Math.min(1, (offsetX - 26) / maxTravel));
    setProgress(pct);
  }, [confirmed]);

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
    if (progress > 0.85 && !confirmed) {
      setConfirmed(true);
      setProgress(1);
      onConfirm();
    } else {
      setProgress(0);
    }
  }, [progress, confirmed, onConfirm]);

  return (
    <div
      ref={trackRef}
      className={[
        styles['track'],
        confirmed && styles['confirmed'],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={label}
    >
      <div className={styles['fill']} />
      <div
        className={styles['thumb']}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        role="slider"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        tabIndex={0}
      >
        {'‹‹'}
      </div>
      <span className={styles['label']}>
        {confirmed ? t('ui.confirmed') : label}
      </span>
    </div>
  );
}
