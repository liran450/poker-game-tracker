import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
// Real i18next singleton, not a mock — asserting the actual he.json output (docs/build/NOTES.md).
import '@i18n/index';
import { minor } from '@core/money';
import { SummaryScreen, type SummaryScreenProps } from './SummaryScreen';

function baseProps(overrides: Partial<SummaryScreenProps> = {}): SummaryScreenProps {
  return {
    gameName: 'פוקר חמישי',
    date: '01.08.2026',
    playerCount: 2,
    currency: 'ILS',
    results: [
      { id: 'p1', name: 'מור', netMinor: minor(-2500), sharedMinor: minor(0) },
      { id: 'p2', name: 'רני', netMinor: minor(2500), sharedMinor: minor(0) },
    ],
    transfers: [{ fromId: 'p1', fromName: 'מור', toName: 'רני', amountMinor: minor(2500) }],
    canReopen: true,
    reopenHoursRemaining: 12,
    onShare: vi.fn(),
    onCopyTransfers: vi.fn(),
    onReopen: vi.fn(),
    onBack: vi.fn(),
    onExport: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
}

describe('<SummaryScreen>', () => {
  it('opens the menu and calls onExport for the export item, without opening the delete sheet', () => {
    const onExport = vi.fn();
    render(<SummaryScreen {...baseProps({ onExport })} />);

    fireEvent.click(screen.getByRole('button', { name: 'אפשרויות משחק' }));
    fireEvent.click(screen.getByRole('button', { name: 'ייצוא משחק' }));

    expect(onExport).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('הנתונים המפורטים יימחקו. הסטטיסטיקה תישמר.')).not.toBeInTheDocument();
  });

  it('opens the menu, taps מחק משחק, and confirming calls onDelete', () => {
    const onDelete = vi.fn();
    render(<SummaryScreen {...baseProps({ onDelete })} />);

    fireEvent.click(screen.getByRole('button', { name: 'אפשרויות משחק' }));
    fireEvent.click(screen.getByRole('button', { name: 'מחק משחק' }));

    expect(screen.getByText('הנתונים המפורטים יימחקו. הסטטיסטיקה תישמר.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'מחק משחק' }));

    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('the reopen row carries an ⓘ explaining the 24h window and the recompute consequence', () => {
    render(<SummaryScreen {...baseProps()} />);

    fireEvent.click(screen.getByRole('button', { name: 'אפשרויות משחק' }));
    fireEvent.click(screen.getByRole('button', { name: 'הסבר' }));

    expect(
      screen.getByText('אפשר לפתוח מחדש עד 24 שעות מסיום המשחק. חישוב מחדש של הסגירה מבטל כל עריכה ידנית של ההעברות.'),
    ).toBeInTheDocument();
  });
});
