import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { listRecentPlayers, recordPlayedNames } from './recentPlayers';

beforeEach(async () => {
  await db.recentPlayers.clear();
});

describe('recordPlayedNames / listRecentPlayers', () => {
  it('creates a fresh entry with playCount 1', async () => {
    await recordPlayedNames(['מור']);
    const list = await listRecentPlayers();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'מור', playCount: 1 });
    expect(typeof list[0]?.lastPlayedAt).toBe('string');
  });

  it('increments playCount on repeat appearances', async () => {
    await recordPlayedNames(['מור']);
    await recordPlayedNames(['מור', 'אורי']);
    const list = await listRecentPlayers();
    expect(list.find((p) => p.name === 'מור')?.playCount).toBe(2);
    expect(list.find((p) => p.name === 'אורי')?.playCount).toBe(1);
  });

  it('sorts by playCount descending, most recent breaking ties', async () => {
    // Seeded directly (rather than via fake timers, which fake-indexeddb's
    // internal scheduling doesn't tolerate) so ordering is deterministic.
    await db.recentPlayers.bulkPut([
      { name: 'a', playCount: 2, lastPlayedAt: '2026-01-02T00:00:00Z' },
      { name: 'b', playCount: 2, lastPlayedAt: '2026-01-03T00:00:00Z' },
      { name: 'c', playCount: 1, lastPlayedAt: '2026-01-03T00:00:00Z' },
    ]);

    const list = await listRecentPlayers();
    expect(list.map((p) => p.name)).toEqual(['b', 'a', 'c']);
  });

  it('trims whitespace and ignores blank names', async () => {
    await recordPlayedNames(['  מור  ', '   ']);
    const list = await listRecentPlayers();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'מור', playCount: 1 });
    expect(typeof list[0]?.lastPlayedAt).toBe('string');
  });

  it('respects the limit', async () => {
    await recordPlayedNames(['a', 'b', 'c']);
    const list = await listRecentPlayers(2);
    expect(list).toHaveLength(2);
  });
});
