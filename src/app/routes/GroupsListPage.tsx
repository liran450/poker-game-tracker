import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { AppShell } from '@components/AppShell';
import { Banner } from '@components/Banner';
import { EmptyState } from '@components/EmptyState';
import { Button } from '@components/shared/Button';
import { Card } from '@components/shared/Card';
import { IconButton } from '@components/shared/IconButton';
import { CreateGroupSheet } from '@features/groups/CreateGroupSheet';
import { PendingGroupInviteCard } from '@features/groups/PendingGroupInviteCard';
import {
  createGroup,
  listMyGroups,
  listMyPendingInvites,
  respondToGroupInvite,
  type Group,
  type PendingGroupInvite,
} from '@data/groups';
import { useSession } from '../../hooks/useSession';

/**
 * The screen map's "Group / friends" node (04-ux-spec.md#screen-map). No mockup covers a groups
 * *list* — the mockups only show the invite sheet and a single group's member-facing card — so
 * this is built in the established visual language per CLAUDE.md's "extend it yourself" working
 * style, the same way `AccountPage` was for step 12.
 */
export function GroupsListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const session = useSession();
  const [groups, setGroups] = useState<Group[]>([]);
  const [invites, setInvites] = useState<PendingGroupInvite[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    if (!session.profile) return;
    const [myGroups, myInvites] = await Promise.all([
      listMyGroups(),
      listMyPendingInvites(session.profile.id),
    ]);
    setGroups(myGroups);
    setInvites(myInvites);
  }

  useEffect(() => {
    if (!session.cloudConfigured || !session.profile) return;
    void (async () => {
      await refresh();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.cloudConfigured, session.profile]);

  async function handleCreate(name: string): Promise<void> {
    if (!session.profile) return;
    await createGroup({ name, createdBy: session.profile.id });
    await refresh();
  }

  async function handleInviteDecision(invite: PendingGroupInvite, accept: boolean): Promise<void> {
    setBusyInviteId(invite.id);
    setError(null);
    try {
      await respondToGroupInvite(invite.id, accept);
      await refresh();
    } catch {
      setError(t('groups.genericError'));
    } finally {
      setBusyInviteId(null);
    }
  }

  return (
    <AppShell
      header={
        <div className="flex items-center gap-2 px-2 py-3">
          <IconButton label={t('game.backToHome')} onClick={() => void navigate('/')}>
            {'✕'}
          </IconButton>
          <h1 className="text-heading font-bold">{t('groups.title')}</h1>
        </div>
      }
      footer={
        session.cloudConfigured && session.profile && groups.length > 0 ? (
          <div className="px-4 py-3">
            <Button variant="primary" fullWidth onClick={() => setCreateOpen(true)}>
              {t('groups.newGroup')}
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3 p-4">
        {!session.cloudConfigured ? (
          <Banner variant="info">{t('auth.notConfigured')}</Banner>
        ) : !session.profile ? (
          <Banner variant="info">{t('auth.notConfigured')}</Banner>
        ) : (
          <>
            {error && <Banner variant="error">{error}</Banner>}

            {invites.map((invite) => (
              <PendingGroupInviteCard
                key={invite.id}
                invite={invite}
                busy={busyInviteId === invite.id}
                onDecide={(accept) => void handleInviteDecision(invite, accept)}
              />
            ))}

            {groups.length === 0 ? (
              <EmptyState
                title={t('groups.empty')}
                description={t('groups.emptyDescription')}
                action={
                  <Button variant="primary" size="lg" onClick={() => setCreateOpen(true)}>
                    {t('groups.newGroup')}
                  </Button>
                }
              />
            ) : (
              groups.map((group) => (
                <Card
                  key={group.id}
                  elevated
                  className="p-4 text-start"
                  role="button"
                  tabIndex={0}
                  onClick={() => void navigate(`/groups/${group.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') void navigate(`/groups/${group.id}`);
                  }}
                >
                  <span className="text-title font-semibold">{group.name}</span>
                </Card>
              ))
            )}
          </>
        )}
      </div>

      <CreateGroupSheet open={createOpen} onClose={() => setCreateOpen(false)} onCreate={handleCreate} />
    </AppShell>
  );
}
