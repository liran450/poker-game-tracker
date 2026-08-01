import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@components/shared/Card';
import { Money } from '@components/Money';
import type { FunStatistics } from '@core/statistics';

interface FunStatCardProps {
  title: string;
  emptyLabel: string;
  children?: ReactNode;
}

function FunStatCard({ title, emptyLabel, children }: FunStatCardProps) {
  return (
    <Card elevated className="flex min-w-[220px] shrink-0 flex-col gap-2 p-4">
      <span className="text-body-sm font-semibold text-fg-secondary">{title}</span>
      {children ?? <span className="text-body-sm text-fg-tertiary">{emptyLabel}</span>}
    </Card>
  );
}

export interface FunStatsRowProps {
  stats: FunStatistics;
  currency: string;
}

/** "The seven you picked, and only these" (06-statistics.md#fun-statistics) — screenshot-friendly cards. */
export function FunStatsRow({ stats, currency }: FunStatsRowProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-title font-semibold">{t('statistics.funStatsTitle')}</h2>
      <div className="flex gap-3 overflow-x-auto pb-1">
        <FunStatCard title={t('statistics.donator')} emptyLabel={t('statistics.noWinner')}>
          {stats.donator && (
            <>
              <span className="text-body font-bold">{stats.donator.displayName}</span>
              <Money value={stats.donator.valueMinor} currency={currency} showSign />
            </>
          )}
        </FunStatCard>

        <FunStatCard title={t('statistics.ironMan')} emptyLabel={t('statistics.noWinner')}>
          {stats.ironMan && stats.ironMan.streak > 0 && (
            <>
              <span className="text-body font-bold">{stats.ironMan.displayName}</span>
              <span className="text-body-sm text-fg-tertiary">
                {t('statistics.ironManDescription', { count: stats.ironMan.streak })}
              </span>
            </>
          )}
        </FunStatCard>

        <FunStatCard title={t('statistics.hotStreak')} emptyLabel={t('statistics.noWinner')}>
          {stats.hotColdStreaks.hottest && (
            <>
              <span className="text-body font-bold">{'🔥 '}{stats.hotColdStreaks.hottest.displayName}</span>
              <span className="text-body-sm text-fg-tertiary">
                {t('statistics.streakCurrentWin', { count: stats.hotColdStreaks.hottest.length })}
              </span>
            </>
          )}
        </FunStatCard>

        <FunStatCard title={t('statistics.coldStreak')} emptyLabel={t('statistics.noWinner')}>
          {stats.hotColdStreaks.coldest && (
            <>
              <span className="text-body font-bold">{'🧊 '}{stats.hotColdStreaks.coldest.displayName}</span>
              <span className="text-body-sm text-fg-tertiary">
                {t('statistics.streakCurrentLose', { count: stats.hotColdStreaks.coldest.length })}
              </span>
            </>
          )}
        </FunStatCard>

        <FunStatCard title={t('statistics.chipMagnet')} emptyLabel={t('statistics.noWinner')}>
          {stats.chipMagnet && (
            <>
              <span className="text-body font-bold">{stats.chipMagnet.displayName}</span>
              <span className="text-body-sm text-fg-tertiary">
                {t('statistics.chipMagnetDescription', { count: Math.round(stats.chipMagnet.avgChips) })}
              </span>
            </>
          )}
        </FunStatCard>

        <FunStatCard title={t('statistics.theMachine')} emptyLabel={t('statistics.noWinner')}>
          {stats.theMachine.singleGame && (
            <>
              <span className="text-body font-bold">{stats.theMachine.singleGame.displayName}</span>
              <span className="text-body-sm text-fg-tertiary">
                {t('statistics.theMachineSingle', {
                  count: stats.theMachine.singleGame.buysCount,
                  game: stats.theMachine.singleGame.gameName,
                })}
              </span>
            </>
          )}
          {stats.theMachine.highestAverage && (
            <span className="text-caption text-fg-tertiary">
              {t('statistics.theMachineAverage', {
                name: stats.theMachine.highestAverage.displayName,
                count: stats.theMachine.highestAverage.avgBuyIns.toFixed(1),
              })}
            </span>
          )}
        </FunStatCard>

        <FunStatCard title={t('statistics.comeback')} emptyLabel={t('statistics.noWinner')}>
          {stats.comeback.count > 0 && (
            <>
              <span className="text-body font-bold">
                {t('statistics.comebackCount', { count: stats.comeback.count })}
              </span>
              {stats.comeback.biggest && (
                <span className="text-body-sm text-fg-tertiary">
                  {t('statistics.comebackBiggest', {
                    name: stats.comeback.biggest.displayName,
                    game: stats.comeback.biggest.gameName,
                  })}
                </span>
              )}
            </>
          )}
        </FunStatCard>

        {stats.nemesisPatron && (
          <>
            <FunStatCard title={t('statistics.nemesis')} emptyLabel={t('statistics.noWinner')}>
              {stats.nemesisPatron.nemesis && (
                <>
                  <span className="text-body font-bold">{stats.nemesisPatron.nemesis.displayName}</span>
                  <span className="text-body-sm text-fg-tertiary">
                    {t('statistics.nemesisDescription', { count: stats.nemesisPatron.nemesis.timesPaid })}
                  </span>
                </>
              )}
            </FunStatCard>

            <FunStatCard title={t('statistics.patron')} emptyLabel={t('statistics.noWinner')}>
              {stats.nemesisPatron.patron && (
                <>
                  <span className="text-body font-bold">{stats.nemesisPatron.patron.displayName}</span>
                  <span className="text-body-sm text-fg-tertiary">
                    {t('statistics.patronDescription', { count: stats.nemesisPatron.patron.timesPaidBy })}
                  </span>
                </>
              )}
            </FunStatCard>
          </>
        )}
      </div>
    </div>
  );
}
