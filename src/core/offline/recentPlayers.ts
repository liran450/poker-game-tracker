import { db } from './db';
import type { RecentPlayerRecord } from './db';

/** Bumps play-count for each guest name just seated in a game. */
export async function recordPlayedNames(names: readonly string[]): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction('rw', db.recentPlayers, async () => {
    for (const name of names) {
      const trimmed = name.trim();
      if (!trimmed) continue;
      const existing = await db.recentPlayers.get(trimmed);
      await db.recentPlayers.put({
        name: trimmed,
        playCount: (existing?.playCount ?? 0) + 1,
        lastPlayedAt: now,
      });
    }
  });
}

/** Most-frequently-played-with first, most-recent as the tiebreaker. */
export async function listRecentPlayers(limit = 40): Promise<RecentPlayerRecord[]> {
  const all = await db.recentPlayers.toArray();
  return all
    .sort((a, b) => b.playCount - a.playCount || (a.lastPlayedAt < b.lastPlayedAt ? 1 : -1))
    .slice(0, limit);
}
