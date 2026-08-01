import { useTranslation } from 'react-i18next';
import { Money } from '@components/Money';
import type { GroupTableStatistics } from '@core/statistics';
import { formatDurationMinutes, weekdayKey } from './format';
import { StatRow } from './StatRow';

export interface GroupTableStatsProps {
  stats: GroupTableStatistics;
  currency: string;
}

/** The group tab's table-level figures (06-statistics.md#group-level-statistics-11, "Per table / group"). */
export function GroupTableStats({ stats, currency }: GroupTableStatsProps) {
  const { t } = useTranslation();

  if (stats.gamesCount === 0) return null;

  return (
    <div className="rounded-lg bg-surface-card px-4">
      <StatRow label={t('statistics.tableGamesCount')} value={stats.gamesCount} />
      <StatRow
        label={t('statistics.totalMoneyPlayed')}
        value={<Money value={stats.totalMoneyPlayedMinor} currency={currency} />}
      />
      <StatRow label={t('statistics.tableTotalHours')} value={t('statistics.hoursValue', { count: Math.round(stats.totalHours) })} />
      <StatRow
        label={t('statistics.tableAvgPot')}
        value={stats.avgPotMinor === null ? '—' : <Money value={stats.avgPotMinor} currency={currency} />}
      />
      <StatRow
        label={t('statistics.tableBiggestNight')}
        value={stats.biggestNight === null ? '—' : <Money value={stats.biggestNight.potMinor} currency={currency} />}
        caption={stats.biggestNight?.gameName}
      />
      <StatRow
        label={t('statistics.tableAvgPlayers')}
        value={stats.avgPlayersPerGame === null ? '—' : stats.avgPlayersPerGame.toFixed(1)}
      />
      <StatRow
        label={t('statistics.tableAvgBuyIns')}
        value={stats.avgBuyInsPerGame === null ? '—' : stats.avgBuyInsPerGame.toFixed(1)}
      />
      <StatRow
        label={t('statistics.tableAvgDuration')}
        value={stats.avgGameDurationMinutes === null ? '—' : formatDurationMinutes(Math.round(stats.avgGameDurationMinutes))}
      />
      <StatRow
        label={t('statistics.tableUnaccounted')}
        value={<Money value={stats.totalUnaccountedMinor} currency={currency} />}
      />
      <StatRow
        label={t('statistics.tableSharedCosts')}
        value={<Money value={stats.totalSharedCostsMinor} currency={currency} />}
      />
      <StatRow
        label={t('statistics.tableCommonWeekday')}
        value={stats.mostCommonWeekday === null ? '—' : t(weekdayKey(stats.mostCommonWeekday))}
      />
      <StatRow
        label={t('statistics.tableLongestSession')}
        value={stats.longestSessionMinutes === null ? '—' : formatDurationMinutes(stats.longestSessionMinutes)}
      />
    </div>
  );
}
