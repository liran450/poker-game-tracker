import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@components/BottomSheet';
import { Button } from '@components/shared/Button';
import type { GroupRole } from '@data/groups';

export interface GroupMemberActionsSheetProps {
  open: boolean;
  onClose: () => void;
  memberName: string;
  memberRole: GroupRole;
  /** The caller's own role in this group — governs which actions below are actually offered. */
  myRole: GroupRole;
  onPromote: () => void;
  onDemote: () => void;
  onRemove: () => void;
  onTransferOwnership: () => void;
}

/**
 * The per-member row action sheet (03-data-model.md#group-roles): owner promotes/demotes/removes
 * anyone but themselves; an admin may promote a member and remove a non-owner, but — "cannot
 * demote another admin" — never demotes. The owner's own row never opens this sheet at all
 * (`GroupPage` doesn't wire a `⋯` onto it), so there's no "target is the owner" case to guard here.
 */
export function GroupMemberActionsSheet({
  open,
  onClose,
  memberName,
  memberRole,
  myRole,
  onPromote,
  onDemote,
  onRemove,
  onTransferOwnership,
}: GroupMemberActionsSheetProps) {
  const { t } = useTranslation();
  const canManage = myRole === 'owner' || myRole === 'admin';
  const canPromote = canManage && memberRole === 'member';
  const canDemote = myRole === 'owner' && memberRole === 'admin';
  const canRemove = canManage;
  const canTransfer = myRole === 'owner';

  return (
    <BottomSheet open={open} onClose={onClose} title={t('groups.actionsFor', { name: memberName })}>
      <div className="flex flex-col gap-2.5">
        {canPromote && (
          <Button
            variant="secondary"
            fullWidth
            onClick={() => {
              onPromote();
              onClose();
            }}
          >
            {t('groups.promote')}
          </Button>
        )}
        {canDemote && (
          <Button
            variant="secondary"
            fullWidth
            onClick={() => {
              onDemote();
              onClose();
            }}
          >
            {t('groups.demote')}
          </Button>
        )}
        {canTransfer && (
          <Button
            variant="secondary"
            fullWidth
            onClick={() => {
              onTransferOwnership();
              onClose();
            }}
          >
            {t('groups.transferOwnership')}
          </Button>
        )}
        {canRemove && (
          <Button
            variant="destructive"
            fullWidth
            onClick={() => {
              onRemove();
              onClose();
            }}
          >
            {t('groups.removeMember')}
          </Button>
        )}
      </div>
    </BottomSheet>
  );
}
