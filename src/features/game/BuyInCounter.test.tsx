import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BuyInCounter } from './BuyInCounter';

describe('BuyInCounter', () => {
  it('shows the current count', () => {
    render(
      <BuyInCounter count={3} playerName="מור" onIncrement={vi.fn()} onDecrement={vi.fn()} />,
    );
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('disables the − button at zero (never goes below zero)', () => {
    render(
      <BuyInCounter count={0} playerName="מור" onIncrement={vi.fn()} onDecrement={vi.fn()} />,
    );
    const buttons = screen.getAllByRole('button');
    const minus = buttons.find((b) => b.textContent === '−');
    expect(minus).toBeDisabled();
  });

  it('both buttons are 48px tap targets regardless of the visual weight difference', () => {
    render(
      <BuyInCounter count={1} playerName="מור" onIncrement={vi.fn()} onDecrement={vi.fn()} />,
    );
    for (const button of screen.getAllByRole('button')) {
      expect(button.className).toContain('size-12');
    }
  });

  it('increment and decrement fire their own callbacks independently', () => {
    const onIncrement = vi.fn();
    const onDecrement = vi.fn();
    render(
      <BuyInCounter count={1} playerName="מור" onIncrement={onIncrement} onDecrement={onDecrement} />,
    );
    const buttons = screen.getAllByRole('button');
    const minus = buttons.find((b) => b.textContent === '−')!;
    const plus = buttons.find((b) => b.textContent === '+')!;

    fireEvent.click(plus);
    expect(onIncrement).toHaveBeenCalledTimes(1);
    expect(onDecrement).not.toHaveBeenCalled();

    fireEvent.click(minus);
    expect(onDecrement).toHaveBeenCalledTimes(1);
  });
});
