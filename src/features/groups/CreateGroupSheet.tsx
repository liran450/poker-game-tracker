import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@components/BottomSheet';
import { Button } from '@components/shared/Button';
import { TextField } from '@components/shared/TextField';

export interface CreateGroupSheetProps {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}

export function CreateGroupSheet({ open, onClose, onCreate }: CreateGroupSheetProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  function handleClose(): void {
    setName('');
    onClose();
  }

  async function handleCreate(): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await onCreate(trimmed);
      setName('');
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={handleClose} title={t('groups.createTitle')}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-body-sm font-semibold text-fg-secondary">
          {t('groups.nameLabel')}
          <TextField
            autoFocus
            placeholder={t('groups.namePlaceholder')}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void handleCreate();
              }
            }}
          />
        </label>
        <Button variant="primary" fullWidth disabled={!name.trim() || busy} onClick={() => void handleCreate()}>
          {t('groups.create')}
        </Button>
      </div>
    </BottomSheet>
  );
}
