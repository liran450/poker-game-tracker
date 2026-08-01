import { useTranslation } from 'react-i18next';
import { Button } from '@components/shared/Button';
import { Card } from '@components/shared/Card';
import type { PendingGroupInvite } from '@data/groups';

export interface PendingGroupInviteCardProps {
  invite: PendingGroupInvite;
  busy: boolean;
  onDecide: (accept: boolean) => void;
}

/**
 * 04-ux-spec.md#adding-a-group-member--invite-and-accept's "דנה הזמינה אותך לחבורה" card — shown
 * on the home screen and on the groups list, so it's one component rather than copied prose.
 */
export function PendingGroupInviteCard({ invite, busy, onDecide }: PendingGroupInviteCardProps) {
  const { t } = useTranslation();
  return (
    <Card elevated className="flex flex-col gap-3 p-4 text-start">
      <div>
        <p className="text-body font-semibold text-fg">
          {t('groups.pendingInviteTitle', { group: invite.groupName })}
        </p>
        <p className="text-body-sm text-fg-tertiary">{t('groups.pendingInviteConsequence')}</p>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" fullWidth disabled={busy} onClick={() => onDecide(false)}>
          {t('groups.invite.cancel')}
        </Button>
        <Button variant="primary" fullWidth disabled={busy} onClick={() => onDecide(true)}>
          {t('ui.approve')}
        </Button>
      </div>
    </Card>
  );
}
