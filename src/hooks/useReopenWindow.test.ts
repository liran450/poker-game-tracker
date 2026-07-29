import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReopenWindow } from './useReopenWindow';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useReopenWindow', () => {
  it('cannot reopen a game that has not ended', () => {
    const { result } = renderHook(() => useReopenWindow(null));
    expect(result.current).toEqual({ canReopen: false, hoursRemaining: null });
  });

  it('can reopen right after ending, with ~24 hours remaining', () => {
    const { result } = renderHook(() => useReopenWindow('2026-01-01T00:00:00.000Z'));
    expect(result.current.canReopen).toBe(true);
    expect(result.current.hoursRemaining).toBe(24);
  });

  it('the countdown ticks down as time passes', () => {
    const { result } = renderHook(() => useReopenWindow('2026-01-01T00:00:00.000Z'));
    act(() => {
      vi.advanceTimersByTime(20 * 60 * 60_000); // 20h later
    });
    expect(result.current.canReopen).toBe(true);
    expect(result.current.hoursRemaining).toBe(4);
  });

  it('closes the window exactly at 24h', () => {
    const { result } = renderHook(() => useReopenWindow('2026-01-01T00:00:00.000Z'));
    act(() => {
      vi.advanceTimersByTime(24 * 60 * 60_000 + 60_000);
    });
    expect(result.current).toEqual({ canReopen: false, hoursRemaining: null });
  });
});
