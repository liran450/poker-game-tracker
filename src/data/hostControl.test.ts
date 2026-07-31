import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { getHostLastSyncedAt, handOverHost, takeOverHost } from './hostControl';
import { FakePostgrestClient } from './testSupport/fakePostgrestClient';

function client(fake: FakePostgrestClient): SupabaseClient {
  return fake as unknown as SupabaseClient;
}

describe('handOverHost', () => {
  it('calls hand_over_host with the game and target ids', async () => {
    const fake = new FakePostgrestClient();
    fake.onRpc('hand_over_host', (args) => {
      expect(args.p_game_id).toBe('g1');
      expect(args.p_new_host_id).toBe('u2');
      return { error: null };
    });
    await handOverHost('g1', 'u2', client(fake));
  });

  it('propagates a rejection (e.g. target is not a player or viewer)', async () => {
    const fake = new FakePostgrestClient();
    fake.onRpc('hand_over_host', () => ({ error: new Error('not available') }));
    await expect(handOverHost('g1', 'u2', client(fake))).rejects.toThrow('not available');
  });
});

describe('takeOverHost', () => {
  it('calls take_over_host with the game id', async () => {
    const fake = new FakePostgrestClient();
    fake.onRpc('take_over_host', (args) => {
      expect(args.p_game_id).toBe('g1');
      return { error: null };
    });
    await takeOverHost('g1', client(fake));
  });
});

describe('getHostLastSyncedAt', () => {
  it('returns the stamp when present', async () => {
    const fake = new FakePostgrestClient();
    fake.seed('games', [{ id: 'g1', host_last_synced_at: '2026-07-31T10:00:00Z' }]);
    expect(await getHostLastSyncedAt('g1', client(fake))).toBe('2026-07-31T10:00:00Z');
  });

  it('returns null when never stamped or the game is unknown', async () => {
    const fake = new FakePostgrestClient();
    fake.seed('games', [{ id: 'g1', host_last_synced_at: null }]);
    expect(await getHostLastSyncedAt('g1', client(fake))).toBeNull();
    expect(await getHostLastSyncedAt('missing', client(fake))).toBeNull();
  });
});
