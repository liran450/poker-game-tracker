import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { minor } from '@core/money';
import { BuyInBatchBar } from './BuyInBatchBar';

const baseProps = {
  playerNames: new Map([
    ['mor', 'מור'],
    ['uri', 'אורי'],
  ]),
  buyAmountMinor: minor(5000),
  chipsPerBuy: 100,
  currency: 'ILS',
  locale: 'he',
  onUndoAll: vi.fn(),
  onConfirm: vi.fn(),
};

describe('<BuyInBatchBar>', () => {
  it('renders one line per entry', () => {
    render(
      <BuyInBatchBar
        {...baseProps}
        entries={[
          { playerId: 'mor', deltaBuys: 2, events: [] },
          { playerId: 'uri', deltaBuys: 1, events: [] },
        ]}
      />,
    );
    expect(screen.getAllByText('buyIn.snackbarLine')).toHaveLength(2);
  });

  it('renders exactly one total row', () => {
    render(
      <BuyInBatchBar
        {...baseProps}
        entries={[
          { playerId: 'mor', deltaBuys: 2, events: [] },
          { playerId: 'uri', deltaBuys: 1, events: [] },
        ]}
      />,
    );
    expect(screen.getByText('buyIn.batchTotal')).toBeInTheDocument();
  });

  it('undo-all and confirm call through', () => {
    const onUndoAll = vi.fn();
    const onConfirm = vi.fn();
    render(
      <BuyInBatchBar
        {...baseProps}
        entries={[{ playerId: 'mor', deltaBuys: 1, events: [] }]}
        onUndoAll={onUndoAll}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByText('ui.undoAll'));
    expect(onUndoAll).toHaveBeenCalled();
    fireEvent.click(screen.getByText('ui.confirm'));
    expect(onConfirm).toHaveBeenCalled();
  });
});
