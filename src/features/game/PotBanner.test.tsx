import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
// Real Hebrew bundle, not the raw-key fallback other tests in this file rely
// on — needed for the chip-count regression test below, which asserts on the
// actual composed wording (docs/build/NOTES.md's rule: test wording-sensitive
// output against the real i18next singleton).
import '@i18n/index';
import { minor } from '@core/money';
import type { PotStatus } from '@core/pot';
import { PotBanner } from './PotBanner';

function status(overrides: Partial<PotStatus>): PotStatus {
  return {
    totalBuyInsMinor: minor(60000),
    totalChipsMinor: minor(60000),
    totalChipsCount: 1200,
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

  it('shows the real chip count, not its money-equivalent, when a chip is worth less than a shekel', () => {
    // Regression: buy ₪50 for 100 chips (chip value ₪0.5). Before this fix the
    // banner read "קניות 50₪ = ₪50" — the same figure twice, because the
    // right-hand side was the chips' *money value* (always equal to the
    // buy-in total before anyone settles), not their actual count.
    render(
      <PotBanner
        status={status({
          totalBuyInsMinor: minor(5000),
          totalChipsMinor: minor(5000),
          totalChipsCount: 100,
        })}
        currency="ILS"
        locale="he"
        onOpenResolution={vi.fn()}
      />,
    );
    const text = screen.getByRole('status').textContent;
    expect(text).toContain('100');
    expect(text).toContain('ז\'יטונים');
  });
});
