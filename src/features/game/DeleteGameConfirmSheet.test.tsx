import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
// Real i18next singleton, not a mock — asserting the actual he.json output (docs/build/NOTES.md).
import '@i18n/index';
import { DeleteGameConfirmSheet } from './DeleteGameConfirmSheet';

describe('<DeleteGameConfirmSheet>', () => {
  it('shows the exact spec-worded copy for a finished game (tier 1 kept)', () => {
    render(
      <DeleteGameConfirmSheet
        open
        onClose={vi.fn()}
        isFinished
        onExport={vi.fn()}
        onConfirmDelete={vi.fn()}
      />,
    );
    expect(screen.getByText('הנתונים המפורטים יימחקו. הסטטיסטיקה תישמר.')).toBeInTheDocument();
  });

  it('shows a different, "deletes everything" message for an unfinished game', () => {
    render(
      <DeleteGameConfirmSheet
        open
        onClose={vi.fn()}
        isFinished={false}
        onExport={vi.fn()}
        onConfirmDelete={vi.fn()}
      />,
    );
    expect(screen.queryByText('הנתונים המפורטים יימחקו. הסטטיסטיקה תישמר.')).not.toBeInTheDocument();
    expect(screen.getByText(/יימחקו לצמיתות/)).toBeInTheDocument();
  });

  it('calls onExport without closing, and onConfirmDelete followed by onClose', () => {
    const onExport = vi.fn();
    const onConfirmDelete = vi.fn();
    const onClose = vi.fn();
    render(
      <DeleteGameConfirmSheet
        open
        onClose={onClose}
        isFinished
        onExport={onExport}
        onConfirmDelete={onConfirmDelete}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'ייצוא לפני המחיקה' }));
    expect(onExport).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'מחק משחק' }));
    expect(onConfirmDelete).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
