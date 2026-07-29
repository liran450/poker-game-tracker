import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { minor } from '@core/money';
import type { SharedCostState } from '@core/events';
import { SharedCostsSheet } from './SharedCostsSheet';

const players = [
  { id: 'mor', name: 'מור' },
  { id: 'uri', name: 'אורי' },
];

describe('<SharedCostsSheet>', () => {
  it('shows the empty state with no costs', () => {
    render(
      <SharedCostsSheet
        open
        onClose={vi.fn()}
        costs={[]}
        players={players}
        currency="ILS"
        locale="he"
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByText('sharedCosts.empty')).toBeInTheDocument();
  });

  it('lists existing costs with their payer', () => {
    const costs: SharedCostState[] = [
      {
        id: 'c1',
        label: 'פיצה',
        amountMinor: minor(12000),
        paidByPlayerId: 'mor',
        splitMode: 'equal',
        shares: new Map([
          ['mor', minor(6000)],
          ['uri', minor(6000)],
        ]),
      },
    ];
    render(
      <SharedCostsSheet
        open
        onClose={vi.fn()}
        costs={costs}
        players={players}
        currency="ILS"
        locale="he"
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByText('פיצה')).toBeInTheDocument();
  });

  it('adds a new cost with an equal split defaulting to everyone', () => {
    const onAdd = vi.fn();
    render(
      <SharedCostsSheet
        open
        onClose={vi.fn()}
        costs={[]}
        players={players}
        currency="ILS"
        locale="he"
        onAdd={onAdd}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('sharedCosts.add'));
    fireEvent.change(screen.getByLabelText('sharedCosts.labelField'), { target: { value: 'פיצה' } });
    fireEvent.change(screen.getByLabelText('money.buyAmount'), { target: { value: '120' } });
    fireEvent.click(screen.getByText('ui.save'));

    expect(onAdd).toHaveBeenCalledWith({
      label: 'פיצה',
      amountMinor: 12000,
      paidByPlayerId: null,
      splitMode: 'equal',
      shares: { mor: 6000, uri: 6000 },
    });
  });

  it('blocks saving a custom split until the remainder reaches zero', () => {
    const onAdd = vi.fn();
    render(
      <SharedCostsSheet
        open
        onClose={vi.fn()}
        costs={[]}
        players={players}
        currency="ILS"
        locale="he"
        onAdd={onAdd}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('sharedCosts.add'));
    fireEvent.change(screen.getByLabelText('sharedCosts.labelField'), { target: { value: 'פיצה' } });
    fireEvent.change(screen.getByLabelText('money.buyAmount'), { target: { value: '120' } });
    fireEvent.click(screen.getByText('sharedCosts.customSplit'));

    const shareFields = screen.getAllByLabelText('sharedCosts.shareField');
    fireEvent.change(shareFields[0]!, { target: { value: '50' } });
    expect(screen.getByText('ui.save')).toBeDisabled();

    fireEvent.change(shareFields[1]!, { target: { value: '70' } });
    expect(screen.getByText('ui.save')).not.toBeDisabled();

    fireEvent.click(screen.getByText('ui.save'));
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ splitMode: 'custom', shares: { mor: 5000, uri: 7000 } }),
    );
  });

  it('removing an existing cost asks for confirmation', () => {
    const onRemove = vi.fn();
    const costs: SharedCostState[] = [
      {
        id: 'c1',
        label: 'פיצה',
        amountMinor: minor(12000),
        paidByPlayerId: null,
        splitMode: 'equal',
        shares: new Map([['mor', minor(12000)]]),
      },
    ];
    render(
      <SharedCostsSheet
        open
        onClose={vi.fn()}
        costs={costs}
        players={players}
        currency="ILS"
        locale="he"
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onRemove={onRemove}
      />,
    );

    fireEvent.click(screen.getByText('פיצה'));
    fireEvent.click(screen.getByText('ui.delete'));
    expect(onRemove).not.toHaveBeenCalled();
    // The form sheet unmounts while the confirm sheet is open, so there is
    // exactly one "ui.delete" button on screen at this point — the confirm.
    fireEvent.click(screen.getByText('ui.delete'));
    expect(onRemove).toHaveBeenCalledWith('c1');
  });
});
