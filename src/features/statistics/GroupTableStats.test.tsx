import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { minor } from '@core/money';
import type { GroupTableStatistics } from '@core/statistics';
import { GroupTableStats } from './GroupTableStats';

const stats: GroupTableStatistics = {
  gamesCount: 4,
  totalMoneyPlayedMinor: minor(200000),
  totalHours: 12,
  avgPotMinor: minor(15000),
  biggestNight: { gameId: 'g1', gameName: 'The Big One', potMinor: minor(30000) },
  avgPlayersPerGame: 5,
  avgBuyInsPerGame: 3,
  avgGameDurationMinutes: 180,
  totalUnaccountedMinor: minor(200),
  totalSharedCostsMinor: minor(1500),
  mostCommonWeekday: 4,
  longestSessionMinutes: 300,
};

describe('<GroupTableStats>', () => {
  it('renders every figure, including the biggest-night caption', () => {
    render(<GroupTableStats stats={stats} currency="ILS" />);
    expect(screen.getByText('4')).toBeDefined();
    expect(screen.getByText('The Big One')).toBeDefined();
    expect(screen.getByText('statistics.weekday4')).toBeDefined();
  });

  it('renders nothing for zero games', () => {
    const { container } = render(
      <GroupTableStats stats={{ ...stats, gamesCount: 0 }} currency="ILS" />,
    );
    expect(container.firstChild).toBeNull();
  });
});
