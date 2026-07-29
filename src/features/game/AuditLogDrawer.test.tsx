import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AuditLogEntry } from '@core/auditLog';
import { AuditLogDrawer } from './AuditLogDrawer';

function entry(partial: Partial<AuditLogEntry> & Pick<AuditLogEntry, 'type' | 'id' | 'at'>): AuditLogEntry {
  return {
    playerId: 'p1',
    actorId: 'a1',
    payload: {},
    category: 'buy_ins',
    isUndone: false,
    isReversible: false,
    buysAfter: null,
    ...partial,
  };
}

const baseProps = {
  open: true,
  onClose: vi.fn(),
  playerNames: new Map([['p1', 'מור']]),
  currency: 'ILS',
  locale: 'he',
  onUndo: vi.fn(),
};

describe('<AuditLogDrawer>', () => {
  it('renders newest first', () => {
    const entries: AuditLogEntry[] = [
      entry({ id: 'e1', at: '2026-01-01T00:00:00.000Z', type: 'buy_in_added', playerId: 'p1' }),
      entry({ id: 'e2', at: '2026-01-01T00:05:00.000Z', type: 'game_started', playerId: null, category: 'management' }),
      entry({ id: 'e3', at: '2026-01-01T00:10:00.000Z', type: 'buy_in_added', playerId: 'p1' }),
    ];
    render(<AuditLogDrawer {...baseProps} entries={entries} />);

    // Player-attributed lines render "auditLog.line", the no-player one renders
    // "auditLog.lineNoPlayer" (t() falls back to the raw key under test — see
    // buyInText.test.ts's sibling comment); the alternating pattern still
    // proves newest-first DOM order: e3 (line), e2 (lineNoPlayer), e1 (line).
    const lines = screen.getAllByText(/^auditLog\.line/);
    expect(lines.map((el) => el.textContent)).toEqual(['auditLog.line', 'auditLog.lineNoPlayer', 'auditLog.line']);
  });

  it('hides undone entries by default and shows them only under the "undone" filter', () => {
    const entries: AuditLogEntry[] = [
      entry({ id: 'e1', at: '2026-01-01T00:00:00.000Z', type: 'buy_in_added', isUndone: false }),
      entry({ id: 'e2', at: '2026-01-01T00:05:00.000Z', type: 'buy_in_removed', isUndone: true }),
    ];
    render(<AuditLogDrawer {...baseProps} entries={entries} />);

    expect(screen.queryByText('ui.undone')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('auditLog.filter.undone'));
    expect(screen.getByText('ui.undone')).toBeInTheDocument();
  });

  it('a reversible entry offers undo behind a confirm step', () => {
    const onUndo = vi.fn();
    const target = entry({ id: 'e1', at: '2026-01-01T00:00:00.000Z', type: 'buy_in_added', isReversible: true });
    render(<AuditLogDrawer {...baseProps} entries={[target]} onUndo={onUndo} />);

    fireEvent.click(screen.getByText('ui.undo'));
    expect(onUndo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('ui.undo'));
    expect(onUndo).toHaveBeenCalledWith(target);
  });

  it('a non-reversible entry offers no undo control', () => {
    const target = entry({
      id: 'e1',
      at: '2026-01-01T00:00:00.000Z',
      type: 'cash_paid_set',
      isReversible: false,
      payload: { amountMinor: 1000 },
    });
    render(<AuditLogDrawer {...baseProps} entries={[target]} />);
    expect(screen.queryByText('ui.undo')).not.toBeInTheDocument();
  });

  it('filter tabs switch between categories', () => {
    const entries: AuditLogEntry[] = [
      entry({ id: 'e1', at: '2026-01-01T00:00:00.000Z', type: 'buy_in_added', category: 'buy_ins' }),
      entry({
        id: 'e2',
        at: '2026-01-01T00:05:00.000Z',
        type: 'player_settled',
        category: 'settlements',
        payload: { chipsFinal: 100, settledAt: '' },
      }),
    ];
    render(<AuditLogDrawer {...baseProps} entries={entries} />);
    expect(screen.getAllByText(/^auditLog\.line/)).toHaveLength(2);

    fireEvent.click(screen.getByText('auditLog.filter.buy_ins'));
    expect(screen.getAllByText(/^auditLog\.line/)).toHaveLength(1);
  });

  it('shows a placeholder when the filtered list is empty', () => {
    render(<AuditLogDrawer {...baseProps} entries={[]} />);
    expect(screen.getByText('auditLog.empty')).toBeInTheDocument();
  });

  it('exposes the filter bar as a tablist for accessibility', () => {
    render(<AuditLogDrawer {...baseProps} entries={[]} />);
    const tablist = screen.getByRole('tablist');
    expect(within(tablist).getAllByRole('tab')).toHaveLength(5);
  });
});
