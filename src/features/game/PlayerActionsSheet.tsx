import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@components/BottomSheet';
import { DestructiveConfirm } from '@components/DestructiveConfirm';
import { Button } from '@components/shared/Button';
import { TextField } from '@components/shared/TextField';

export interface PlayerActionsSheetProps {
  open: boolean;
  onClose: () => void;
  playerName: string;
  /** Removing a player with buy-ins needs confirmation; always false before step 7. */
  hasBuyIns: boolean;
  onRename: (name: string) => void;
  onRemove: () => void;
}

/**
 * The row action sheet (04-ux-spec.md#row-action-sheet), trimmed to what this
 * step can actually do — settle, cash paid, edit chips and player history
 * arrive with steps 7-9. Rename and remove are real today.
 *
 * Local state resets by remounting, not by effect: the caller is expected to
 * mount this conditionally (`{actionsPlayer && <PlayerActionsSheet .../>}`),
 * so each open is a fresh instance. `BottomSheet`'s modal backdrop is what
 * makes that safe — nothing else can be tapped while one is open.
 */
export function PlayerActionsSheet({
  open,
  onClose,
  playerName,
  hasBuyIns,
  onRename,
  onRemove,
}: PlayerActionsSheetProps) {
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [draftName, setDraftName] = useState(playerName);

  function saveRename(): void {
    const trimmed = draftName.trim();
    if (trimmed) onRename(trimmed);
    onClose();
  }

  function handleRemove(): void {
    if (hasBuyIns) {
      setConfirmingRemove(true);
      return;
    }
    onRemove();
    onClose();
  }

  return (
    <>
      <BottomSheet open={open && !confirmingRemove} onClose={onClose} title={playerName}>
        {renaming ? (
          <div className="flex flex-col gap-3">
            <TextField
              aria-label={t('players.renameLabel')}
              value={draftName}
              autoFocus
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') saveRename();
              }}
            />
            <Button variant="primary" fullWidth onClick={saveRename}>
              {t('ui.save')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <Button variant="secondary" fullWidth onClick={() => setRenaming(true)}>
              {t('players.rename')}
            </Button>
            <Button variant="destructive" fullWidth onClick={handleRemove}>
              {t('players.remove')}
            </Button>
          </div>
        )}
      </BottomSheet>

      <DestructiveConfirm
        open={confirmingRemove}
        onClose={() => setConfirmingRemove(false)}
        onConfirm={() => {
          onRemove();
          onClose();
        }}
        title={t('players.removeConfirmTitle')}
        description={t('players.removeConfirmDesc')}
        confirmLabel={t('players.removeConfirmLabel')}
      />
    </>
  );
}
