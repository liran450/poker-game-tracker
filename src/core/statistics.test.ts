import { describe, expect, it } from 'vitest';
import { minor, type Minor } from './money';
import {
  computeChipMagnet,
  computeComeback,
  computeDonator,
  computeFunStatistics,
  computeGroupHotColdStreaks,
  computeGroupPlayerStatistics,
  computeGroupTableStatistics,
  computeIronMan,
  computeNemesisPatron,
  computePersonalStatistics,
  computeStreaks,
  computeTheMachine,
  computeWinLossSummary,
  cumulativeNetSeries,
  summarizeCurrency,
  type GameSummaryRow,
  type PersonalResultEntry,
  type PlayerResultRow,
  type TransferSummaryRow,
} from './statistics';

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

let gameCounter = 0;

function game(overrides: Partial<GameSummaryRow> = {}): GameSummaryRow {
  gameCounter += 1;
  return {
    gameId: overrides.gameId ?? `game-${gameCounter}`,
    groupId: 'group-1',
    name: overrides.name ?? `Game ${gameCounter}`,
    playedOn: overrides.playedOn ?? '2026-01-01',
    currency: overrides.currency ?? 'ILS',
    buyAmountMinor: minor(10000),
    chipsPerBuy: 100,
    playerCount: 4,
    durationMinutes: 180,
    totalBuyInsMinor: minor(40000),
    totalCashPotMinor: minor(20000),
    unaccountedMinor: minor(0),
    sharedCostsMinor: minor(0),
    isPrivate: false,
    finishedAt: overrides.finishedAt ?? `${overrides.playedOn ?? '2026-01-01'}T22:00:00Z`,
    ...overrides,
  };
}

let resultCounter = 0;

function result(overrides: Partial<PlayerResultRow> = {}): PlayerResultRow {
  resultCounter += 1;
  return {
    id: overrides.id ?? `result-${resultCounter}`,
    gameId: overrides.gameId ?? 'game-1',
    groupId: 'group-1',
    isPrivate: false,
    userId: overrides.userId ?? null,
    guestName: overrides.userId ? null : (overrides.guestName ?? 'Guest'),
    displayName: overrides.displayName ?? 'Player',
    buysCount: overrides.buysCount ?? 1,
    owedMinor: overrides.owedMinor ?? minor(10000),
    cashPaidMinor: overrides.cashPaidMinor ?? minor(0),
    chipsFinal: overrides.chipsFinal ?? 100,
    cashOutMinor: overrides.cashOutMinor ?? minor(10000),
    netMinor: overrides.netMinor ?? minor(0),
    sharedCostsShareMinor: overrides.sharedCostsShareMinor ?? minor(0),
    minutesPlayed: overrides.minutesPlayed ?? 180,
    settledPosition: overrides.settledPosition ?? null,
    ...overrides,
  };
}

function entry(g: GameSummaryRow, r: Partial<PlayerResultRow> = {}): PersonalResultEntry {
  return { game: g, result: result({ gameId: g.gameId, ...r }) };
}

// ---------------------------------------------------------------------------
// Win/loss rate — the zero-exclusion rule
// ---------------------------------------------------------------------------

describe('computeWinLossSummary', () => {
  it('excludes breakeven games from the rate denominator', () => {
    const results = [
      result({ netMinor: minor(100) }),
      result({ netMinor: minor(100) }),
      result({ netMinor: minor(100) }),
      result({ netMinor: minor(-50) }),
      result({ netMinor: minor(-50) }),
      result({ netMinor: minor(0) }),
      result({ netMinor: minor(0) }),
    ];
    const summary = computeWinLossSummary(results);
    expect(summary.wins).toBe(3);
    expect(summary.losses).toBe(2);
    expect(summary.breakeven).toBe(2);
    // 3 / (3 + 2), NOT 3 / 7 — the two breakeven games don't count in the denominator.
    expect(summary.rate.value).toBeCloseTo(0.6, 10);
    expect(summary.rate.sampleSize).toBe(7);
  });

  it('is null when every game was a breakeven', () => {
    const results = [result({ netMinor: minor(0) }), result({ netMinor: minor(0) })];
    expect(computeWinLossSummary(results).rate.value).toBeNull();
  });

  it('suppresses the rate under 5 games, and only under 5', () => {
    const four = Array.from({ length: 4 }, () => result({ netMinor: minor(100) }));
    const five = Array.from({ length: 5 }, () => result({ netMinor: minor(100) }));
    expect(computeWinLossSummary(four).rate.suppressed).toBe(true);
    expect(computeWinLossSummary(five).rate.suppressed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The 06-statistics.md worked example, verbatim
// ---------------------------------------------------------------------------

describe('computePersonalStatistics — the spec\'s own worked example', () => {
  it('lost ₪100 five times, won ₪100 once', () => {
    const entries: PersonalResultEntry[] = [];
    for (let i = 0; i < 5; i += 1) {
      const g = game({ playedOn: `2026-01-0${i + 1}` });
      entries.push(entry(g, { owedMinor: minor(10000), netMinor: minor(-10000) }));
    }
    const winGame = game({ playedOn: '2026-01-06' });
    entries.push(entry(winGame, { owedMinor: minor(10000), netMinor: minor(10000) }));

    const stats = computePersonalStatistics(entries);
    expect(stats.totalNetMinor).toBe(minor(-40000)); // −400 in major units
    expect(stats.winLoss.rate.value).toBeCloseTo(1 / 6, 10); // 17%
    expect(stats.roiPercent).toBeCloseTo(-((400 / 600) * 100), 6); // −67%
  });
});

describe('computePersonalStatistics — profit per hour with a late joiner', () => {
  it('measures each game against that player\'s own minutes, not the game\'s duration', () => {
    const full = game({ playedOn: '2026-01-01', durationMinutes: 240 });
    const late = game({ playedOn: '2026-01-02', durationMinutes: 240 });
    const entries: PersonalResultEntry[] = [
      entry(full, { minutesPlayed: 240, netMinor: minor(20000) }),
      // Joined for the last hour of a 4-hour game — minutesPlayed reflects that, not 240.
      entry(late, { minutesPlayed: 60, netMinor: minor(5000) }),
    ];
    const stats = computePersonalStatistics(entries);
    // Σnet / Σ(minutes/60) = 25000 / (4 + 1) = 5000 (₪50/hour), not 25000 / (4 + 4).
    expect(stats.profitPerHourMinor).toBe(minor(5000));
  });
});

describe('computePersonalStatistics — general shape', () => {
  it('computes best/worst night, avgBuyIns, sharedCosts and currency', () => {
    const g1 = game({ playedOn: '2026-01-01' });
    const g2 = game({ playedOn: '2026-01-02' });
    const entries: PersonalResultEntry[] = [
      entry(g1, { buysCount: 2, netMinor: minor(3000), sharedCostsShareMinor: minor(-500) }),
      entry(g2, { buysCount: 4, netMinor: minor(-1000), sharedCostsShareMinor: minor(200) }),
    ];
    const stats = computePersonalStatistics(entries);
    expect(stats.bestNight).toEqual({ gameId: g1.gameId, gameName: g1.name, netMinor: minor(3000) });
    expect(stats.worstNight).toEqual({ gameId: g2.gameId, gameName: g2.name, netMinor: minor(-1000) });
    expect(stats.avgBuyIns).toBe(3);
    expect(stats.sharedCostsMinor).toBe(minor(-300));
    expect(stats.currency).toBe('ILS');
    expect(stats.currencyMixed).toBe(false);
  });

  it('flags a mixed currency, choosing the more common label', () => {
    const entries: PersonalResultEntry[] = [
      entry(game({ playedOn: '2026-01-01', currency: 'ILS' })),
      entry(game({ playedOn: '2026-01-02', currency: 'ILS' })),
      entry(game({ playedOn: '2026-01-03', currency: 'USD' })),
    ];
    const stats = computePersonalStatistics(entries);
    expect(stats.currencyMixed).toBe(true);
    expect(stats.currency).toBe('ILS');
  });

  it('returns nulls, not NaN or throws, with zero games', () => {
    const stats = computePersonalStatistics([]);
    expect(stats.gamesPlayed).toBe(0);
    expect(stats.avgBuyInPerGameMinor).toBeNull();
    expect(stats.avgResultMinor).toBeNull();
    expect(stats.roiPercent).toBeNull();
    expect(stats.profitPerHourMinor).toBeNull();
    expect(stats.avgBuyIns).toBeNull();
    expect(stats.bestNight).toBeNull();
    expect(stats.worstNight).toBeNull();
  });
});

describe('summarizeCurrency', () => {
  it('breaks a tie by recency', () => {
    const rows = [
      { currency: 'ILS', finishedAt: '2026-01-01T00:00:00Z' },
      { currency: 'USD', finishedAt: '2026-02-01T00:00:00Z' },
    ];
    expect(summarizeCurrency(rows)).toEqual({ currency: 'USD', mixed: true });
  });

  it('is not mixed with a single currency', () => {
    const rows = [
      { currency: 'ILS', finishedAt: '2026-01-01T00:00:00Z' },
      { currency: 'ILS', finishedAt: '2026-02-01T00:00:00Z' },
    ];
    expect(summarizeCurrency(rows)).toEqual({ currency: 'ILS', mixed: false });
  });
});

// ---------------------------------------------------------------------------
// Streaks
// ---------------------------------------------------------------------------

describe('computeStreaks', () => {
  it('finds the current and all-time-longest win/lose streaks, breakeven breaks both', () => {
    const nets: Minor[] = [100, 100, -50, 100, 100, 100, 0, -20, -20].map((n) => minor(n));
    const streaks = computeStreaks(nets.map((netMinor) => ({ netMinor })));
    expect(streaks.longestWinStreak).toBe(3); // the run of three +100s
    expect(streaks.longestLoseStreak).toBe(2); // the trailing two −20s
    expect(streaks.currentDirection).toBe('lose');
    expect(streaks.currentLength).toBe(2);
  });

  it('reports "none" when the most recent game was a breakeven', () => {
    const nets: Minor[] = [100, 0].map((n) => minor(n));
    const streaks = computeStreaks(nets.map((netMinor) => ({ netMinor })));
    expect(streaks.currentDirection).toBe('none');
    expect(streaks.currentLength).toBe(0);
  });
});

describe('cumulativeNetSeries', () => {
  it('is a running total in input order', () => {
    const nets: Minor[] = [100, -30, 50].map((n) => minor(n));
    expect(cumulativeNetSeries(nets)).toEqual([100, 70, 120]);
  });
});

// ---------------------------------------------------------------------------
// Group-level statistics
// ---------------------------------------------------------------------------

describe('computeGroupPlayerStatistics', () => {
  it('computes attendance against the group\'s total game count, not the player\'s own', () => {
    const games = Array.from({ length: 10 }, (_, i) => game({ playedOn: `2026-01-${10 + i}` }));
    const results = games
      .slice(0, 4)
      .map((g) => result({ gameId: g.gameId, userId: 'u1', netMinor: minor(100) }));

    const stats = computeGroupPlayerStatistics(results, games, new Map([['u1', 'Roi']]), new Map());
    expect(stats).toHaveLength(1);
    expect(stats[0]!.attendanceRate.value).toBeCloseTo(0.4, 10);
    expect(stats[0]!.attendanceRate.sampleSize).toBe(10);
    expect(stats[0]!.statsVisible).toBe(true); // default 'group' when unspecified
  });

  it('excludes guest rows (no userId) from per-player aggregation entirely', () => {
    const g = game();
    const results = [
      result({ gameId: g.gameId, userId: null, guestName: 'Guest', netMinor: minor(500) }),
      result({ gameId: g.gameId, userId: 'u1', netMinor: minor(100) }),
    ];
    const stats = computeGroupPlayerStatistics(results, [g], new Map([['u1', 'Roi']]), new Map());
    expect(stats).toHaveLength(1);
    expect(stats[0]!.userId).toBe('u1');
  });

  it('respects an explicit stats_visibility of private', () => {
    const g = game();
    const results = [result({ gameId: g.gameId, userId: 'u1', netMinor: minor(100) })];
    const stats = computeGroupPlayerStatistics(
      results,
      [g],
      new Map([['u1', 'Roi']]),
      new Map([['u1', 'private']]),
    );
    expect(stats[0]!.statsVisible).toBe(false);
  });
});

describe('computeGroupTableStatistics', () => {
  it('matches a hand-computed fixture', () => {
    const g1 = game({
      playedOn: '2026-01-05', // Monday
      durationMinutes: 120,
      totalBuyInsMinor: minor(40000),
      totalCashPotMinor: minor(10000),
      unaccountedMinor: minor(200),
      sharedCostsMinor: minor(1000),
    });
    const g2 = game({
      playedOn: '2026-01-12', // Monday
      durationMinutes: 240,
      totalBuyInsMinor: minor(60000),
      totalCashPotMinor: minor(30000),
      unaccountedMinor: minor(0),
      sharedCostsMinor: minor(500),
      playerCount: 6,
    });
    const results = [
      result({ gameId: g1.gameId, userId: 'u1', buysCount: 2 }),
      result({ gameId: g1.gameId, userId: 'u2', buysCount: 2 }),
      result({ gameId: g2.gameId, userId: 'u1', buysCount: 3 }),
      result({ gameId: g2.gameId, userId: 'u2', buysCount: 3 }),
    ];

    const stats = computeGroupTableStatistics([g1, g2], results);
    expect(stats.gamesCount).toBe(2);
    expect(stats.totalMoneyPlayedMinor).toBe(minor(100000));
    expect(stats.totalHours).toBe(6); // 360 minutes
    expect(stats.avgPotMinor).toBe(minor(20000)); // (10000 + 30000) / 2
    expect(stats.biggestNight).toEqual({ gameId: g2.gameId, gameName: g2.name, potMinor: minor(30000) });
    expect(stats.avgPlayersPerGame).toBe(5); // (4 + 6) / 2
    expect(stats.avgBuyInsPerGame).toBe(5); // (4 + 6) / 2
    expect(stats.avgGameDurationMinutes).toBe(180);
    expect(stats.totalUnaccountedMinor).toBe(minor(200));
    expect(stats.totalSharedCostsMinor).toBe(minor(1500));
    expect(stats.mostCommonWeekday).toBe(1); // Monday
    expect(stats.longestSessionMinutes).toBe(240);
  });

  it('returns a well-defined empty shape for zero games', () => {
    const stats = computeGroupTableStatistics([], []);
    expect(stats.gamesCount).toBe(0);
    expect(stats.avgPotMinor).toBeNull();
    expect(stats.biggestNight).toBeNull();
    expect(stats.mostCommonWeekday).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Fun statistics
// ---------------------------------------------------------------------------

describe('computeDonator', () => {
  it('picks the most negative total net', () => {
    const stats = computeGroupPlayerStatistics(
      [
        result({ gameId: 'g1', userId: 'u1', netMinor: minor(-5000) }),
        result({ gameId: 'g1', userId: 'u2', netMinor: minor(-9000) }),
        result({ gameId: 'g1', userId: 'u3', netMinor: minor(1000) }),
      ],
      [game({ gameId: 'g1' })],
      new Map([['u1', 'A'], ['u2', 'B'], ['u3', 'C']]),
      new Map(),
    );
    expect(computeDonator(stats)).toEqual({ userId: 'u2', displayName: 'B', valueMinor: minor(-9000) });
  });

  it('is null when nobody is in the red', () => {
    const stats = computeGroupPlayerStatistics(
      [result({ gameId: 'g1', userId: 'u1', netMinor: minor(500) })],
      [game({ gameId: 'g1' })],
      new Map([['u1', 'A']]),
      new Map(),
    );
    expect(computeDonator(stats)).toBeNull();
  });
});

describe('computeIronMan', () => {
  it('finds the longest consecutive-attendance run across the group\'s own game order', () => {
    const games = Array.from({ length: 6 }, (_, i) => game({ playedOn: `2026-01-0${i + 1}` }));
    // u1 attends games 1,2,3, skips 4, attends 5,6 → longest run 3.
    // u2 attends 1, skips 2, attends 3,4,5, skips 6 → longest run 3, but u2's run is also 3 —
    // tie broken by insertion order (u1 first) since neither exceeds the other.
    const results = [
      result({ gameId: games[0]!.gameId, userId: 'u1' }),
      result({ gameId: games[1]!.gameId, userId: 'u1' }),
      result({ gameId: games[2]!.gameId, userId: 'u1' }),
      result({ gameId: games[4]!.gameId, userId: 'u1' }),
      result({ gameId: games[5]!.gameId, userId: 'u1' }),
      result({ gameId: games[0]!.gameId, userId: 'u2' }),
      result({ gameId: games[2]!.gameId, userId: 'u2' }),
      result({ gameId: games[3]!.gameId, userId: 'u2' }),
      result({ gameId: games[4]!.gameId, userId: 'u2' }),
    ];
    const ironMan = computeIronMan(games, results, new Map([['u1', 'A'], ['u2', 'B']]));
    expect(ironMan?.streak).toBe(3);
    expect(ironMan?.userId).toBe('u1');
  });
});

describe('computeChipMagnet', () => {
  it('picks the highest average chip count at settle', () => {
    const results = [
      result({ userId: 'u1', chipsFinal: 100 }),
      result({ userId: 'u1', chipsFinal: 300 }),
      result({ userId: 'u2', chipsFinal: 150 }),
    ];
    const magnet = computeChipMagnet(results, new Map([['u1', 'A'], ['u2', 'B']]));
    expect(magnet).toEqual({ userId: 'u1', displayName: 'A', avgChips: 200 });
  });
});

describe('computeTheMachine', () => {
  it('finds the single-game record and the highest per-game average', () => {
    const g1 = game({ gameId: 'g1', name: 'Thursday' });
    const g2 = game({ gameId: 'g2', name: 'Friday' });
    const results = [
      result({ gameId: 'g1', userId: 'u1', buysCount: 8 }),
      result({ gameId: 'g2', userId: 'u1', buysCount: 2 }),
      result({ gameId: 'g1', userId: 'u2', buysCount: 5 }),
      result({ gameId: 'g2', userId: 'u2', buysCount: 5 }),
    ];
    const machine = computeTheMachine(results, [g1, g2], new Map([['u1', 'A'], ['u2', 'B']]));
    expect(machine.singleGame).toEqual({
      userId: 'u1',
      displayName: 'A',
      gameId: 'g1',
      gameName: 'Thursday',
      buysCount: 8,
    });
    // u1 avg = (8+2)/2 = 5, u2 avg = (5+5)/2 = 5 — tie, u1 kept as first-seen.
    expect(machine.highestAverage?.avgBuyIns).toBe(5);
  });
});

describe('computeComeback', () => {
  it('counts 3+ buy-in games that still finished green, and the biggest', () => {
    const g1 = game({ gameId: 'g1', name: 'Big comeback' });
    const results = [
      result({ gameId: 'g1', userId: 'u1', buysCount: 4, netMinor: minor(5000) }),
      result({ gameId: 'g1', userId: 'u2', buysCount: 3, netMinor: minor(1000) }),
      result({ gameId: 'g1', userId: 'u3', buysCount: 2, netMinor: minor(9000) }), // < 3 buy-ins, excluded
      result({ gameId: 'g1', userId: 'u4', buysCount: 5, netMinor: minor(-100) }), // finished red, excluded
    ];
    const comeback = computeComeback(results, [g1], new Map([['u1', 'A'], ['u2', 'B']]));
    expect(comeback.count).toBe(2);
    expect(comeback.biggest?.userId).toBe('u1');
    expect(comeback.biggest?.netMinor).toBe(minor(5000));
  });
});

describe('computeGroupHotColdStreaks', () => {
  it('finds the hottest and coldest current streak in the group', () => {
    const games = Array.from({ length: 3 }, (_, i) => game({ playedOn: `2026-01-0${i + 1}` }));
    const results = [
      result({ gameId: games[0]!.gameId, userId: 'u1', netMinor: minor(100) }),
      result({ gameId: games[1]!.gameId, userId: 'u1', netMinor: minor(100) }),
      result({ gameId: games[2]!.gameId, userId: 'u1', netMinor: minor(100) }),
      result({ gameId: games[0]!.gameId, userId: 'u2', netMinor: minor(-100) }),
      result({ gameId: games[1]!.gameId, userId: 'u2', netMinor: minor(-100) }),
      result({ gameId: games[2]!.gameId, userId: 'u2', netMinor: minor(100) }), // breaks the cold streak
    ];
    const streaks = computeGroupHotColdStreaks(games, results, new Map([['u1', 'A'], ['u2', 'B']]));
    expect(streaks.hottest).toEqual({ userId: 'u1', displayName: 'A', length: 3 });
    expect(streaks.coldest).toBeNull(); // u2's most recent game was a win, so no active cold streak
  });
});

describe('computeNemesisPatron', () => {
  it('finds who the viewer pays most, and who pays the viewer most', () => {
    const transfers: TransferSummaryRow[] = [
      { gameId: 'g1', fromName: 'Me', toName: 'Dana', fromUserId: 'me', toUserId: 'dana', amountMinor: minor(1000), orderIndex: 0 },
      { gameId: 'g2', fromName: 'Me', toName: 'Dana', fromUserId: 'me', toUserId: 'dana', amountMinor: minor(500), orderIndex: 0 },
      { gameId: 'g1', fromName: 'Me', toName: 'Roi', fromUserId: 'me', toUserId: 'roi', amountMinor: minor(2000), orderIndex: 1 },
      { gameId: 'g1', fromName: 'Mor', toName: 'Me', fromUserId: 'mor', toUserId: 'me', amountMinor: minor(300), orderIndex: 2 },
      { gameId: 'g2', fromName: 'Mor', toName: 'Me', fromUserId: 'mor', toUserId: 'me', amountMinor: minor(300), orderIndex: 1 },
    ];
    const { nemesis, patron } = computeNemesisPatron(transfers, 'me');
    expect(nemesis).toEqual({ userId: 'dana', displayName: 'Dana', timesPaid: 2, totalMinor: minor(1500) });
    expect(patron).toEqual({ userId: 'mor', displayName: 'Mor', timesPaidBy: 2, totalMinor: minor(600) });
  });

  it('is null on both sides when the viewer has no transfers at all', () => {
    const { nemesis, patron } = computeNemesisPatron([], 'me');
    expect(nemesis).toBeNull();
    expect(patron).toBeNull();
  });
});

describe('computeFunStatistics', () => {
  it('omits nemesisPatron entirely without a signed-in viewer', () => {
    const g = game();
    const results = [result({ gameId: g.gameId, userId: 'u1', netMinor: minor(-100) })];
    const playerStats = computeGroupPlayerStatistics(results, [g], new Map([['u1', 'A']]), new Map());
    const fun = computeFunStatistics(results, [g], [], new Map([['u1', 'A']]), playerStats, null);
    expect(fun.nemesisPatron).toBeNull();
    expect(fun.donator).not.toBeNull();
  });
});
