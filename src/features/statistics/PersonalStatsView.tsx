import { useTranslation } from 'react-i18next';
import { Money } from '@components/Money';
import { Sparkline } from '@components/Sparkline';
import { StatHero } from '@components/StatHero';
import { toMajor } from '@core/money';
import { cumulativeNetSeries, type PersonalStatistics } from '@core/statistics';
import { PercentValue } from './PercentValue';
import { RateDisplay } from './RateDisplay';
import { StatRow } from './StatRow';

export interface PersonalStatsViewProps {
  stats: PersonalStatistics;
}

export function PersonalStatsView({ stats }: PersonalStatsViewProps) {
  const { t } = useTranslation();
  const { currency } = stats;
  const sparklineData = cumulativeNetSeries(stats.netByGame.map((g) => g.netMinor)).map(toMajor);

  return (
    <div className="flex flex-col gap-4 p-4">
      {stats.currencyMixed && (
        <p className="text-caption text-fg-tertiary">{t('statistics.currencyMixedNote')}</p>
      )}

      <StatHero
        value={stats.totalNetMinor}
        currency={currency}
        label={t('statistics.totalNet')}
        sampleSize={t('statistics.sampleSize', { count: stats.gamesPlayed })}
      />

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col items-center gap-1 rounded-lg bg-surface-card py-3 text-center">
          <span className="text-title font-bold tabular-nums">{stats.gamesPlayed}</span>
          <span className="text-body-sm text-fg-secondary">{t('statistics.gamesPlayed')}</span>
        </div>
        <div className="flex flex-col items-center gap-1 rounded-lg bg-surface-card py-3 text-center">
          <RateDisplay rate={stats.winLoss.rate} className="text-title font-bold" />
          <span className="text-body-sm text-fg-secondary">{t('statistics.winRate')}</span>
        </div>
      </div>

      {sparklineData.length >= 2 && (
        <div className="flex flex-col gap-1 rounded-lg bg-surface-card p-4">
          <span className="text-body-sm text-fg-secondary">{t('statistics.cumulativeNet')}</span>
          <Sparkline data={sparklineData} width={320} height={64} className="w-full" />
        </div>
      )}

      <div className="rounded-lg bg-surface-card px-4">
        <StatRow
          label={t('statistics.winLossBreakdown')}
          value={t('statistics.winLossCounts', {
            wins: stats.winLoss.wins,
            losses: stats.winLoss.losses,
            breakeven: stats.winLoss.breakeven,
          })}
        />
        <StatRow
          label={t('statistics.totalMoneyPlayed')}
          value={<Money value={stats.totalMoneyPlayedMinor} currency={currency} />}
        />
        <StatRow
          label={t('statistics.avgBuyInPerGame')}
          value={
            stats.avgBuyInPerGameMinor === null ? (
              '—'
            ) : (
              <Money value={stats.avgBuyInPerGameMinor} currency={currency} />
            )
          }
        />
        <StatRow
          label={t('statistics.avgResult')}
          value={
            stats.avgResultMinor === null ? (
              '—'
            ) : (
              <Money value={stats.avgResultMinor} currency={currency} showSign />
            )
          }
        />
        <StatRow
          label={t('statistics.roi')}
          value={
            stats.roiPercent === null ? '—' : <PercentValue fraction={stats.roiPercent / 100} showSign />
          }
        />
        <StatRow
          label={t('statistics.bestNight')}
          value={
            stats.bestNight === null ? (
              '—'
            ) : (
              <Money value={stats.bestNight.netMinor} currency={currency} showSign />
            )
          }
          caption={stats.bestNight?.gameName}
        />
        <StatRow
          label={t('statistics.worstNight')}
          value={
            stats.worstNight === null ? (
              '—'
            ) : (
              <Money value={stats.worstNight.netMinor} currency={currency} showSign />
            )
          }
          caption={stats.worstNight?.gameName}
        />
        <StatRow
          label={t('statistics.profitPerHour')}
          value={
            stats.profitPerHourMinor === null ? (
              '—'
            ) : (
              <Money value={stats.profitPerHourMinor} currency={currency} showSign />
            )
          }
        />
        <StatRow
          label={t('statistics.streak')}
          value={
            stats.streaks.currentDirection === 'none'
              ? t('statistics.streakNone')
              : t(
                  stats.streaks.currentDirection === 'win'
                    ? 'statistics.streakCurrentWin'
                    : 'statistics.streakCurrentLose',
                  { count: stats.streaks.currentLength },
                )
          }
          caption={t('statistics.streakBest', {
            wins: stats.streaks.longestWinStreak,
            losses: stats.streaks.longestLoseStreak,
          })}
        />
        <StatRow
          label={t('statistics.avgBuyIns')}
          value={stats.avgBuyIns === null ? '—' : stats.avgBuyIns.toFixed(1)}
        />
        <StatRow
          label={t('statistics.sharedCosts')}
          value={<Money value={stats.sharedCostsMinor} currency={currency} showSign />}
        />
      </div>
    </div>
  );
}
