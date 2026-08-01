import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { minor } from '@core/money';
import type { PersonalStatistics } from '@core/statistics';
import { PersonalStatsView } from './PersonalStatsView';

function baseStats(overrides: Partial<PersonalStatistics> = {}): PersonalStatistics {
  return {
    gamesPlayed: 6,
    currency: 'ILS',
    currencyMixed: false,
    totalNetMinor: minor(-40000),
    winLoss: { wins: 1, losses: 5, breakeven: 0, rate: { value: 1 / 6, sampleSize: 6, suppressed: false } },
    totalMoneyPlayedMinor: minor(60000),
    avgBuyInPerGameMinor: minor(10000),
    avgResultMinor: minor(-6667),
    roiPercent: -66.67,
    bestNight: { gameId: 'g1', gameName: 'Best Night', netMinor: minor(10000) },
    worstNight: { gameId: 'g2', gameName: 'Worst Night', netMinor: minor(-10000) },
    profitPerHourMinor: minor(-2000),
    streaks: { currentDirection: 'lose', currentLength: 2, longestWinStreak: 1, longestLoseStreak: 3 },
    avgBuyIns: 2,
    sharedCostsMinor: minor(-500),
    netByGame: [
      { gameId: 'g1', finishedAt: '2026-01-01T00:00:00Z', netMinor: minor(10000) },
      { gameId: 'g2', finishedAt: '2026-01-02T00:00:00Z', netMinor: minor(-10000) },
    ],
    ...overrides,
  };
}

describe('<PersonalStatsView>', () => {
  it('renders the hero net, games played and best/worst night captions', () => {
    render(<PersonalStatsView stats={baseStats()} />);
    expect(screen.getByText('6')).toBeDefined(); // games played tile
    expect(screen.getByText('Best Night')).toBeDefined();
    expect(screen.getByText('Worst Night')).toBeDefined();
  });

  it('shows the currency-mixed note only when flagged', () => {
    const { rerender } = render(<PersonalStatsView stats={baseStats({ currencyMixed: false })} />);
    expect(screen.queryByText('statistics.currencyMixedNote')).toBeNull();

    rerender(<PersonalStatsView stats={baseStats({ currencyMixed: true })} />);
    expect(screen.getByText('statistics.currencyMixedNote')).toBeDefined();
  });

  it('suppresses the win rate under 5 games', () => {
    const stats = baseStats({
      gamesPlayed: 3,
      winLoss: { wins: 1, losses: 2, breakeven: 0, rate: { value: 1 / 3, sampleSize: 3, suppressed: true } },
    });
    render(<PersonalStatsView stats={stats} />);
    expect(screen.getByText('statistics.partialData')).toBeDefined();
  });

  it('renders em-dashes rather than throwing when averages are null (zero games)', () => {
    const stats = baseStats({
      gamesPlayed: 0,
      avgBuyInPerGameMinor: null,
      avgResultMinor: null,
      roiPercent: null,
      profitPerHourMinor: null,
      avgBuyIns: null,
      bestNight: null,
      worstNight: null,
      netByGame: [],
    });
    expect(() => render(<PersonalStatsView stats={stats} />)).not.toThrow();
  });

  it('only renders the sparkline with at least two games', () => {
    const oneGame = baseStats({ netByGame: [{ gameId: 'g1', finishedAt: '2026-01-01T00:00:00Z', netMinor: minor(100) }] });
    const { container, rerender } = render(<PersonalStatsView stats={oneGame} />);
    expect(container.querySelector('svg')).toBeNull();

    rerender(<PersonalStatsView stats={baseStats()} />);
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
