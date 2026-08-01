import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@components/BottomSheet';
import { Button } from '@components/shared/Button';

export interface DeleteGameConfirmSheetProps {
  open: boolean;
  onClose: () => void;
  /** Whether the game has a permanent snapshot to keep — picks the exact copy 03-data-model.md
   * requires (`הנתונים המפורטים יימחקו. הסטטיסטיקה תישמר.`) vs. the unfinished-game wording,
   * since an unfinished game has no snapshot at all and "deletes everything" is literal. */
  isFinished: boolean;
  onExport: () => void;
  onConfirmDelete: () => void;
}

/**
 * `⋯` → `מחק משחק` (03-data-model.md#retention-and-archiving, docs/build/PLAN.md step 16). The
 * export shortcut sits above the destructive action, not below it — "offer an export before the
 * first purge, and before a delete" is the doc's own ordering, and a host about to lose the
 * detailed log is exactly the moment they'd want it.
 */
export function DeleteGameConfirmSheet({
  open,
  onClose,
  isFinished,
  onExport,
  onConfirmDelete,
}: DeleteGameConfirmSheetProps) {
  const { t } = useTranslation();

  return (
    <BottomSheet open={open} onClose={onClose} title={t('deleteGame.title')}>
      <p className="mb-5 text-body-sm leading-relaxed text-fg-secondary">
        {isFinished ? t('deleteGame.descriptionFinished') : t('deleteGame.descriptionUnfinished')}
      </p>
      <div className="flex flex-col gap-2.5">
        <Button variant="secondary" fullWidth onClick={onExport}>
          {t('deleteGame.exportFirst')}
        </Button>
        <Button
          variant="destructive"
          fullWidth
          onClick={() => {
            onConfirmDelete();
            onClose();
          }}
        >
          {t('deleteGame.confirm')}
        </Button>
        <Button variant="ghost" fullWidth onClick={onClose}>
          {t('ui.cancel')}
        </Button>
      </div>
    </BottomSheet>
  );
}
