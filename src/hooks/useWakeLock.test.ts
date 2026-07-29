import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWakeLock } from './useWakeLock';

function mockWakeLock() {
  const release = vi.fn().mockResolvedValue(undefined);
  const request = vi.fn().mockResolvedValue({ release, released: false, type: 'screen' });
  Object.defineProperty(navigator, 'wakeLock', {
    value: { request },
    configurable: true,
  });
  return { request, release };
}

afterEach(() => {
  // @ts-expect-error -- test-only cleanup of a property defined only for the test
  delete navigator.wakeLock;
  vi.restoreAllMocks();
});

describe('useWakeLock', () => {
  it('requests a screen wake lock when enabled', async () => {
    const { request } = mockWakeLock();
    renderHook(() => useWakeLock(true));

    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
  });

  it('does not request a lock when disabled', () => {
    const { request } = mockWakeLock();
    renderHook(() => useWakeLock(false));

    expect(request).not.toHaveBeenCalled();
  });

  it('releases the lock on unmount', async () => {
    const { request, release } = mockWakeLock();
    const { unmount } = renderHook(() => useWakeLock(true));

    await waitFor(() => expect(request).toHaveBeenCalled());
    unmount();

    await waitFor(() => expect(release).toHaveBeenCalled());
  });

  it('does nothing where the Wake Lock API is unavailable', () => {
    expect('wakeLock' in navigator).toBe(false);
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
  });
});
