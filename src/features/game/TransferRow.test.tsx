import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { minor } from '@core/money';
import { TransferRow } from './TransferRow';

describe('<TransferRow>', () => {
  it('read mode: names and amount are not tappable to edit', () => {
    render(
      <TransferRow mode="read" fromName="מור" toName="דנה" amountMinor={minor(4000)} currency="ILS" />,
    );
    expect(screen.getByText('מור').closest('button')).toBeDisabled();
    expect(screen.getByText('דנה').closest('button')).toBeDisabled();
    expect(screen.queryByLabelText('settlement.deleteTransfer')).toBeNull();
  });

  it('edit mode: tapping a name calls the matching onEdit callback', () => {
    const onEditFrom = vi.fn();
    const onEditTo = vi.fn();
    render(
      <TransferRow
        mode="edit"
        fromName="מור"
        toName="דנה"
        amountMinor={minor(4000)}
        currency="ILS"
        onEditFrom={onEditFrom}
        onEditTo={onEditTo}
      />,
    );
    fireEvent.click(screen.getByText('מור'));
    fireEvent.click(screen.getByText('דנה'));
    expect(onEditFrom).toHaveBeenCalledOnce();
    expect(onEditTo).toHaveBeenCalledOnce();
  });

  it('edit mode: tapping the amount reveals an inline field that commits on blur', () => {
    const onAmountChange = vi.fn();
    render(
      <TransferRow
        mode="edit"
        fromName="מור"
        toName="דנה"
        amountMinor={minor(4000)}
        currency="ILS"
        onAmountChange={onAmountChange}
      />,
    );
    fireEvent.click(screen.getByText(/40/));
    const field = screen.getByRole('textbox');
    fireEvent.change(field, { target: { value: '75' } });
    fireEvent.blur(field);
    expect(onAmountChange).toHaveBeenCalledWith(7500);
  });

  it('edit mode: the trash icon calls onDelete', () => {
    const onDelete = vi.fn();
    render(
      <TransferRow
        mode="edit"
        fromName="מור"
        toName="דנה"
        amountMinor={minor(4000)}
        currency="ILS"
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByLabelText('settlement.deleteTransfer'));
    expect(onDelete).toHaveBeenCalledOnce();
  });
});
