import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { minor } from '@core/money';
import { PotResolutionSheet } from './PotResolutionSheet';

describe('<PotResolutionSheet>', () => {
  it('lists settled players most-recently-settled first', () => {
    render(
      <PotResolutionSheet
        open
        onClose={vi.fn()}
        discrepancyMinor={minor(2000)}
        currency="ILS"
        settledPlayers={[
          { id: 'a', name: 'מור', chipsFinal: 100, settledAt: '2026-01-01T00:00:00.000Z' },
          { id: 'b', name: 'אורי', chipsFinal: 200, settledAt: '2026-01-01T00:05:00.000Z' },
        ]}
        onSelectPlayer={vi.fn()}
        onAssignToHouse={vi.fn()}
      />,
    );
    const uri = screen.getByRole('button', { name: /אורי/ });
    const mor = screen.getByRole('button', { name: /מור/ });
    // אורי settled later, so their row must come first (most-recent-first).
    expect(uri.compareDocumentPosition(mor) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('selecting a settled player calls through with their id', () => {
    const onSelectPlayer = vi.fn();
    render(
      <PotResolutionSheet
        open
        onClose={vi.fn()}
        discrepancyMinor={minor(2000)}
        currency="ILS"
        settledPlayers={[{ id: 'a', name: 'מור', chipsFinal: 100, settledAt: '2026-01-01T00:00:00.000Z' }]}
        onSelectPlayer={onSelectPlayer}
        onAssignToHouse={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('מור'));
    expect(onSelectPlayer).toHaveBeenCalledWith('a');
  });

  it('shows a placeholder when no player has settled yet', () => {
    render(
      <PotResolutionSheet
        open
        onClose={vi.fn()}
        discrepancyMinor={minor(2000)}
        currency="ILS"
        settledPlayers={[]}
        onSelectPlayer={vi.fn()}
        onAssignToHouse={vi.fn()}
      />,
    );
    expect(screen.getByText('pot.noSettledPlayers')).toBeInTheDocument();
  });

  it('assign to house calls through', () => {
    const onAssignToHouse = vi.fn();
    render(
      <PotResolutionSheet
        open
        onClose={vi.fn()}
        discrepancyMinor={minor(2000)}
        currency="ILS"
        settledPlayers={[]}
        onSelectPlayer={vi.fn()}
        onAssignToHouse={onAssignToHouse}
      />,
    );
    fireEvent.click(screen.getByText('pot.assignToHouse'));
    expect(onAssignToHouse).toHaveBeenCalled();
  });
});
