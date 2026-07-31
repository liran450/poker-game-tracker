import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { subscribeToGameEvents } from './realtime';
import { FakeRealtimeClient } from './testSupport/fakeRealtimeClient';

function client(fake: FakeRealtimeClient): SupabaseClient {
  return fake as unknown as SupabaseClient;
}

describe('subscribeToGameEvents', () => {
  it('is a no-op subscription when no client is configured', () => {
    const unsubscribe = subscribeToGameEvents('game-1', vi.fn(), null);
    expect(() => unsubscribe()).not.toThrow();
  });

  it('subscribes to INSERTs on game_events filtered to the given game', () => {
    const fake = new FakeRealtimeClient();
    subscribeToGameEvents('game-1', vi.fn(), client(fake));

    expect(fake.channels).toHaveLength(1);
    expect(fake.channels[0]!.name).toEqual('game_events:game-1');
    expect(fake.channels[0]!.subscribed).toBe(true);
  });

  it('calls the callback when a matching change is emitted', () => {
    const fake = new FakeRealtimeClient();
    const onChange = vi.fn();
    subscribeToGameEvents('game-1', onChange, client(fake));

    fake.channels[0]!.emit();

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('removes the channel on unsubscribe', () => {
    const fake = new FakeRealtimeClient();
    const unsubscribe = subscribeToGameEvents('game-1', vi.fn(), client(fake));

    unsubscribe();

    expect(fake.channels[0]!.removed).toBe(true);
  });
});
