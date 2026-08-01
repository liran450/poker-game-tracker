import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const groupsMocks = vi.hoisted(() => ({ listGroupMembers: vi.fn() }));
vi.mock('@data/groups', () => groupsMocks);

const profilesMocks = vi.hoisted(() => ({ getProfilesPublic: vi.fn() }));
vi.mock('@data/profiles', () => profilesMocks);

const { useGroupMemberOptions } = await import('./useGroupMemberOptions');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useGroupMemberOptions', () => {
  it('resolves members to display names', async () => {
    groupsMocks.listGroupMembers.mockResolvedValue([
      { groupId: 'g1', userId: 'u1', role: 'member', joinedAt: '2026-08-01T00:00:00Z' },
    ]);
    profilesMocks.getProfilesPublic.mockResolvedValue([
      { id: 'u1', username: 'mor_l', displayName: 'מור לוי' },
    ]);

    const { result } = renderHook(() => useGroupMemberOptions('g1', true));
    await waitFor(() => expect(result.current).toEqual([{ userId: 'u1', displayName: 'מור לוי' }]));
  });

  it('is empty without a group, without calling anything', async () => {
    const { result } = renderHook(() => useGroupMemberOptions(null, true));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toEqual([]);
    expect(groupsMocks.listGroupMembers).not.toHaveBeenCalled();
  });

  it('is empty while disabled', async () => {
    const { result } = renderHook(() => useGroupMemberOptions('g1', false));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toEqual([]);
    expect(groupsMocks.listGroupMembers).not.toHaveBeenCalled();
  });
});
