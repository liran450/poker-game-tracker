import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({ isCloudConfigured: vi.fn() }));
vi.mock('@data/auth', () => authMocks);

const realtimeMocks = vi.hoisted(() => ({
  subscribeToGameEvents: vi.fn<(gameId: string, onChange: () => void) => () => void>(() => vi.fn()),
}));
vi.mock('@data/realtime', () => realtimeMocks);

const transportMocks = vi.hoisted(() => ({
  SupabaseSyncTransport: vi.fn(function FakeSupabaseSyncTransport() {}),
}));
vi.mock('@data/supabaseSyncTransport', () => transportMocks);

const syncEngineMocks = vi.hoisted(() => ({
  syncPull: vi.fn(() => Promise.resolve({ pulled: 0 })),
  startPolling: vi.fn(() => vi.fn()),
}));
vi.mock('@core/offline/syncEngine', () => syncEngineMocks);

const { useLiveGameSync } = await import('./useLiveGameSync');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useLiveGameSync', () => {
  it('does nothing when cloud sync is not configured', () => {
    authMocks.isCloudConfigured.mockReturnValue(false);

    renderHook(() => useLiveGameSync('game-1'));

    expect(syncEngineMocks.syncPull).not.toHaveBeenCalled();
    expect(realtimeMocks.subscribeToGameEvents).not.toHaveBeenCalled();
    expect(syncEngineMocks.startPolling).not.toHaveBeenCalled();
  });

  it('does nothing when there is no gameId yet', () => {
    authMocks.isCloudConfigured.mockReturnValue(true);

    renderHook(() => useLiveGameSync(undefined));

    expect(syncEngineMocks.syncPull).not.toHaveBeenCalled();
  });

  it('pulls once, subscribes to realtime, and starts polling when configured', () => {
    authMocks.isCloudConfigured.mockReturnValue(true);

    renderHook(() => useLiveGameSync('game-1'));

    expect(syncEngineMocks.syncPull).toHaveBeenCalledTimes(1);
    expect(realtimeMocks.subscribeToGameEvents).toHaveBeenCalledTimes(1);
    expect(realtimeMocks.subscribeToGameEvents.mock.calls[0]![0]).toEqual('game-1');
    expect(syncEngineMocks.startPolling).toHaveBeenCalledTimes(1);
  });

  it('pulls again when the realtime callback fires', () => {
    authMocks.isCloudConfigured.mockReturnValue(true);
    let realtimeCallback: () => void = () => {};
    realtimeMocks.subscribeToGameEvents.mockImplementation((_gameId: string, cb: () => void) => {
      realtimeCallback = cb;
      return vi.fn();
    });

    renderHook(() => useLiveGameSync('game-1'));
    expect(syncEngineMocks.syncPull).toHaveBeenCalledTimes(1);

    realtimeCallback();

    expect(syncEngineMocks.syncPull).toHaveBeenCalledTimes(2);
  });

  it('unsubscribes and stops polling on unmount', () => {
    authMocks.isCloudConfigured.mockReturnValue(true);
    const unsubscribeRealtime = vi.fn();
    const stopPolling = vi.fn();
    realtimeMocks.subscribeToGameEvents.mockReturnValue(unsubscribeRealtime);
    syncEngineMocks.startPolling.mockReturnValue(stopPolling);

    const { unmount } = renderHook(() => useLiveGameSync('game-1'));
    unmount();

    expect(unsubscribeRealtime).toHaveBeenCalledTimes(1);
    expect(stopPolling).toHaveBeenCalledTimes(1);
  });
});
