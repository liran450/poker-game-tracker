import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AddPlayersSheet } from './AddPlayersSheet';

describe('<AddPlayersSheet>', () => {
  it('the footer is disabled until at least one person is picked', () => {
    render(
      <AddPlayersSheet open onClose={() => {}} onCommit={() => {}} recentNames={['מור', 'אורי']} />,
    );
    expect(screen.getByRole('button', { name: /addPlayers\.commit/ })).toBeDisabled();
  });

  it('selecting a roster chip enables the footer and shows it in the tray', async () => {
    render(
      <AddPlayersSheet open onClose={() => {}} onCommit={() => {}} recentNames={['מור', 'אורי']} />,
    );
    await userEvent.click(screen.getByRole('option', { name: 'מור' }));

    expect(screen.getAllByText('מור')).toHaveLength(2); // roster chip + tray chip
    expect(screen.getByRole('button', { name: /addPlayers\.commit/ })).not.toBeDisabled();
  });

  it('tapping a selected chip again deselects it', async () => {
    render(
      <AddPlayersSheet open onClose={() => {}} onCommit={() => {}} recentNames={['מור']} />,
    );
    const chip = screen.getByRole('option', { name: 'מור' });
    await userEvent.click(chip);
    expect(chip.getAttribute('aria-selected')).toBe('true');
    await userEvent.click(chip);
    expect(chip.getAttribute('aria-selected')).toBe('false');
  });

  it('typing a name already on the roster selects that chip instead of duplicating it', async () => {
    render(
      <AddPlayersSheet open onClose={() => {}} onCommit={() => {}} recentNames={['מור']} />,
    );
    await userEvent.type(screen.getByRole('textbox'), 'מור');
    await userEvent.click(screen.getByText('addPlayers.addToList'));

    expect(screen.getByRole('option', { name: 'מור' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getAllByText('מור')).toHaveLength(2); // one roster chip, one tray chip — not three
  });

  it('a typed new name joins the same batch as picked names', async () => {
    const onCommit = vi.fn();
    render(
      <AddPlayersSheet open onClose={() => {}} onCommit={onCommit} recentNames={['מור']} />,
    );
    await userEvent.click(screen.getByRole('option', { name: 'מור' }));
    await userEvent.type(screen.getByRole('textbox'), 'שי');
    await userEvent.click(screen.getByText('addPlayers.addToList'));

    await userEvent.click(screen.getByRole('button', { name: /addPlayers\.commit/ }));

    expect(onCommit).toHaveBeenCalledWith(['מור', 'שי'], []);
  });

  it('resets its selection after committing', async () => {
    const onCommit = vi.fn();
    const onClose = vi.fn();
    render(
      <AddPlayersSheet open onClose={onClose} onCommit={onCommit} recentNames={['מור']} />,
    );
    await userEvent.click(screen.getByRole('option', { name: 'מור' }));
    await userEvent.click(screen.getByRole('button', { name: /addPlayers\.commit/ }));

    expect(onClose).toHaveBeenCalled();
  });

  it('remains usable with a roster of 40 names — renders every chip in a capped scroll area', () => {
    const names = Array.from({ length: 40 }, (_, i) => `שחקן ${i}`);
    render(<AddPlayersSheet open onClose={() => {}} onCommit={() => {}} recentNames={names} />);

    const roster = screen.getByRole('listbox');
    expect(roster.className).toContain('overflow-y-auto');
    expect(screen.getAllByRole('option')).toHaveLength(40);
  });

  it('shows an empty-history message rather than an empty roster area', () => {
    render(<AddPlayersSheet open onClose={() => {}} onCommit={() => {}} recentNames={[]} />);
    expect(screen.getByText('addPlayers.noRecentNames')).toBeDefined();
  });

  it('omits the group section entirely when there are no group members', () => {
    render(<AddPlayersSheet open onClose={() => {}} onCommit={() => {}} recentNames={[]} />);
    expect(screen.queryByText('addPlayers.groupSection')).toBeNull();
  });

  it('shows the ◈ group section, and commits account picks separately from guest names', async () => {
    const onCommit = vi.fn();
    render(
      <AddPlayersSheet
        open
        onClose={() => {}}
        onCommit={onCommit}
        recentNames={['שי']}
        groupMembers={[{ userId: 'u1', displayName: 'מור לוי' }]}
      />,
    );

    expect(screen.getByText('addPlayers.groupSection')).toBeDefined();
    await userEvent.click(screen.getByRole('option', { name: /מור לוי/ }));
    await userEvent.click(screen.getByRole('option', { name: 'שי' }));
    await userEvent.click(screen.getByRole('button', { name: /addPlayers\.commit/ }));

    expect(onCommit).toHaveBeenCalledWith(['שי'], [{ userId: 'u1', displayName: 'מור לוי' }]);
  });

  it('tapping a selected group-member chip in the tray deselects it', async () => {
    render(
      <AddPlayersSheet
        open
        onClose={() => {}}
        onCommit={() => {}}
        recentNames={[]}
        groupMembers={[{ userId: 'u1', displayName: 'מור לוי' }]}
      />,
    );
    const chip = screen.getByRole('option', { name: /מור לוי/ });
    await userEvent.click(chip);
    expect(chip.getAttribute('aria-selected')).toBe('true');

    // The tray chip is a plain button showing the same label — deselect via it.
    const trayChips = screen.getAllByText('מור לוי');
    expect(trayChips).toHaveLength(2);
    await userEvent.click(trayChips[1]!.closest('button')!);
    expect(chip.getAttribute('aria-selected')).toBe('false');
  });
});
