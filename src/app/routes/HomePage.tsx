import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { EmptyState } from '@components/EmptyState';
import { AppShell } from '@components/AppShell';
import { Button } from '@components/shared/Button';
import { Card } from '@components/shared/Card';
import { useGamesList } from '@core/offline/useGamesList';

export function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const games = useGamesList();
  const activeGames = games.filter((game) => game.status === 'active' || game.status === 'settling');

  return (
    <AppShell
      header={
        <div className="flex items-center justify-between px-5 py-3">
          <h1 className="text-heading font-bold">{t('home.title')}</h1>
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
    </AppShell>
  );
}
