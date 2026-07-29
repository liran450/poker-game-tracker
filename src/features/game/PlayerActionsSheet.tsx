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
  /** Removing a player with buy-ins needs confirmation. */
  hasBuyIns: boolean;
  isSettled: boolean;
  onRename: (name: string) => void;
  onRemove: () => void;
  /** Opens the settle sheet (row is active). */
  onSettle: () => void;
  /** Direct action, no sheet — reopening needs no further input. */
  onReopen: () => void;
  /** Opens the settle sheet pre-filled with the current count, in edit mode (row is settled). */
  onEditChips: () => void;
  /** Opens the cash-paid sheet — reachable here and directly from the row. */
  onOpenCashPaid: () => void;
}

/**
 * The row action sheet (04-ux-spec.md#row-action-sheet): non-destructive
 * actions first, the destructive group last and visually separated.
 * "Player history in this game" from the spec's table is deliberately not
 * built here — it belongs with statistics (step 15) and would otherwise be a
 * button that can't do anything yet.
 *
 * Local state resets by remounting, not by effect: the caller is expected to
 * mount this conditionally (`{actionsPlayer && <PlayerActionsSheet .../>}`),
 * so each open is a fresh instance.
 */
export function PlayerActionsSheet({
  open,
  onClose,
  playerName,
  hasBuyIns,
  isSettled,
  onRename,
  onRemove,
  onSettle,
  onReopen,
  onEditChips,
  onOpenCashPaid,
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

  function runThenClose(action: () => void): void {
    action();
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
            {isSettled ? (
              <>
                <Button variant="secondary" fullWidth onClick={() => runThenClose(onReopen)}>
                  {t('players.reopen')}
                </Button>
                <Button variant="secondary" fullWidth onClick={() => runThenClose(onEditChips)}>
                  {t('players.editChips')}
                </Button>
              </>
            ) : (
              <Button variant="secondary" fullWidth onClick={() => runThenClose(onSettle)}>
                {t('players.settle')}
              </Button>
            )}
            <Button variant="secondary" fullWidth onClick={() => runThenClose(onOpenCashPaid)}>
              {t('players.cashPaid')}
            </Button>
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
