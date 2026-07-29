import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { minor } from '@core/money';
import type { PotStatus } from '@core/pot';
import { PotBanner } from './PotBanner';

function status(overrides: Partial<PotStatus>): PotStatus {
  return {
    totalBuyInsMinor: minor(60000),
    totalChipsMinor: minor(60000),
    unaccountedMinor: minor(0),
    discrepancyMinor: minor(0),
    isBalanced: true,
    ...overrides,
  };
}

describe('<PotBanner>', () => {
  it('shows the balanced state as a status region, not a button', () => {
    render(
      <PotBanner status={status({})} currency="ILS" locale="he" onOpenResolution={vi.fn()} />,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the discrepancy as a tappable alert', () => {
    const onOpenResolution = vi.fn();
    render(
      <PotBanner
        status={status({ isBalanced: false, discrepancyMinor: minor(2000), totalChipsMinor: minor(58000) })}
        currency="ILS"
        locale="he"
        onOpenResolution={onOpenResolution}
      />,
    );
    const alert = screen.getByRole('alert');
    fireEvent.click(alert);
    expect(onOpenResolution).toHaveBeenCalled();
  });
});
