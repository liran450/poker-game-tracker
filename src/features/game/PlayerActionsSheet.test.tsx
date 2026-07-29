import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PlayerActionsSheet } from './PlayerActionsSheet';

const baseProps = {
  open: true,
  onClose: vi.fn(),
  playerName: 'מור',
  hasBuyIns: false,
  isSettled: false,
  onRename: vi.fn(),
  onRemove: vi.fn(),
  onSettle: vi.fn(),
  onReopen: vi.fn(),
  onEditChips: vi.fn(),
  onOpenCashPaid: vi.fn(),
};

describe('<PlayerActionsSheet>', () => {
  it('renames via the inline field and closes', async () => {
    const onRename = vi.fn();
    const onClose = vi.fn();
    render(<PlayerActionsSheet {...baseProps} onClose={onClose} onRename={onRename} />);

    await userEvent.click(screen.getByText('players.rename'));
    const field = screen.getByLabelText('players.renameLabel');
    await userEvent.clear(field);
    await userEvent.type(field, 'הכריש');
    await userEvent.click(screen.getByText('ui.save'));

    expect(onRename).toHaveBeenCalledWith('הכריש');
    expect(onClose).toHaveBeenCalled();
  });

  it('removes immediately when the player has no buy-ins', async () => {
    const onRemove = vi.fn();
    render(<PlayerActionsSheet {...baseProps} onRemove={onRemove} />);

    await userEvent.click(screen.getByText('players.remove'));
    expect(onRemove).toHaveBeenCalled();
  });

  it('requires confirmation before removing a player who has buy-ins', async () => {
    const onRemove = vi.fn();
    render(<PlayerActionsSheet {...baseProps} hasBuyIns onRemove={onRemove} />);

    await userEvent.click(screen.getByText('players.remove'));
    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getByText('players.removeConfirmTitle')).toBeDefined();

    await userEvent.click(screen.getByText('players.removeConfirmLabel'));
    expect(onRemove).toHaveBeenCalled();
  });

  it('an active row offers settle, not reopen/edit-chips', async () => {
    const onSettle = vi.fn();
    const onClose = vi.fn();
    render(<PlayerActionsSheet {...baseProps} isSettled={false} onSettle={onSettle} onClose={onClose} />);

    expect(screen.queryByText('players.reopen')).not.toBeInTheDocument();
    expect(screen.queryByText('players.editChips')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('players.settle'));
    expect(onSettle).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('a settled row offers reopen and edit-chips, not settle', async () => {
    const onReopen = vi.fn();
    const onEditChips = vi.fn();
    render(
      <PlayerActionsSheet {...baseProps} isSettled onReopen={onReopen} onEditChips={onEditChips} />,
    );

    expect(screen.queryByText('players.settle')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('players.reopen'));
    expect(onReopen).toHaveBeenCalled();
  });

  it('cash paid is always offered and closes the sheet', async () => {
    const onOpenCashPaid = vi.fn();
    const onClose = vi.fn();
    render(<PlayerActionsSheet {...baseProps} onOpenCashPaid={onOpenCashPaid} onClose={onClose} />);

    await userEvent.click(screen.getByText('players.cashPaid'));
    expect(onOpenCashPaid).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
