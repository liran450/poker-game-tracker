import { add, type Minor, minor, sum } from './money';

/**
 * Statistics (06-statistics.md), pure and dependency-free like settlement.ts — everything here
 * reads only the shapes the permanent tables (03-data-model.md#permanent-tables) already carry,
 * never a live table, so "statistics survive the retention policy" is true by construction: these
 * functions have no way to reach `game_players`/`games` even if a caller wanted them to
 * (docs/build/PLAN.md step 15's own exit criterion). `src/data/statistics.ts` is the only caller
 * that knows how to fetch the rows; everything here just crunches arrays already in memory, which
 * is what makes every formula testable against a hand-computed fixture.
 */

// ---------------------------------------------------------------------------
// Row shapes — mirror player_results / game_summaries / transfer_summaries, camelCased
// ---------------------------------------------------------------------------

export type StatsVisibility = 'group' | 'private';

export interface PlayerResultRow {
  readonly id: string;
  readonly gameId: string;
  readonly groupId: string | null;
  readonly isPrivate: boolean;
  readonly userId: string | null;
  readonly guestName: string | null;
  readonly displayName: string;
  readonly buysCount: number;
  readonly owedMinor: Minor;
  readonly cashPaidMinor: Minor;
  readonly chipsFinal: number;
  readonly cashOutMinor: Minor;
  readonly netMinor: Minor;
  readonly sharedCostsShareMinor: Minor;
  readonly minutesPlayed: number;
  readonly settledPosition: number | null;
}

export interface GameSummaryRow {
  readonly gameId: string;
  readonly groupId: string | null;
  readonly name: string;
  /** ISO date, `YYYY-MM-DD`. */
  readonly playedOn: string;
  readonly currency: string;
  readonly buyAmountMinor: Minor;
  readonly chipsPerBuy: number;
  readonly playerCount: number;
  readonly durationMinutes: number;
  readonly totalBuyInsMinor: Minor;
  /** Physical cash handed to the pot (05-settlement.md#the-pot-as-a-settlement-node) — not the total money in play. */
  readonly totalCashPotMinor: Minor;
  readonly unaccountedMinor: Minor;
  readonly sharedCostsMinor: Minor;
  readonly isPrivate: boolean;
  /** ISO timestamp — the one unambiguous chronological key (playedOn is a bare date). */
  readonly finishedAt: string;
}

export interface TransferSummaryRow {
  readonly gameId: string;
  readonly fromName: string;
  readonly toName: string;
  readonly fromUserId: string | null;
  readonly toUserId: string | null;
  readonly amountMinor: Minor;
  readonly orderIndex: number;
}

/** One player's result joined with its game — the personal-statistics unit (data layer's join). */
export interface PersonalResultEntry {
  readonly result: PlayerResultRow;
  readonly game: GameSummaryRow;
}

// ---------------------------------------------------------------------------
// Sample-size suppression (06-statistics.md#presentation-rules)
// ---------------------------------------------------------------------------

/** Below this many games, a rate is suppressed rather than shown ("נתונים חלקיים"). */
export const MIN_SAMPLE_SIZE_FOR_RATE = 5;

export interface Rate {
  /** A fraction in [0, 1], or `null` when there is nothing to divide. */
  readonly value: number | null;
  readonly sampleSize: number;
  readonly suppressed: boolean;
}

function makeRate(numerator: number, denominator: number, sampleSize: number): Rate {
  return {
    value: denominator === 0 ? null : numerator / denominator,
    sampleSize,
    suppressed: sampleSize < MIN_SAMPLE_SIZE_FOR_RATE,
  };
}

// ---------------------------------------------------------------------------
// Currency (06-statistics.md#scoping: "a label, not a conversion")
// ---------------------------------------------------------------------------

export interface CurrencySummary {
  /** The label to display totals in — the most common currency among the rows, ties broken by recency. */
  readonly currency: string;
  /** True when the underlying rows span more than one currency label. */
  readonly mixed: boolean;
}

const FALLBACK_CURRENCY = 'ILS';

/**
 * The app never converts between currencies — amounts are summed as raw numbers regardless of
 * label (06-statistics.md#scoping is explicit about this, unintuitive as it reads). This only
 * decides *which* currency label to print next to that raw sum, and whether to show the
 * "more than one currency" note.
 */
export function summarizeCurrency(
  rows: readonly { readonly currency: string; readonly finishedAt: string }[],
): CurrencySummary {
  if (rows.length === 0) return { currency: FALLBACK_CURRENCY, mixed: false };

  const counts = new Map<string, number>();
  const latest = new Map<string, string>();
  for (const row of rows) {
    counts.set(row.currency, (counts.get(row.currency) ?? 0) + 1);
    const prevLatest = latest.get(row.currency);
    if (!prevLatest || row.finishedAt > prevLatest) latest.set(row.currency, row.finishedAt);
  }

  const distinct = [...counts.keys()];
  if (distinct.length === 1) return { currency: distinct[0]!, mixed: false };

  let best = distinct[0]!;
  for (const candidate of distinct.slice(1)) {
    const bestCount = counts.get(best)!;
    const candidateCount = counts.get(candidate)!;
    if (
      candidateCount > bestCount ||
      (candidateCount === bestCount && latest.get(candidate)! > latest.get(best)!)
    ) {
      best = candidate;
    }
  }
  return { currency: best, mixed: true };
}

// ---------------------------------------------------------------------------
// Win / loss (06-statistics.md#personal-statistics-12: zero-exclusion rule)
// ---------------------------------------------------------------------------

export interface WinLossSummary {
  readonly wins: number;
  readonly losses: number;
  readonly breakeven: number;
  /** wins / (wins + losses) — breakeven games excluded from the denominator, per the spec. */
  readonly rate: Rate;
}

export function computeWinLossSummary(
  results: readonly { readonly netMinor: Minor }[],
): WinLossSummary {
  let wins = 0;
  let losses = 0;
  let breakeven = 0;
  for (const r of results) {
    if (r.netMinor > 0) wins += 1;
    else if (r.netMinor < 0) losses += 1;
    else breakeven += 1;
  }
  return { wins, losses, breakeven, rate: makeRate(wins, wins + losses, results.length) };
}

// ---------------------------------------------------------------------------
// Streaks (#24) — chronological (oldest → newest) input required
// ---------------------------------------------------------------------------

export type StreakDirection = 'win' | 'lose' | 'none';

export interface StreakSummary {
  readonly currentDirection: StreakDirection;
  readonly currentLength: number;
  readonly longestWinStreak: number;
  readonly longestLoseStreak: number;
}

/** A breakeven game (net = 0) breaks both a win and a lose streak. */
export function computeStreaks(
  chronological: readonly { readonly netMinor: Minor }[],
): StreakSummary {
  let longestWin = 0;
  let longestLose = 0;
  let runWin = 0;
  let runLose = 0;

  for (const r of chronological) {
    if (r.netMinor > 0) {
      runWin += 1;
      runLose = 0;
    } else if (r.netMinor < 0) {
      runLose += 1;
      runWin = 0;
    } else {
      runWin = 0;
      runLose = 0;
    }
    longestWin = Math.max(longestWin, runWin);
    longestLose = Math.max(longestLose, runLose);
  }

  const last = chronological.at(-1);
  let currentDirection: StreakDirection = 'none';
  let currentLength = 0;
  if (last && last.netMinor > 0) {
    currentDirection = 'win';
    currentLength = runWin;
  } else if (last && last.netMinor < 0) {
    currentDirection = 'lose';
    currentLength = runLose;
  }

  return { currentDirection, currentLength, longestWinStreak: longestWin, longestLoseStreak: longestLose };
}

/** Running total, same order as the input — the sparkline's data source. */
export function cumulativeNetSeries(chronologicalNet: readonly Minor[]): Minor[] {
  let running = minor(0);
  return chronologicalNet.map((n) => (running = add(running, n)));
}

// ---------------------------------------------------------------------------
// Personal statistics (06-statistics.md#personal-statistics-12)
// ---------------------------------------------------------------------------

export interface BestWorstNight {
  readonly gameId: string;
  readonly gameName: string;
  readonly netMinor: Minor;
}

export interface PersonalStatistics {
  readonly gamesPlayed: number;
  readonly currency: string;
  readonly currencyMixed: boolean;
  readonly totalNetMinor: Minor;
  readonly winLoss: WinLossSummary;
  readonly totalMoneyPlayedMinor: Minor;
  readonly avgBuyInPerGameMinor: Minor | null;
  readonly avgResultMinor: Minor | null;
  /** A percentage, e.g. -67 for -67%. `null` when nothing was ever bought in. */
  readonly roiPercent: number | null;
  readonly bestNight: BestWorstNight | null;
  readonly worstNight: BestWorstNight | null;
  /** Rounded to the nearest whole minor unit for display — a rate, not a literal transaction amount. */
  readonly profitPerHourMinor: Minor | null;
  readonly streaks: StreakSummary;
  readonly avgBuyIns: number | null;
  readonly sharedCostsMinor: Minor;
  /** Chronological (oldest → newest) — feeds the cumulative-net sparkline. */
  readonly netByGame: readonly { readonly gameId: string; readonly finishedAt: string; readonly netMinor: Minor }[];
}

export function computePersonalStatistics(
  entries: readonly PersonalResultEntry[],
): PersonalStatistics {
  const chronological = [...entries].sort((a, b) =>
    a.game.finishedAt.localeCompare(b.game.finishedAt),
  );
  const results = chronological.map((e) => e.result);
  const gamesPlayed = results.length;

  const { currency, mixed } = summarizeCurrency(chronological.map((e) => e.game));

  const totalNetMinor = sum(results.map((r) => r.netMinor));
  const totalMoneyPlayedMinor = sum(results.map((r) => r.owedMinor));
  const sharedCostsMinor = sum(results.map((r) => r.sharedCostsShareMinor));

  const avgBuyInPerGameMinor =
    gamesPlayed === 0 ? null : minor(Math.round(totalMoneyPlayedMinor / gamesPlayed));
  const avgResultMinor = gamesPlayed === 0 ? null : minor(Math.round(totalNetMinor / gamesPlayed));
  const roiPercent =
    totalMoneyPlayedMinor === 0 ? null : (totalNetMinor / totalMoneyPlayedMinor) * 100;

  let bestNight: BestWorstNight | null = null;
  let worstNight: BestWorstNight | null = null;
  for (const e of chronological) {
    if (!bestNight || e.result.netMinor > bestNight.netMinor) {
      bestNight = { gameId: e.game.gameId, gameName: e.game.name, netMinor: e.result.netMinor };
    }
    if (!worstNight || e.result.netMinor < worstNight.netMinor) {
      worstNight = { gameId: e.game.gameId, gameName: e.game.name, netMinor: e.result.netMinor };
    }
  }

  // Per-player minutes, not the game's own duration — a player who joined for the last 40
  // minutes of a 5-hour session isn't measured against the whole 5 hours (06-statistics.md#24).
  const totalHours = results.reduce((acc, r) => acc + r.minutesPlayed / 60, 0);
  const profitPerHourMinor = totalHours === 0 ? null : minor(Math.round(totalNetMinor / totalHours));

  const totalBuyIns = results.reduce((acc, r) => acc + r.buysCount, 0);
  const avgBuyIns = gamesPlayed === 0 ? null : totalBuyIns / gamesPlayed;

  return {
    gamesPlayed,
    currency,
    currencyMixed: mixed,
    totalNetMinor,
    winLoss: computeWinLossSummary(results),
    totalMoneyPlayedMinor,
    avgBuyInPerGameMinor,
    avgResultMinor,
    roiPercent,
    bestNight,
    worstNight,
    profitPerHourMinor,
    streaks: computeStreaks(results),
    avgBuyIns,
    sharedCostsMinor,
    netByGame: chronological.map((e) => ({
      gameId: e.game.gameId,
      finishedAt: e.game.finishedAt,
      netMinor: e.result.netMinor,
    })),
  };
}

// ---------------------------------------------------------------------------
// Group scoping helpers — guests (userId === null) never aggregate into a persistent
// "player" (06-statistics.md#inclusion-rule-10): only claimed/registered rows carry identity
// across games.
// ---------------------------------------------------------------------------

function groupResultsByUser(
  results: readonly PlayerResultRow[],
): Map<string, PlayerResultRow[]> {
  const byUser = new Map<string, PlayerResultRow[]>();
  for (const r of results) {
    if (!r.userId) continue;
    const list = byUser.get(r.userId);
    if (list) list.push(r);
    else byUser.set(r.userId, [r]);
  }
  return byUser;
}

function chronologicalGameOrder(games: readonly GameSummaryRow[]): GameSummaryRow[] {
  return [...games].sort((a, b) => a.finishedAt.localeCompare(b.finishedAt));
}

function resolveDisplayName(
  userId: string,
  displayNames: ReadonlyMap<string, string>,
  fallbackResults: readonly PlayerResultRow[],
): string {
  return displayNames.get(userId) ?? fallbackResults[0]?.displayName ?? '';
}

// ---------------------------------------------------------------------------
// Group-level, per-player statistics (06-statistics.md#group-level-statistics-11)
// ---------------------------------------------------------------------------

export interface GroupPlayerStatistics {
  readonly userId: string;
  readonly displayName: string;
  /** `stats_visibility !== 'private'` — false means "keep off the leaderboard, still count anonymously". */
  readonly statsVisible: boolean;
  readonly gamesPlayed: number;
  readonly winLoss: WinLossSummary;
  readonly totalNetMinor: Minor;
  readonly avgNetMinor: Minor | null;
  readonly roiPercent: number | null;
  readonly avgMoneyPlayedPerGameMinor: Minor | null;
  readonly avgBuyInsPerGame: number | null;
  readonly attendanceRate: Rate;
}

/**
 * `results`/`games` must already be group-scoped and `is_private`-excluded — this function has no
 * way to enforce that itself, since it never sees a game_id → is_private mapping beyond what it's
 * handed (see `src/data/statistics.ts`, which reads from `group_player_results`).
 */
export function computeGroupPlayerStatistics(
  results: readonly PlayerResultRow[],
  games: readonly GameSummaryRow[],
  displayNames: ReadonlyMap<string, string>,
  statsVisibility: ReadonlyMap<string, StatsVisibility>,
): GroupPlayerStatistics[] {
  const totalGroupGames = games.length;
  const byUser = groupResultsByUser(results);

  return [...byUser.entries()].map(([userId, userResults]) => {
    const gamesPlayed = userResults.length;
    const totalNetMinor = sum(userResults.map((r) => r.netMinor));
    const totalMoneyPlayedMinor = sum(userResults.map((r) => r.owedMinor));
    const totalBuyIns = userResults.reduce((acc, r) => acc + r.buysCount, 0);

    return {
      userId,
      displayName: resolveDisplayName(userId, displayNames, userResults),
      statsVisible: (statsVisibility.get(userId) ?? 'group') !== 'private',
      gamesPlayed,
      winLoss: computeWinLossSummary(userResults),
      totalNetMinor,
      avgNetMinor: gamesPlayed === 0 ? null : minor(Math.round(totalNetMinor / gamesPlayed)),
      roiPercent: totalMoneyPlayedMinor === 0 ? null : (totalNetMinor / totalMoneyPlayedMinor) * 100,
      avgMoneyPlayedPerGameMinor:
        gamesPlayed === 0 ? null : minor(Math.round(totalMoneyPlayedMinor / gamesPlayed)),
      avgBuyInsPerGame: gamesPlayed === 0 ? null : totalBuyIns / gamesPlayed,
      attendanceRate: makeRate(gamesPlayed, totalGroupGames, totalGroupGames),
    };
  });
}

// ---------------------------------------------------------------------------
// Group-level, table statistics (06-statistics.md#group-level-statistics-11)
// ---------------------------------------------------------------------------

export interface GroupTableStatistics {
  readonly gamesCount: number;
  readonly totalMoneyPlayedMinor: Minor;
  readonly totalHours: number;
  readonly avgPotMinor: Minor | null;
  readonly biggestNight: { readonly gameId: string; readonly gameName: string; readonly potMinor: Minor } | null;
  readonly avgPlayersPerGame: number | null;
  readonly avgBuyInsPerGame: number | null;
  readonly avgGameDurationMinutes: number | null;
  readonly totalUnaccountedMinor: Minor;
  readonly totalSharedCostsMinor: Minor;
  /** 0 (Sunday) – 6 (Saturday), UTC-based since `playedOn` is a bare date with no timezone. */
  readonly mostCommonWeekday: number | null;
  readonly longestSessionMinutes: number | null;
}

function weekdayOf(playedOn: string): number {
  return new Date(`${playedOn}T00:00:00Z`).getUTCDay();
}

export function computeGroupTableStatistics(
  games: readonly GameSummaryRow[],
  results: readonly PlayerResultRow[],
): GroupTableStatistics {
  const gamesCount = games.length;
  if (gamesCount === 0) {
    return {
      gamesCount: 0,
      totalMoneyPlayedMinor: minor(0),
      totalHours: 0,
      avgPotMinor: null,
      biggestNight: null,
      avgPlayersPerGame: null,
      avgBuyInsPerGame: null,
      avgGameDurationMinutes: null,
      totalUnaccountedMinor: minor(0),
      totalSharedCostsMinor: minor(0),
      mostCommonWeekday: null,
      longestSessionMinutes: null,
    };
  }

  const ordered = chronologicalGameOrder(games);
  const totalMinutes = ordered.reduce((acc, g) => acc + g.durationMinutes, 0);

  let biggestNight = ordered[0]!;
  for (const g of ordered) {
    if (g.totalCashPotMinor > biggestNight.totalCashPotMinor) biggestNight = g;
  }

  const buyInsPerGame = new Map<string, number>();
  for (const r of results) {
    buyInsPerGame.set(r.gameId, (buyInsPerGame.get(r.gameId) ?? 0) + r.buysCount);
  }

  const weekdayCounts = new Map<number, number>();
  for (const g of ordered) {
    const weekday = weekdayOf(g.playedOn);
    weekdayCounts.set(weekday, (weekdayCounts.get(weekday) ?? 0) + 1);
  }
  let mostCommonWeekday = 0;
  let mostCommonWeekdayCount = -1;
  for (const [weekday, count] of [...weekdayCounts.entries()].sort((a, b) => a[0] - b[0])) {
    if (count > mostCommonWeekdayCount) {
      mostCommonWeekday = weekday;
      mostCommonWeekdayCount = count;
    }
  }

  return {
    gamesCount,
    totalMoneyPlayedMinor: sum(ordered.map((g) => g.totalBuyInsMinor)),
    totalHours: totalMinutes / 60,
    avgPotMinor: minor(Math.round(sum(ordered.map((g) => g.totalCashPotMinor)) / gamesCount)),
    biggestNight: {
      gameId: biggestNight.gameId,
      gameName: biggestNight.name,
      potMinor: biggestNight.totalCashPotMinor,
    },
    avgPlayersPerGame: ordered.reduce((acc, g) => acc + g.playerCount, 0) / gamesCount,
    avgBuyInsPerGame:
      ordered.reduce((acc, g) => acc + (buyInsPerGame.get(g.gameId) ?? 0), 0) / gamesCount,
    avgGameDurationMinutes: totalMinutes / gamesCount,
    totalUnaccountedMinor: sum(ordered.map((g) => g.unaccountedMinor)),
    totalSharedCostsMinor: sum(ordered.map((g) => g.sharedCostsMinor)),
    mostCommonWeekday,
    longestSessionMinutes: Math.max(...ordered.map((g) => g.durationMinutes)),
  };
}

// ---------------------------------------------------------------------------
// Fun statistics (06-statistics.md#fun-statistics) — "the seven you picked, and only these"
// ---------------------------------------------------------------------------

export interface GroupRecordHolder {
  readonly userId: string;
  readonly displayName: string;
  readonly valueMinor: Minor;
}

/** Largest total negative net in the group. */
export function computeDonator(playerStats: readonly GroupPlayerStatistics[]): GroupRecordHolder | null {
  let worst: GroupPlayerStatistics | null = null;
  for (const p of playerStats) {
    if (p.totalNetMinor >= 0) continue;
    if (!worst || p.totalNetMinor < worst.totalNetMinor) worst = p;
  }
  return worst ? { userId: worst.userId, displayName: worst.displayName, valueMinor: worst.totalNetMinor } : null;
}

export interface IronMan {
  readonly userId: string;
  readonly displayName: string;
  readonly streak: number;
}

/** Longest run of consecutive games attended, across the group's own chronological game order. */
export function computeIronMan(
  games: readonly GameSummaryRow[],
  results: readonly PlayerResultRow[],
  displayNames: ReadonlyMap<string, string>,
): IronMan | null {
  const orderedGameIds = chronologicalGameOrder(games).map((g) => g.gameId);
  const byUser = groupResultsByUser(results);

  let best: IronMan | null = null;
  for (const [userId, userResults] of byUser) {
    const attended = new Set(userResults.map((r) => r.gameId));
    let longest = 0;
    let run = 0;
    for (const gameId of orderedGameIds) {
      if (attended.has(gameId)) {
        run += 1;
        longest = Math.max(longest, run);
      } else {
        run = 0;
      }
    }
    if (!best || longest > best.streak) {
      best = { userId, displayName: resolveDisplayName(userId, displayNames, userResults), streak: longest };
    }
  }
  return best;
}

export interface ChipMagnet {
  readonly userId: string;
  readonly displayName: string;
  readonly avgChips: number;
}

/** Highest average chip count at settle. */
export function computeChipMagnet(
  results: readonly PlayerResultRow[],
  displayNames: ReadonlyMap<string, string>,
): ChipMagnet | null {
  const byUser = groupResultsByUser(results);
  let best: ChipMagnet | null = null;
  for (const [userId, userResults] of byUser) {
    const avgChips = userResults.reduce((acc, r) => acc + r.chipsFinal, 0) / userResults.length;
    if (!best || avgChips > best.avgChips) {
      best = { userId, displayName: resolveDisplayName(userId, displayNames, userResults), avgChips };
    }
  }
  return best;
}

export interface TheMachine {
  readonly singleGame: {
    readonly userId: string;
    readonly displayName: string;
    readonly gameId: string;
    readonly gameName: string;
    readonly buysCount: number;
  } | null;
  readonly highestAverage: { readonly userId: string; readonly displayName: string; readonly avgBuyIns: number } | null;
}

/** Most buy-ins in a single game, and the highest per-game average. */
export function computeTheMachine(
  results: readonly PlayerResultRow[],
  games: readonly GameSummaryRow[],
  displayNames: ReadonlyMap<string, string>,
): TheMachine {
  const gameNames = new Map(games.map((g) => [g.gameId, g.name]));
  const byUser = groupResultsByUser(results);

  let singleGameRecord: PlayerResultRow | null = null;
  for (const r of results) {
    if (!r.userId) continue;
    if (!singleGameRecord || r.buysCount > singleGameRecord.buysCount) singleGameRecord = r;
  }

  let highestAverage: TheMachine['highestAverage'] = null;
  for (const [userId, userResults] of byUser) {
    const avgBuyIns = userResults.reduce((acc, r) => acc + r.buysCount, 0) / userResults.length;
    if (!highestAverage || avgBuyIns > highestAverage.avgBuyIns) {
      highestAverage = { userId, displayName: resolveDisplayName(userId, displayNames, userResults), avgBuyIns };
    }
  }

  return {
    singleGame:
      singleGameRecord && singleGameRecord.userId
        ? {
            userId: singleGameRecord.userId,
            displayName: resolveDisplayName(singleGameRecord.userId, displayNames, [singleGameRecord]),
            gameId: singleGameRecord.gameId,
            gameName: gameNames.get(singleGameRecord.gameId) ?? '',
            buysCount: singleGameRecord.buysCount,
          }
        : null,
    highestAverage,
  };
}

export interface Comeback {
  readonly count: number;
  readonly biggest: {
    readonly userId: string;
    readonly displayName: string;
    readonly gameId: string;
    readonly gameName: string;
    readonly netMinor: Minor;
    readonly buysCount: number;
  } | null;
}

/** Games with 3+ buy-ins that still finished in the green — the count, and the biggest one. */
export function computeComeback(
  results: readonly PlayerResultRow[],
  games: readonly GameSummaryRow[],
  displayNames: ReadonlyMap<string, string>,
  minBuyIns = 3,
): Comeback {
  const gameNames = new Map(games.map((g) => [g.gameId, g.name]));
  const qualifying = results.filter((r) => r.userId && r.buysCount >= minBuyIns && r.netMinor > 0);

  let biggest: PlayerResultRow | null = null;
  for (const r of qualifying) {
    if (!biggest || r.netMinor > biggest.netMinor) biggest = r;
  }

  return {
    count: qualifying.length,
    biggest:
      biggest && biggest.userId
        ? {
            userId: biggest.userId,
            displayName: resolveDisplayName(biggest.userId, displayNames, [biggest]),
            gameId: biggest.gameId,
            gameName: gameNames.get(biggest.gameId) ?? '',
            netMinor: biggest.netMinor,
            buysCount: biggest.buysCount,
          }
        : null,
  };
}

export interface HotColdStreakHolders {
  readonly hottest: { readonly userId: string; readonly displayName: string; readonly length: number } | null;
  readonly coldest: { readonly userId: string; readonly displayName: string; readonly length: number } | null;
}

/** Who in the group currently has the longest active win streak, and the longest active lose streak. */
export function computeGroupHotColdStreaks(
  games: readonly GameSummaryRow[],
  results: readonly PlayerResultRow[],
  displayNames: ReadonlyMap<string, string>,
): HotColdStreakHolders {
  const gameOrder = new Map(chronologicalGameOrder(games).map((g, i) => [g.gameId, i]));
  const byUser = groupResultsByUser(results);

  let hottest: HotColdStreakHolders['hottest'] = null;
  let coldest: HotColdStreakHolders['coldest'] = null;

  for (const [userId, userResults] of byUser) {
    const chronological = [...userResults].sort(
      (a, b) => (gameOrder.get(a.gameId) ?? 0) - (gameOrder.get(b.gameId) ?? 0),
    );
    const streak = computeStreaks(chronological);
    const displayName = resolveDisplayName(userId, displayNames, userResults);
    if (streak.currentDirection === 'win' && (!hottest || streak.currentLength > hottest.length)) {
      hottest = { userId, displayName, length: streak.currentLength };
    }
    if (streak.currentDirection === 'lose' && (!coldest || streak.currentLength > coldest.length)) {
      coldest = { userId, displayName, length: streak.currentLength };
    }
  }

  return { hottest, coldest };
}

export interface NemesisPatron {
  readonly nemesis: { readonly userId: string; readonly displayName: string; readonly timesPaid: number; readonly totalMinor: Minor } | null;
  readonly patron: { readonly userId: string; readonly displayName: string; readonly timesPaidBy: number; readonly totalMinor: Minor } | null;
}

/** From transfer_summaries: who the viewer most often pays (nemesis), and who most often pays them (patron). */
export function computeNemesisPatron(
  transfers: readonly TransferSummaryRow[],
  viewerUserId: string,
): NemesisPatron {
  interface Tally {
    count: number;
    total: Minor;
    name: string;
  }
  const paidTo = new Map<string, Tally>();
  const paidBy = new Map<string, Tally>();

  function tally(map: Map<string, Tally>, userId: string, name: string, amount: Minor): void {
    const existing = map.get(userId);
    if (existing) {
      existing.count += 1;
      existing.total = add(existing.total, amount);
    } else {
      map.set(userId, { count: 1, total: amount, name });
    }
  }

  for (const t of transfers) {
    if (t.fromUserId === viewerUserId && t.toUserId && t.toUserId !== viewerUserId) {
      tally(paidTo, t.toUserId, t.toName, t.amountMinor);
    }
    if (t.toUserId === viewerUserId && t.fromUserId && t.fromUserId !== viewerUserId) {
      tally(paidBy, t.fromUserId, t.fromName, t.amountMinor);
    }
  }

  function pickTop(map: Map<string, Tally>): [string, Tally] | null {
    let best: [string, Tally] | null = null;
    for (const entry of map) {
      const [userId, tallyEntry] = entry;
      if (
        !best ||
        tallyEntry.count > best[1].count ||
        (tallyEntry.count === best[1].count && tallyEntry.total > best[1].total) ||
        (tallyEntry.count === best[1].count && tallyEntry.total === best[1].total && userId < best[0])
      ) {
        best = entry;
      }
    }
    return best;
  }

  const nemesis = pickTop(paidTo);
  const patron = pickTop(paidBy);

  return {
    nemesis: nemesis
      ? { userId: nemesis[0], displayName: nemesis[1].name, timesPaid: nemesis[1].count, totalMinor: nemesis[1].total }
      : null,
    patron: patron
      ? { userId: patron[0], displayName: patron[1].name, timesPaidBy: patron[1].count, totalMinor: patron[1].total }
      : null,
  };
}

export interface FunStatistics {
  readonly donator: GroupRecordHolder | null;
  readonly ironMan: IronMan | null;
  readonly hotColdStreaks: HotColdStreakHolders;
  readonly chipMagnet: ChipMagnet | null;
  readonly theMachine: TheMachine;
  readonly comeback: Comeback;
  /** `null` when there's no signed-in viewer to compute a personal relationship for. */
  readonly nemesisPatron: NemesisPatron | null;
}

/** Bundles the seven fun stats — the group tab's one call. */
export function computeFunStatistics(
  results: readonly PlayerResultRow[],
  games: readonly GameSummaryRow[],
  transfers: readonly TransferSummaryRow[],
  displayNames: ReadonlyMap<string, string>,
  playerStats: readonly GroupPlayerStatistics[],
  viewerUserId: string | null,
): FunStatistics {
  return {
    donator: computeDonator(playerStats),
    ironMan: computeIronMan(games, results, displayNames),
    hotColdStreaks: computeGroupHotColdStreaks(games, results, displayNames),
    chipMagnet: computeChipMagnet(results, displayNames),
    theMachine: computeTheMachine(results, games, displayNames),
    comeback: computeComeback(results, games, displayNames),
    nemesisPatron: viewerUserId ? computeNemesisPatron(transfers, viewerUserId) : null,
  };
}
