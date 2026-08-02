import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@components/BottomSheet';
import { Button } from '@components/shared/Button';
import { TextField } from '@components/shared/TextField';
import {
  findUserByUsername,
  inviteToGroup,
  listPendingInvitesForGroup,
  revokeGroupInvite,
  type GroupInvite,
  type UsernameSearchResult,
} from '@data/groups';
import { getProfilesPublic } from '@data/profiles';

export interface InviteMemberSheetProps {
  open: boolean;
  onClose: () => void;
  groupId: string;
  invitedBy: string;
  /** Already-members' user ids, so a search result already in the group reads correctly. */
  memberUserIds: readonly string[];
}

/**
 * 04-ux-spec.md#adding-a-group-member--invite-and-accept: exact-username search, a result card,
 * pending invites listed below with a revoke. Membership only ever appears once the invitee
 * accepts on their own side (see the home screen's pending-invite card) — this sheet only ever
 * sends the invite.
 *
 * A search matching the signed-in user themselves is treated as a miss, same as an unknown
 * username — there's no legitimate reason to invite yourself, and surfacing "already a member"
 * for your own username read as a confusing dead end rather than an explanation.
 */
export function InviteMemberSheet({ open, onClose, groupId, invitedBy, memberUserIds }: InviteMemberSheetProps) {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [searched, setSearched] = useState(false);
  const [result, setResult] = useState<UsernameSearchResult | null>(null);
  const [pendingInvites, setPendingInvites] = useState<GroupInvite[]>([]);
  const [inviteeNames, setInviteeNames] = useState<ReadonlyMap<string, UsernameSearchResult>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshPending(): Promise<void> {
    const invites = await listPendingInvitesForGroup(groupId);
    setPendingInvites(invites);
    const profiles = await getProfilesPublic(invites.map((i) => i.invitedUserId));
    setInviteeNames(
      new Map(profiles.map((p) => [p.id, { id: p.id, username: p.username, displayName: p.displayName, avatarUrl: null }])),
    );
  }

  useEffect(() => {
    if (!open) return;
    void (async () => {
      setUsername('');
      setSearched(false);
      setResult(null);
      setError(null);
      await refreshPending();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, groupId]);

  async function handleSearch(): Promise<void> {
    const trimmed = username.trim();
    if (!trimmed) return;
    setError(null);
    setBusy(true);
    try {
      const found = await findUserByUsername(trimmed);
      setResult(found && found.id !== invitedBy ? found : null);
      setSearched(true);
    } catch {
      setError(t('groups.genericError'));
    } finally {
      setBusy(false);
    }
  }

  async function handleInvite(): Promise<void> {
    if (!result) return;
    setBusy(true);
    setError(null);
    try {
      await inviteToGroup(groupId, result.id, invitedBy);
      setResult(null);
      setSearched(false);
      setUsername('');
      await refreshPending();
    } catch {
      setError(t('groups.genericError'));
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(inviteId: string): Promise<void> {
    setBusy(true);
    try {
      await revokeGroupInvite(inviteId);
      await refreshPending();
    } finally {
      setBusy(false);
    }
  }

  const alreadyMember = result !== null && memberUserIds.includes(result.id);

  return (
    <BottomSheet open={open} onClose={onClose} title={t('groups.invite.title')}>
      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
          <TextField
            aria-label={t('groups.invite.usernamePlaceholder')}
            placeholder={t('groups.invite.usernamePlaceholder')}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void handleSearch();
              }
            }}
          />
          <Button variant="secondary" disabled={!username.trim() || busy} onClick={() => void handleSearch()}>
            {t('groups.invite.search')}
          </Button>
        </div>

        {error && <p className="text-body-sm text-negative">{error}</p>}

        {searched &&
          (result === null ? (
            <p className="text-body-sm text-fg-tertiary">{t('groups.invite.notFound')}</p>
          ) : (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-raised p-3">
              <div className="flex flex-col">
                <span className="text-body font-semibold text-fg">{result.displayName}</span>
                <span className="text-caption text-fg-tertiary">@{result.username}</span>
              </div>
              {alreadyMember ? (
                <span className="text-caption text-fg-tertiary">{t('groups.invite.alreadyMember')}</span>
              ) : (
                <Button variant="primary" disabled={busy} onClick={() => void handleInvite()}>
                  {t('groups.invite.sendInvite')}
                </Button>
              )}
            </div>
          ))}

        {pendingInvites.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-body-sm font-semibold text-fg-tertiary">{t('groups.invite.pendingTitle')}</h3>
            {pendingInvites.map((invite) => {
              const invitee = inviteeNames.get(invite.invitedUserId);
              return (
                <div key={invite.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-raised p-3">
                  <span className="text-body-sm text-fg">
                    {invitee
                      ? t('groups.invite.pendingLine', { name: invitee.displayName, username: invitee.username })
                      : ''}
                  </span>
                  <Button variant="ghost" disabled={busy} onClick={() => void handleRevoke(invite.id)}>
                    {t('groups.invite.cancel')}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
