import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const groupsMocks = vi.hoisted(() => ({
  findUserByUsername: vi.fn(),
  inviteToGroup: vi.fn(),
  listPendingInvitesForGroup: vi.fn(),
  revokeGroupInvite: vi.fn(),
}));
vi.mock('@data/groups', () => groupsMocks);

const profilesMocks = vi.hoisted(() => ({ getProfilesPublic: vi.fn() }));
vi.mock('@data/profiles', () => profilesMocks);

const { InviteMemberSheet } = await import('./InviteMemberSheet');

beforeEach(() => {
  vi.clearAllMocks();
  groupsMocks.listPendingInvitesForGroup.mockResolvedValue([]);
  profilesMocks.getProfilesPublic.mockResolvedValue([]);
});

describe('<InviteMemberSheet>', () => {
  it('shows a not-found message for an unknown username', async () => {
    groupsMocks.findUserByUsername.mockResolvedValue(null);
    render(
      <InviteMemberSheet open onClose={() => {}} groupId="g1" invitedBy="u1" memberUserIds={[]} />,
    );

    await userEvent.type(screen.getByRole('textbox'), 'nobody');
    await userEvent.click(screen.getByText('groups.invite.search'));

    await waitFor(() => expect(screen.getByText('groups.invite.notFound')).toBeDefined());
  });

  it('finds a user and sends an invite', async () => {
    groupsMocks.findUserByUsername.mockResolvedValue({
      id: 'u2',
      username: 'mor_l',
      displayName: 'מור לוי',
      avatarUrl: null,
    });
    render(
      <InviteMemberSheet open onClose={() => {}} groupId="g1" invitedBy="u1" memberUserIds={[]} />,
    );

    await userEvent.type(screen.getByRole('textbox'), 'mor_l');
    await userEvent.click(screen.getByText('groups.invite.search'));
    await waitFor(() => expect(screen.getByText('מור לוי')).toBeDefined());

    await userEvent.click(screen.getByText('groups.invite.sendInvite'));
    await waitFor(() => expect(groupsMocks.inviteToGroup).toHaveBeenCalledWith('g1', 'u2', 'u1'));
  });

  it('shows "already a member" instead of an invite button for an existing member', async () => {
    groupsMocks.findUserByUsername.mockResolvedValue({
      id: 'u2',
      username: 'mor_l',
      displayName: 'מור לוי',
      avatarUrl: null,
    });
    render(
      <InviteMemberSheet open onClose={() => {}} groupId="g1" invitedBy="u1" memberUserIds={['u2']} />,
    );

    await userEvent.type(screen.getByRole('textbox'), 'mor_l');
    await userEvent.click(screen.getByText('groups.invite.search'));

    await waitFor(() => expect(screen.getByText('groups.invite.alreadyMember')).toBeDefined());
    expect(screen.queryByText('groups.invite.sendInvite')).toBeNull();
  });

  it('lists pending invites with a revoke button', async () => {
    groupsMocks.listPendingInvitesForGroup.mockResolvedValue([
      {
        id: 'i1',
        groupId: 'g1',
        invitedUserId: 'u3',
        invitedBy: 'u1',
        status: 'pending',
        createdAt: '2026-08-01T00:00:00Z',
        decidedAt: null,
      },
    ]);
    profilesMocks.getProfilesPublic.mockResolvedValue([
      { id: 'u3', username: 'dana_k', displayName: 'דנה' },
    ]);

    render(
      <InviteMemberSheet open onClose={() => {}} groupId="g1" invitedBy="u1" memberUserIds={[]} />,
    );

    await waitFor(() => expect(screen.getByText('groups.invite.pendingLine')).toBeDefined());
    await userEvent.click(screen.getByText('groups.invite.cancel'));
    await waitFor(() => expect(groupsMocks.revokeGroupInvite).toHaveBeenCalledWith('i1'));
  });
});
