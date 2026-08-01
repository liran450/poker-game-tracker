import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { minor } from '@core/money';
import type { FunStatistics } from '@core/statistics';
import { FunStatsRow } from './FunStatsRow';

const fullStats: FunStatistics = {
  donator: { userId: 'u1', displayName: 'Dana', valueMinor: minor(-9000) },
  ironMan: { userId: 'u2', displayName: 'Roi', streak: 5 },
  hotColdStreaks: {
    hottest: { userId: 'u2', displayName: 'Roi', length: 3 },
    coldest: { userId: 'u3', displayName: 'Mor', length: 2 },
  },
  chipMagnet: { userId: 'u2', displayName: 'Roi', avgChips: 250 },
  theMachine: {
    singleGame: { userId: 'u2', displayName: 'Roi', gameId: 'g1', gameName: 'Big Night', buysCount: 8 },
    highestAverage: { userId: 'u2', displayName: 'Roi', avgBuyIns: 4.5 },
  },
  comeback: {
    count: 2,
    biggest: { userId: 'u1', displayName: 'Dana', gameId: 'g1', gameName: 'Big Night', netMinor: minor(5000), buysCount: 4 },
  },
  nemesisPatron: {
    nemesis: { userId: 'u2', displayName: 'Roi', timesPaid: 3, totalMinor: minor(1500) },
    patron: { userId: 'u3', displayName: 'Mor', timesPaidBy: 2, totalMinor: minor(600) },
  },
};

describe('<FunStatsRow>', () => {
  it('renders the winner names for every populated stat', () => {
    render(<FunStatsRow stats={fullStats} currency="ILS" />);
    expect(screen.getByText('statistics.donator')).toBeDefined();
    expect(screen.getAllByText('Dana').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Roi').length).toBeGreaterThan(0);
    expect(screen.getByText('Mor')).toBeDefined();
    expect(screen.getByText('statistics.theMachineSingle')).toBeDefined();
  });

  it('omits the nemesis/patron cards entirely without a signed-in viewer', () => {
    render(<FunStatsRow stats={{ ...fullStats, nemesisPatron: null }} currency="ILS" />);
    expect(screen.queryByText('statistics.nemesis')).toBeNull();
    expect(screen.queryByText('statistics.patron')).toBeNull();
  });

  it('falls back to the empty label when a stat has no winner', () => {
    const empty: FunStatistics = {
      donator: null,
      ironMan: null,
      hotColdStreaks: { hottest: null, coldest: null },
      chipMagnet: null,
      theMachine: { singleGame: null, highestAverage: null },
      comeback: { count: 0, biggest: null },
      nemesisPatron: null,
    };
    render(<FunStatsRow stats={empty} currency="ILS" />);
    expect(screen.getAllByText('statistics.noWinner').length).toBeGreaterThan(0);
  });
});
