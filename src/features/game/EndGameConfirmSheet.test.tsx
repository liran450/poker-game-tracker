import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { minor } from '@core/money';
import { EndGameConfirmSheet } from './EndGameConfirmSheet';

const baseProps = {
  open: true,
  onClose: vi.fn(),
  playerCount: 4,
  totalPotMinor: minor(0),
  sharedCostsMinor: minor(0),
  currency: 'ILS',
  locale: 'he',
  unsettledPlayerNames: [] as string[],
  hasPendingSync: false,
  discrepancyMinor: minor(0),
  onConfirm: vi.fn(),
};

describe('<EndGameConfirmSheet>', () => {
  it('shows the slide-to-confirm when everyone is settled and the pot is balanced', () => {
    render(<EndGameConfirmSheet {...baseProps} />);
    expect(screen.getByRole('slider')).toBeDefined();
  });

  it('blocks the slide and lists names when players are still unsettled', () => {
    render(<EndGameConfirmSheet {...baseProps} unsettledPlayerNames={['מור', 'דנה']} />);
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('מור');
    expect(screen.getByRole('alert').textContent).toContain('דנה');
  });

  it('hides the slide behind an unacknowledged discrepancy, and reveals it once checked', () => {
    render(<EndGameConfirmSheet {...baseProps} discrepancyMinor={minor(2000)} />);
    expect(screen.queryByRole('slider')).toBeNull();

    fireEvent.click(screen.getByRole('checkbox'));

    expect(screen.getByRole('slider')).toBeDefined();
  });

  it('never shows a discrepancy prompt or checkbox when the pot is balanced', () => {
    render(<EndGameConfirmSheet {...baseProps} discrepancyMinor={minor(0)} />);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});
