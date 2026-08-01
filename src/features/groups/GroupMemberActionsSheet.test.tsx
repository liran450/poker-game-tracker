import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GroupMemberActionsSheet } from './GroupMemberActionsSheet';

describe('<GroupMemberActionsSheet>', () => {
  it('owner sees promote and remove for a plain member', () => {
    render(
      <GroupMemberActionsSheet
        open
        onClose={() => {}}
        memberName="דנה"
        memberRole="member"
        myRole="owner"
        onPromote={() => {}}
        onDemote={() => {}}
        onRemove={() => {}}
        onTransferOwnership={() => {}}
      />,
    );
    expect(screen.getByText('groups.promote')).toBeDefined();
    expect(screen.queryByText('groups.demote')).toBeNull();
    expect(screen.getByText('groups.removeMember')).toBeDefined();
    expect(screen.getByText('groups.transferOwnership')).toBeDefined();
  });

  it('a non-owner never sees transfer ownership', () => {
    render(
      <GroupMemberActionsSheet
        open
        onClose={() => {}}
        memberName="דנה"
        memberRole="member"
        myRole="admin"
        onPromote={() => {}}
        onDemote={() => {}}
        onRemove={() => {}}
        onTransferOwnership={() => {}}
      />,
    );
    expect(screen.queryByText('groups.transferOwnership')).toBeNull();
  });

  it('owner sees demote for an admin; an admin caller does not', () => {
    const { rerender } = render(
      <GroupMemberActionsSheet
        open
        onClose={() => {}}
        memberName="דנה"
        memberRole="admin"
        myRole="owner"
        onPromote={() => {}}
        onDemote={() => {}}
        onRemove={() => {}}
        onTransferOwnership={() => {}}
      />,
    );
    expect(screen.getByText('groups.demote')).toBeDefined();

    rerender(
      <GroupMemberActionsSheet
        open
        onClose={() => {}}
        memberName="דנה"
        memberRole="admin"
        myRole="admin"
        onPromote={() => {}}
        onDemote={() => {}}
        onRemove={() => {}}
        onTransferOwnership={() => {}}
      />,
    );
    expect(screen.queryByText('groups.demote')).toBeNull();
    // An admin can still remove another admin, just not demote them.
    expect(screen.getByText('groups.removeMember')).toBeDefined();
  });

  it('a plain member sees no actions at all', () => {
    render(
      <GroupMemberActionsSheet
        open
        onClose={() => {}}
        memberName="דנה"
        memberRole="member"
        myRole="member"
        onPromote={() => {}}
        onDemote={() => {}}
        onRemove={() => {}}
        onTransferOwnership={() => {}}
      />,
    );
    expect(screen.queryByText('groups.promote')).toBeNull();
    expect(screen.queryByText('groups.removeMember')).toBeNull();
  });

  it('calls the handler and closes on tap', async () => {
    const onPromote = vi.fn();
    const onClose = vi.fn();
    render(
      <GroupMemberActionsSheet
        open
        onClose={onClose}
        memberName="דנה"
        memberRole="member"
        myRole="owner"
        onPromote={onPromote}
        onDemote={() => {}}
        onRemove={() => {}}
        onTransferOwnership={() => {}}
      />,
    );
    await userEvent.click(screen.getByText('groups.promote'));
    expect(onPromote).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
