import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { EmptyState } from '@components/EmptyState';
import { AppShell } from '@components/AppShell';
import { Button } from '@components/shared/Button';
import { Card } from '@components/shared/Card';
import { IconButton } from '@components/shared/IconButton';
import { useGamesList } from '@core/offline/useGamesList';
import { listMyPendingInvites, respondToGroupInvite, type PendingGroupInvite } from '@data/groups';
import { ResultsCard } from '@components/ResultsCard';
import { formatDateShort } from '@features/game/time';
import { PendingGroupInviteCard } from '@features/groups/PendingGroupInviteCard';
import { useSession } from '../../hooks/useSession';

/** Recent finished games worth pinning to the home screen — older ones are still reachable via
 * statistics or a direct link; this is a recency list, not a full archive
 * (docs/build/PROGRESS.md step 6/9's "Left undone", finally closed in step 16). */
const RECENT_FINISHED_GAMES_LIMIT = 10;

export function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const games = useGamesList();
  const activeGames = games.filter((game) => game.status === 'active' || game.status === 'settling');
  const recentFinishedGames = games
    .filter((game) => game.status === 'finished')
    .slice(0, RECENT_FINISHED_GAMES_LIMIT);
  const session = useSession();
  const [pendingInvites, setPendingInvites] = useState<PendingGroupInvite[]>([]);
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);

  async function refreshInvites(): Promise<void> {
    if (!session.profile) return;
    setPendingInvites(await listMyPendingInvites(session.profile.id));
  }

  useEffect(() => {
    if (!session.cloudConfigured || !session.profile) return;
    void (async () => {
      await refreshInvites();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.cloudConfigured, session.profile]);

  async function handleInviteDecision(invite: PendingGroupInvite, accept: boolean): Promise<void> {
    setBusyInviteId(invite.id);
    try {
      await respondToGroupInvite(invite.id, accept);
      await refreshInvites();
    } finally {
      setBusyInviteId(null);
    }
  }

  return (
    <AppShell
      header={
        <div className="flex items-center justify-between px-5 py-3">
          <h1 className="text-heading font-bold">{t('home.title')}</h1>
          {session.cloudConfigured && (
            <div className="flex items-center gap-1">
              <IconButton label={t('nav.statistics')} onClick={() => void navigate('/statistics')}>
                {'📊'}
              </IconButton>
              <IconButton label={t('nav.groups')} onClick={() => void navigate('/groups')}>
                {'👥'}
              </IconButton>
              <IconButton label={t('nav.account')} onClick={() => void navigate('/account')}>
                {'👤'}
              </IconButton>
            </div>
          )}
        </div>
      }
      footer={
        games.length > 0 ? (
          <div className="px-4 py-3">
            <Button variant="primary" fullWidth onClick={() => void navigate('/new')}>
              {t('home.newGame')}
            </Button>
          </div>
        ) : undefined
      }
    >
      {pendingInvites.length > 0 && (
        <div className="flex flex-col gap-3 p-4 pb-0">
          {pendingInvites.map((invite) => (
            <PendingGroupInviteCard
              key={invite.id}
              invite={invite}
              busy={busyInviteId === invite.id}
              onDecide={(accept) => void handleInviteDecision(invite, accept)}
            />
          ))}
        </div>
      )}
      {games.length === 0 ? (
        <EmptyState
          title={t('home.startFirstGame')}
          description={t('home.empty')}
          action={
            <Button variant="primary" size="lg" onClick={() => void navigate('/new')}>
              {t('home.newGame')}
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3 p-4">
          {activeGames.map((game) => (
            <Card
              key={game.id}
              elevated
              className="p-4 text-start"
              role="button"
              tabIndex={0}
              onClick={() => void navigate(`/game/${game.id}`)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') void navigate(`/game/${game.id}`);
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-title font-semibold">{game.name}</span>
                {game.isPrivate && (
                  <span className="shrink-0 rounded-pill bg-surface-raised px-2 py-0.5 text-caption text-fg-tertiary">
                    {t('game.privateBadge')}
                  </span>
                )}
              </div>
              <span className="text-body-sm text-fg-tertiary">
                {t('home.playerCount', { count: game.playerCount })}
              </span>
            </Card>
          ))}
        </div>
      )}

      {recentFinishedGames.length > 0 && (
        <div className="flex flex-col gap-3 p-4 pt-0">
          <h2 className="text-body-sm font-semibold text-fg-tertiary">{t('home.recentGamesTitle')}</h2>
          {recentFinishedGames.map((game) => (
            <div
              key={game.id}
              role="button"
              tabIndex={0}
              onClick={() => void navigate(`/game/${game.id}`)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') void navigate(`/game/${game.id}`);
              }}
            >
              <ResultsCard
                gameName={game.name}
                date={formatDateShort(new Date(game.updatedAt))}
                playerCount={t('home.playerCount', { count: game.playerCount })}
                className="cursor-pointer text-start"
              />
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
