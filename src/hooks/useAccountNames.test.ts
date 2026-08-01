import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const profilesMocks = vi.hoisted(() => ({ getProfilesPublic: vi.fn() }));
vi.mock('@data/profiles', () => profilesMocks);

const { useAccountNames } = await import('./useAccountNames');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useAccountNames', () => {
  it('resolves and returns display names for the given ids', async () => {
    profilesMocks.getProfilesPublic.mockResolvedValue([
      { id: 'u1', username: 'mor_l', displayName: 'מור לוי' },
    ]);

    const { result } = renderHook(() => useAccountNames(['u1'], true));
    expect(result.current.size).toBe(0);

    await waitFor(() => expect(result.current.get('u1')).toBe('מור לוי'));
    expect(profilesMocks.getProfilesPublic).toHaveBeenCalledWith(['u1']);
  });

  it('does not fetch when disabled', async () => {
    const { result } = renderHook(() => useAccountNames(['u1'], false));
    await act(async () => {
      await Promise.resolve();
    });
    expect(profilesMocks.getProfilesPublic).not.toHaveBeenCalled();
    expect(result.current.size).toBe(0);
  });

  it('does not fetch when there are no ids to resolve', async () => {
    const { result } = renderHook(() => useAccountNames([], true));
    await act(async () => {
      await Promise.resolve();
    });
    expect(profilesMocks.getProfilesPublic).not.toHaveBeenCalled();
    expect(result.current.size).toBe(0);
  });
});
