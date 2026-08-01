import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { AppShell } from '@components/AppShell';
import { Banner } from '@components/Banner';
import { BottomSheet } from '@components/BottomSheet';
import { DestructiveConfirm } from '@components/DestructiveConfirm';
import { Button } from '@components/shared/Button';
import { Card } from '@components/shared/Card';
import { IconButton } from '@components/shared/IconButton';
import { GroupMemberActionsSheet } from '@features/groups/GroupMemberActionsSheet';
import { InviteMemberSheet } from '@features/groups/InviteMemberSheet';
import {
  deleteGroup,
  demoteGroupAdmin,
  getGroup,
  getGroupLiveGames,
  listGroupMembers,
  promoteGroupMember,
  removeGroupMember,
  transferGroupOwnership,
  type Group,
  type GroupLiveGame,
  type GroupMember,
  type GroupRole,
} from '@data/groups';
import { requestToJoinInApp } from '@data/joinRequests';
import { getProfilesPublic } from '@data/profiles';
import { useSession } from '../../hooks/useSession';

interface MemberRow extends GroupMember {
  readonly displayName: string;
}

const roleLabelKey: Record<GroupRole, string> = {
  owner: 'groups.roleOwner',
  admin: 'groups.roleAdmin',
  member: 'groups.roleMember',
};

/**
 * The group's own screen — 04-ux-spec.md#adding-a-group-member--invite-and-accept covers the
 * invite sheet and the roles list's ⓘ, but not a full member-management screen; built in the
 * established visual language, same as `AccountPage`/`GroupsListPage`.
 */
export function GroupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { groupId } = useParams<{ groupId: string }>();
  const session = useSession();

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [liveGames, setLiveGames] = useState<GroupLiveGame[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [actionsFor, setActionsFor] = useState<MemberRow | null>(null);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState<MemberRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestedGameIds, setRequestedGameIds] = useState<string[]>([]);

  async function refresh(): Promise<void> {
    if (!groupId) return;
    const [foundGroup, rawMembers, games] = await Promise.all([
      getGroup(groupId),
      listGroupMembers(groupId),
      getGroupLiveGames(groupId).catch(() => []),
    ]);
    setGroup(foundGroup);
    setLiveGames(games);
    const profiles = await getProfilesPublic(rawMembers.map((m) => m.userId));
    const nameById = new Map(profiles.map((p) => [p.id, p.displayName]));
    setMembers(
      [...rawMembers]
        .sort((a, b) => (a.role === b.role ? 0 : a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : 0))
        .map((m) => ({ ...m, displayName: nameById.get(m.userId) ?? '' })),
    );
  }

  useEffect(() => {
    if (!session.cloudConfigured || !session.profile || !groupId) return;
    void (async () => {
      await refresh();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.cloudConfigured, session.profile, groupId]);

  if (!session.cloudConfigured || !session.profile || !groupId) {
    return (
      <AppShell
        header={
          <div className="flex items-center gap-2 px-2 py-3">
            <IconButton label={t('game.backToHome')} onClick={() => void navigate('/groups')}>
              {'✕'}
            </IconButton>
          </div>
        }
      >
        <div className="p-4">
          <Banner variant="info">{t('auth.notConfigured')}</Banner>
        </div>
      </AppShell>
    );
  }

  const myMember = members.find((m) => m.userId === session.profile!.id);
  const myRole: GroupRole = myMember?.role ?? 'member';
  const isOwner = myRole === 'owner';
  const canManage = myRole === 'owner' || myRole === 'admin';

  async function withErrorHandling(fn: () => Promise<void>): Promise<void> {
    setError(null);
    try {
      await fn();
      await refresh();
    } catch {
      setError(t('groups.genericError'));
    }
  }

  async function handleRequestToJoin(game: GroupLiveGame): Promise<void> {
    if (!session.profile) return;
    await requestToJoinInApp(game.gameId, session.profile.id, session.profile.displayName);
    setRequestedGameIds((prev) => [...prev, game.gameId]);
  }

  return (
    <AppShell
      header={
        <div className="flex items-center gap-2 px-2 py-3">
          <IconButton label={t('game.backToHome')} onClick={() => void navigate('/groups')}>
            {'✕'}
          </IconButton>
          <h1 className="flex-1 truncate text-center text-heading font-bold">{group?.name ?? ''}</h1>
          <IconButton label={t('groups.menu')} onClick={() => setMenuOpen(true)}>
            {'⋯'}
          </IconButton>
        </div>
      }
    >
      <div className="flex flex-col gap-4 p-4">
        {error && <Banner variant="error">{error}</Banner>}

        {canManage && (
          <Button variant="secondary" fullWidth onClick={() => setInviteOpen(true)}>
            {t('groups.invite.action')}
          </Button>
        )}

        <div className="flex flex-col gap-2">
          <h2 className="text-body-sm font-semibold text-fg-tertiary">{t('groups.membersTitle')}</h2>
          {members.map((member) => (
            <Card key={member.userId} className="flex items-center justify-between gap-2 p-3">
              <div className="flex flex-col">
                <span className="text-body font-semibold text-fg">{member.displayName}</span>
                <span className="text-caption text-fg-tertiary">{t(roleLabelKey[member.role])}</span>
              </div>
              {member.role !== 'owner' && canManage && (
                <IconButton label={t('groups.actionsFor', { name: member.displayName })} onClick={() => setActionsFor(member)}>
                  {'⋯'}
                </IconButton>
              )}
            </Card>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-body-sm font-semibold text-fg-tertiary">{t('groups.liveGamesTitle')}</h2>
          {liveGames.length === 0 ? (
            <p className="text-body-sm text-fg-disabled">{t('groups.liveGamesEmpty')}</p>
          ) : (
            liveGames.map((game) => (
              <Card key={game.gameId} className="flex items-center justify-between gap-2 p-3">
                <div className="flex flex-col">
                  <span className="text-body font-semibold text-fg">{game.name}</span>
                  <span className="text-caption text-fg-tertiary">
                    {t('groups.liveGamePlayerCount', { count: game.playerCount })}
                  </span>
                </div>
                <Button
                  variant="secondary"
                  disabled={requestedGameIds.includes(game.gameId)}
                  onClick={() => void handleRequestToJoin(game)}
                >
                  {requestedGameIds.includes(game.gameId) ? t('groups.requestSent') : t('groups.requestToJoin')}
                </Button>
              </Card>
            ))
          )}
        </div>
      </div>

      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} title={t('groups.menu')}>
        <div className="flex flex-col gap-2.5">
          {isOwner && (
            <Button
              variant="secondary"
              fullWidth
              onClick={() => {
                setMenuOpen(false);
                setInviteOpen(true);
              }}
            >
              {t('groups.invite.action')}
            </Button>
          )}
          {isOwner ? (
            <Button
              variant="secondary"
              fullWidth
              disabled
              title={t('groups.leaveOwnerBlocked')}
            >
              {t('groups.leaveOwnerBlocked')}
            </Button>
          ) : (
            <Button
              variant="secondary"
              fullWidth
              onClick={() => {
                setMenuOpen(false);
                setLeaveConfirmOpen(true);
              }}
            >
              {t('groups.leave')}
            </Button>
          )}
          {isOwner && (
            <Button
              variant="destructive"
              fullWidth
              onClick={() => {
                setMenuOpen(false);
                setDeleteConfirmOpen(true);
              }}
            >
              {t('groups.deleteGroup')}
            </Button>
          )}
        </div>
      </BottomSheet>

      <InviteMemberSheet
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        groupId={groupId}
        invitedBy={session.profile.id}
        memberUserIds={members.map((m) => m.userId)}
      />

      {actionsFor && (
        <GroupMemberActionsSheet
          open
          onClose={() => setActionsFor(null)}
          memberName={actionsFor.displayName}
          memberRole={actionsFor.role}
          myRole={myRole}
          onPromote={() => void withErrorHandling(() => promoteGroupMember(groupId, actionsFor.userId))}
          onDemote={() => void withErrorHandling(() => demoteGroupAdmin(groupId, actionsFor.userId))}
          onRemove={() => void withErrorHandling(() => removeGroupMember(groupId, actionsFor.userId))}
          onTransferOwnership={() => setTransferTarget(actionsFor)}
        />
      )}

      <DestructiveConfirm
        open={leaveConfirmOpen}
        onClose={() => setLeaveConfirmOpen(false)}
        onConfirm={() => {
          void withErrorHandling(async () => {
            await removeGroupMember(groupId, session.profile!.id);
            void navigate('/groups');
          });
        }}
        title={t('groups.leaveConfirmTitle')}
        description={t('groups.leaveConfirmDesc')}
        confirmLabel={t('groups.leaveConfirmLabel')}
      />

      <DestructiveConfirm
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={() => {
          void withErrorHandling(async () => {
            await deleteGroup(groupId);
            void navigate('/groups');
          });
        }}
        title={t('groups.deleteConfirmTitle')}
        description={t('groups.deleteConfirmDesc')}
        confirmLabel={t('groups.deleteConfirmLabel')}
      />

      {transferTarget && (
        <DestructiveConfirm
          open
          onClose={() => setTransferTarget(null)}
          onConfirm={() =>
            void withErrorHandling(() => transferGroupOwnership(groupId, transferTarget.userId))
          }
          title={t('groups.transferConfirmTitle', { name: transferTarget.displayName })}
          description={t('groups.transferConfirmDesc', { name: transferTarget.displayName })}
          confirmLabel={t('groups.transferConfirmLabel')}
        />
      )}
    </AppShell>
  );
}
