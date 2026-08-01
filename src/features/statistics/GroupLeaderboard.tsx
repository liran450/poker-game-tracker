import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Money } from '@components/Money';
import { SelectionChip } from '@components/SelectionChip';
import type { GroupPlayerStatistics } from '@core/statistics';
import { PercentValue } from './PercentValue';

export type LeaderboardMetric = 'net' | 'games' | 'winRate' | 'roi' | 'attendance';

const METRICS: readonly LeaderboardMetric[] = ['net', 'games', 'winRate', 'roi', 'attendance'];

function metricRank(player: GroupPlayerStatistics, metric: LeaderboardMetric): number {
  switch (metric) {
    case 'net':
      return player.totalNetMinor;
    case 'games':
      return player.gamesPlayed;
    case 'winRate':
      return player.winLoss.rate.value ?? -Infinity;
    case 'roi':
      return player.roiPercent ?? -Infinity;
    case 'attendance':
      return player.attendanceRate.value ?? -Infinity;
  }
}

interface LeaderboardRowValueProps {
  rank: number;
  name: string;
  valueNode: ReactNode;
  caption?: string;
}

function LeaderboardValueRow({ rank, name, valueNode, caption }: LeaderboardRowValueProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-surface-card px-4 py-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-raised text-body-sm font-bold text-fg-muted">
        {rank}
      </span>
      <span className="flex-1 truncate text-body font-semibold">{name}</span>
      <div className="flex flex-col items-end gap-0.5">
        <span className="font-bold">{valueNode}</span>
        {caption && <span className="text-caption text-fg-tertiary">{caption}</span>}
      </div>
    </div>
  );
}

export interface GroupLeaderboardProps {
  players: readonly GroupPlayerStatistics[];
  currency: string;
}

/** The group tab's per-player leaderboard, sortable by chips rather than tiny column headers (04-ux-spec.md#statistics). */
export function GroupLeaderboard({ players, currency }: GroupLeaderboardProps) {
  const { t } = useTranslation();
  const [metric, setMetric] = useState<LeaderboardMetric>('net');

  // 06-statistics.md#scoping: stats_visibility = private keeps a player off the leaderboard while
  // still counting them in table-level aggregates (built from the raw results, not this list).
  const visible = players.filter((p) => p.statsVisible);
  const sorted = [...visible].sort((a, b) => metricRank(b, metric) - metricRank(a, metric));

  const metricLabels: Record<LeaderboardMetric, string> = {
    net: t('statistics.sortNet'),
    games: t('statistics.sortGames'),
    winRate: t('statistics.sortWinRate'),
    roi: t('statistics.sortRoi'),
    attendance: t('statistics.sortAttendance'),
  };

  function valueFor(player: GroupPlayerStatistics): ReactNode {
    switch (metric) {
      case 'net':
        return <Money value={player.totalNetMinor} currency={currency} showSign />;
      case 'games':
        return <span className="tabular-nums">{player.gamesPlayed}</span>;
      case 'winRate':
        return player.winLoss.rate.value === null ? (
          '—'
        ) : (
          <PercentValue fraction={player.winLoss.rate.value} />
        );
      case 'roi':
        return player.roiPercent === null ? '—' : <PercentValue fraction={player.roiPercent / 100} showSign />;
      case 'attendance':
        return player.attendanceRate.value === null ? (
          '—'
        ) : (
          <PercentValue fraction={player.attendanceRate.value} />
        );
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="listbox" aria-label={t('statistics.sortBy')}>
        {METRICS.map((m) => (
          <SelectionChip
            key={m}
            label={metricLabels[m]}
            selected={metric === m}
            onClick={() => setMetric(m)}
          />
        ))}
      </div>

      {sorted.length === 0 ? (
        <p className="p-4 text-center text-body-sm text-fg-tertiary">{t('statistics.leaderboardEmpty')}</p>
      ) : (
        <div className="flex flex-col gap-2 overflow-x-auto">
          {sorted.map((player, i) => (
            <LeaderboardValueRow
              key={player.userId}
              rank={i + 1}
              name={player.displayName}
              valueNode={valueFor(player)}
              caption={t('statistics.sampleSize', { count: player.gamesPlayed })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
