import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { minor } from '@core/money';
import type { GroupPlayerStatistics } from '@core/statistics';
import { GroupLeaderboard } from './GroupLeaderboard';

function player(overrides: Partial<GroupPlayerStatistics>): GroupPlayerStatistics {
  return {
    userId: 'u1',
    displayName: 'Player',
    statsVisible: true,
    gamesPlayed: 10,
    winLoss: { wins: 5, losses: 5, breakeven: 0, rate: { value: 0.5, sampleSize: 10, suppressed: false } },
    totalNetMinor: minor(0),
    avgNetMinor: minor(0),
    roiPercent: 0,
    avgMoneyPlayedPerGameMinor: minor(10000),
    avgBuyInsPerGame: 1,
    attendanceRate: { value: 1, sampleSize: 10, suppressed: false },
    ...overrides,
  };
}

describe('<GroupLeaderboard>', () => {
  it('hides a player whose stats_visibility is private', () => {
    const players = [
      player({ userId: 'u1', displayName: 'Roi', totalNetMinor: minor(5000) }),
      player({ userId: 'u2', displayName: 'Hidden', statsVisible: false, totalNetMinor: minor(9000) }),
    ];
    render(<GroupLeaderboard players={players} currency="ILS" />);
    expect(screen.getByText('Roi')).toBeDefined();
    expect(screen.queryByText('Hidden')).toBeNull();
  });

  it('reorders when a different sort chip is selected', () => {
    const players = [
      player({ userId: 'u1', displayName: 'LowNet', totalNetMinor: minor(1000), gamesPlayed: 20 }),
      player({ userId: 'u2', displayName: 'HighNet', totalNetMinor: minor(9000), gamesPlayed: 5 }),
    ];
    render(<GroupLeaderboard players={players} currency="ILS" />);

    // Default sort is net: HighNet first.
    let names = screen.getAllByText(/HighNet|LowNet/).map((el) => el.textContent);
    expect(names[0]).toBe('HighNet');

    fireEvent.click(screen.getByText('statistics.sortGames'));
    names = screen.getAllByText(/HighNet|LowNet/).map((el) => el.textContent);
    expect(names[0]).toBe('LowNet'); // 20 games beats 5
  });

  it('shows the empty message when nobody is visible', () => {
    render(<GroupLeaderboard players={[player({ statsVisible: false })]} currency="ILS" />);
    expect(screen.getByText('statistics.leaderboardEmpty')).toBeDefined();
  });
});
