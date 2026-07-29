import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { minor } from '@core/money';
import { PlayerRow } from './PlayerRow';

const baseProps = {
  name: 'מור',
  buysCount: 2,
  cashPaidMinor: minor(0),
  buyAmountMinor: minor(5000),
  chipsPerBuy: 100,
  currency: 'ILS',
  onIncrement: vi.fn(),
  onDecrement: vi.fn(),
  onOpenCashPaid: vi.fn(),
  onOpenActions: vi.fn(),
};

describe('<PlayerRow>', () => {
  it('renders the name and the buy-in count', () => {
    render(<PlayerRow {...baseProps} />);
    expect(screen.getByText('מור')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('grays out, dims the counter and shows the locked net result when settled', () => {
    const { container } = render(
      <PlayerRow {...baseProps} isSettled chipsFinal={120} />,
    );
    expect(container.firstChild).toHaveClass('opacity-40');
    expect(screen.getByText('🔒')).toBeInTheDocument();
    for (const button of screen.getAllByRole('button')) {
      if (button.textContent === '+' || button.textContent === '−') {
        expect(button).toBeDisabled();
      }
    }
  });

  it('shows a late-joiner caption with the join time only when flagged', () => {
    const { rerender } = render(<PlayerRow {...baseProps} />);
    expect(screen.queryByText('players.lateJoiner', { exact: false })).toBeNull();

    rerender(<PlayerRow {...baseProps} lateJoinedAt="23:40" />);
    expect(screen.getByText('players.lateJoiner')).toBeInTheDocument();
  });

  it('opens the row action sheet via the ⋯ button', () => {
    const onOpenActions = vi.fn();
    render(<PlayerRow {...baseProps} onOpenActions={onOpenActions} />);
    fireEvent.click(screen.getByLabelText('players.rowActions'));
    expect(onOpenActions).toHaveBeenCalled();
  });

  it('the cash-paid control shows a faint prompt at zero and opens the sheet on tap', () => {
    const onOpenCashPaid = vi.fn();
    render(<PlayerRow {...baseProps} cashPaidMinor={minor(0)} onOpenCashPaid={onOpenCashPaid} />);
    const cashButton = screen.getByText('cashPaid.addShort').closest('button')!;
    expect(cashButton).toHaveClass('text-fg-disabled');
    fireEvent.click(cashButton);
    expect(onOpenCashPaid).toHaveBeenCalled();
  });

  it('the cash-paid control shows the amount once paid', () => {
    render(<PlayerRow {...baseProps} cashPaidMinor={minor(5000)} />);
    expect(screen.queryByText('cashPaid.addShort')).not.toBeInTheDocument();
  });

  it('increment and decrement call through to the counter callbacks', () => {
    const onIncrement = vi.fn();
    const onDecrement = vi.fn();
    render(<PlayerRow {...baseProps} onIncrement={onIncrement} onDecrement={onDecrement} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons.find((b) => b.textContent === '+')!);
    expect(onIncrement).toHaveBeenCalled();
    fireEvent.click(buttons.find((b) => b.textContent === '−')!);
    expect(onDecrement).toHaveBeenCalled();
  });
});
