import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { minor } from '@core/money';
import { SettleSheet } from './SettleSheet';

// react-i18next has no initialised instance under Vitest (see PlayerActionsSheet.test.tsx),
// so `t()` returns the raw key rather than an interpolated Hebrew sentence — assertions
// below target keys and behaviour, matching the rest of the codebase's component tests.

const baseProps = {
  open: true,
  onClose: vi.fn(),
  playerName: 'מור',
  mode: 'settle' as const,
  initialChips: 0,
  buysCount: 2,
  buyAmountMinor: minor(5000),
  chipsPerBuy: 100,
  currency: 'ILS',
  locale: 'he',
  chipsRemainingInPlay: 300,
  onSave: vi.fn(),
};

describe('SettleSheet', () => {
  it('renders the live conversion caption', () => {
    render(<SettleSheet {...baseProps} initialChips={120} />);
    expect(screen.getByText('settle.conversion')).toBeInTheDocument();
  });

  it('warns inline when the entered chips exceed what is left in play, without blocking save', () => {
    const onSave = vi.fn();
    render(<SettleSheet {...baseProps} initialChips={120} chipsRemainingInPlay={100} onSave={onSave} />);
    expect(screen.getByRole('alert')).toHaveTextContent('settle.exceedsRemaining');

    fireEvent.click(screen.getByText('settle.confirm'));
    expect(onSave).toHaveBeenCalledWith(120);
  });

  it('does not warn when within the remaining chips', () => {
    render(<SettleSheet {...baseProps} initialChips={120} chipsRemainingInPlay={200} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('a quick chip sets the input and re-selects it', () => {
    render(<SettleSheet {...baseProps} initialChips={0} />);
    fireEvent.click(screen.getByRole('option', { name: '100' }));
    expect(screen.getByRole('textbox')).toHaveValue('100');
  });

  it('rounds and floors the entered chip count before saving', () => {
    const onSave = vi.fn();
    render(<SettleSheet {...baseProps} initialChips={0} onSave={onSave} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '-5' } });
    fireEvent.click(screen.getByText('settle.confirm'));
    expect(onSave).toHaveBeenCalledWith(0);
  });

  it('edit mode uses the generic save label, settle mode uses the settle-specific one', () => {
    const { rerender } = render(<SettleSheet {...baseProps} mode="settle" />);
    expect(screen.getByText('settle.confirm')).toBeInTheDocument();
    expect(screen.queryByText('ui.save')).not.toBeInTheDocument();

    rerender(<SettleSheet {...baseProps} mode="edit" />);
    expect(screen.getByText('ui.save')).toBeInTheDocument();
    expect(screen.queryByText('settle.confirm')).not.toBeInTheDocument();
  });
});
