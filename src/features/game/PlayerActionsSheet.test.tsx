import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PlayerActionsSheet } from './PlayerActionsSheet';

describe('<PlayerActionsSheet>', () => {
  it('renames via the inline field and closes', async () => {
    const onRename = vi.fn();
    const onClose = vi.fn();
    render(
      <PlayerActionsSheet
        open
        onClose={onClose}
        playerName="מור"
        hasBuyIns={false}
        onRename={onRename}
        onRemove={() => {}}
      />,
    );

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
    render(
      <PlayerActionsSheet
        open
        onClose={() => {}}
        playerName="מור"
        hasBuyIns={false}
        onRename={() => {}}
        onRemove={onRemove}
      />,
    );

    await userEvent.click(screen.getByText('players.remove'));
    expect(onRemove).toHaveBeenCalled();
  });

  it('requires confirmation before removing a player who has buy-ins', async () => {
    const onRemove = vi.fn();
    render(
      <PlayerActionsSheet
        open
        onClose={() => {}}
        playerName="מור"
        hasBuyIns
        onRename={() => {}}
        onRemove={onRemove}
      />,
    );

    await userEvent.click(screen.getByText('players.remove'));
    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getByText('players.removeConfirmTitle')).toBeDefined();

    await userEvent.click(screen.getByText('players.removeConfirmLabel'));
    expect(onRemove).toHaveBeenCalled();
  });
});
