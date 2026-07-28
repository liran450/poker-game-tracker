import { useTranslation } from 'react-i18next';

import { BottomSheet } from '@components/BottomSheet';
import { Button } from '@components/shared/Button';

export interface DestructiveConfirmProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel: string;
}

export function DestructiveConfirm({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
}: DestructiveConfirmProps) {
  const { t } = useTranslation();

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <p className="mb-5 text-body-sm leading-relaxed text-fg-secondary">
        {description}
      </p>
      <div className="flex flex-col gap-2.5">
        <Button
          variant="destructive"
          fullWidth
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </Button>
        <Button variant="ghost" fullWidth onClick={onClose}>
          {t('ui.cancel')}
        </Button>
      </div>
    </BottomSheet>
  );
}
