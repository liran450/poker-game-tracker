import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { minor } from '@core/money';
import { PlayerRow } from './PlayerRow';

describe('<PlayerRow>', () => {
  it('renders the name and the signed amount owed', () => {
    render(
      <PlayerRow name="מור" amountOwed={minor(15000)} currency="ILS" onOpenActions={() => {}} />,
    );
    expect(screen.getByText('מור')).toBeDefined();
  });

  it('grays out and dims when settled', () => {
    const { container } = render(
      <PlayerRow
        name="מור"
        amountOwed={minor(0)}
        currency="ILS"
        isSettled
        onOpenActions={() => {}}
      />,
    );
    expect(container.firstChild).toHaveClass('opacity-40');
  });

  it('shows a late-joiner marker only when flagged', () => {
    const { rerender } = render(
      <PlayerRow name="מור" amountOwed={minor(0)} currency="ILS" onOpenActions={() => {}} />,
    );
    expect(screen.queryByText('players.lateJoiner', { exact: false })).toBeNull();

    rerender(
      <PlayerRow
        name="מור"
        amountOwed={minor(0)}
        currency="ILS"
        isLateJoiner
        onOpenActions={() => {}}
      />,
    );
  });

  it('opens the row action sheet via the ⋯ button', () => {
    const onOpenActions = vi.fn();
    render(
      <PlayerRow name="מור" amountOwed={minor(0)} currency="ILS" onOpenActions={onOpenActions} />,
    );
    screen.getByRole('button').click();
    expect(onOpenActions).toHaveBeenCalled();
  });
});
