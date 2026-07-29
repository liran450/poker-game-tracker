import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useElapsedTime } from './useElapsedTime';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useElapsedTime', () => {
  it('reads 00:00 when there is no start time', () => {
    const { result } = renderHook(() => useElapsedTime(null));
    expect(result.current).toBe('00:00');
  });

  it('reads 00:00 right at the start', () => {
    const { result } = renderHook(() => useElapsedTime('2026-01-01T00:00:00.000Z'));
    expect(result.current).toBe('00:00');
  });

  it('formats as H:MM once minutes pass', () => {
    const { result } = renderHook(() => useElapsedTime('2026-01-01T00:00:00.000Z'));
    act(() => {
      vi.advanceTimersByTime(2 * 60 * 60_000 + 14 * 60_000);
    });
    expect(result.current).toBe('02:14');
  });

  it('never goes negative if the clock is skewed', () => {
    const { result } = renderHook(() => useElapsedTime('2026-01-01T00:05:00.000Z'));
    expect(result.current).toBe('00:00');
  });
});
