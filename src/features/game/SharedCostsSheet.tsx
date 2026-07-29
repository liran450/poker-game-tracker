import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@components/BottomSheet';
import { DestructiveConfirm } from '@components/DestructiveConfirm';
import { Money } from '@components/Money';
import { SelectionChip } from '@components/SelectionChip';
import { Button } from '@components/shared/Button';
import { TextField } from '@components/shared/TextField';
import { formatMoney, fromMajor, minor, splitWithResidue, sum, toMajor, type Minor } from '@core/money';
import type { SharedCostInput } from '@core/offline/gameActions';
import type { SharedCostState } from '@core/events';

const POT_ID = null;

export interface SharedCostPlayer {
  readonly id: string;
  readonly name: string;
}

export interface SharedCostsSheetProps {
  open: boolean;
  onClose: () => void;
  costs: readonly SharedCostState[];
  players: readonly SharedCostPlayer[];
  currency: string;
  locale: string;
  onAdd: (input: SharedCostInput) => void;
  onUpdate: (costId: string, input: SharedCostInput) => void;
  onRemove: (costId: string) => void;
}

type View = { mode: 'list' } | { mode: 'form'; editingCostId: string | null };

/**
 * Shared costs (04-ux-spec.md#shared-costs): a small list, reached from the
 * header `⋯`, with an add/edit form covering equal and custom splits. Equal
 * split's shares are computed and stored once, at save time
 * (`splitWithResidue`) — not recomputed later against a changing roster,
 * matching the event log's append-only contract.
 */
export function SharedCostsSheet({
  open,
  onClose,
  costs,
  players,
  currency,
  locale,
  onAdd,
  onUpdate,
  onRemove,
}: SharedCostsSheetProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<View>({ mode: 'list' });

  function handleClose(): void {
    setView({ mode: 'list' });
    onClose();
  }

  if (view.mode === 'form') {
    const editing = view.editingCostId ? costs.find((c) => c.id === view.editingCostId) : undefined;
    return (
      <SharedCostForm
        open={open}
        onClose={() => setView({ mode: 'list' })}
        players={players}
        currency={currency}
        locale={locale}
        editing={editing}
        onSave={(input) => {
          if (editing) onUpdate(editing.id, input);
          else onAdd(input);
          setView({ mode: 'list' });
        }}
        onRemove={
          editing
            ? () => {
                onRemove(editing.id);
                setView({ mode: 'list' });
              }
            : undefined
        }
      />
    );
  }

  return (
    <BottomSheet open={open} onClose={handleClose} title={t('sharedCosts.title')}>
      <div className="flex flex-col gap-4">
        {costs.length === 0 ? (
          <p className="text-body-sm text-fg-disabled">{t('sharedCosts.empty')}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {costs.map((cost) => {
              const payerName = cost.paidByPlayerId
                ? (players.find((p) => p.id === cost.paidByPlayerId)?.name ?? '')
                : t('money.pot');
              return (
                <button
                  key={cost.id}
                  type="button"
                  onClick={() => setView({ mode: 'form', editingCostId: cost.id })}
                  className="flex min-h-tap items-center justify-between rounded-lg border border-line-strong bg-surface-card px-3.5 text-start"
                >
                  <span className="flex flex-col items-start">
                    <span className="text-body font-medium">{cost.label}</span>
                    <span className="text-caption text-fg-tertiary">
                      {t('sharedCosts.paidBy', { name: payerName })}
                    </span>
                  </span>
                  <Money value={cost.amountMinor} currency={currency} size="sm" />
                </button>
              );
            })}
          </div>
        )}

        <Button variant="secondary" fullWidth onClick={() => setView({ mode: 'form', editingCostId: null })}>
          {t('sharedCosts.add')}
        </Button>
      </div>
    </BottomSheet>
  );
}

interface SharedCostFormProps {
  open: boolean;
  onClose: () => void;
  players: readonly SharedCostPlayer[];
  currency: string;
  locale: string;
  editing: SharedCostState | undefined;
  onSave: (input: SharedCostInput) => void;
  onRemove?: (() => void) | undefined;
}

function SharedCostForm({
  open,
  onClose,
  players,
  currency,
  locale,
  editing,
  onSave,
  onRemove,
}: SharedCostFormProps) {
  const { t } = useTranslation();
  const [label, setLabel] = useState(editing?.label ?? '');
  const [majorAmount, setMajorAmount] = useState(() =>
    editing ? String(toMajor(editing.amountMinor)) : '',
  );
  const [paidBy, setPaidBy] = useState<string | null>(editing?.paidByPlayerId ?? POT_ID);
  const [splitMode, setSplitMode] = useState<'equal' | 'custom'>(editing?.splitMode ?? 'equal');
  const [selected, setSelected] = useState<string[]>(
    editing ? [...editing.shares.keys()] : players.map((p) => p.id),
  );
  const [customShares, setCustomShares] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    if (editing) {
      for (const [id, share] of editing.shares) initial[id] = String(toMajor(share));
    }
    return initial;
  });
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const amountMinor = fromMajor(Number(majorAmount) || 0, currency);

  function toggleSelected(id: string): void {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const equalShare =
    splitMode === 'equal' && selected.length > 0 ? splitWithResidue(amountMinor, selected.length)[0]! : minor(0);

  const customTotalMinor = sum(
    selected.map((id) => fromMajor(Number(customShares[id] ?? '0') || 0, currency)),
  );
  const customRemainder = (amountMinor - customTotalMinor) as Minor;

  const canSave =
    label.trim() !== '' &&
    amountMinor > 0 &&
    selected.length > 0 &&
    (splitMode === 'equal' || customRemainder === 0);

  function handleSave(): void {
    if (!canSave) return;
    let shares: Record<string, number>;
    if (splitMode === 'equal') {
      const amounts = splitWithResidue(amountMinor, selected.length);
      shares = Object.fromEntries(selected.map((id, i) => [id, amounts[i]!]));
    } else {
      shares = Object.fromEntries(
        selected.map((id) => [id, fromMajor(Number(customShares[id] ?? '0') || 0, currency)]),
      );
    }
    onSave({ label: label.trim(), amountMinor, paidByPlayerId: paidBy, splitMode, shares });
  }

  return (
    <>
      <BottomSheet
        open={open && !confirmingRemove}
        onClose={onClose}
        title={editing ? t('sharedCosts.editTitle') : t('sharedCosts.addTitle')}
      >
        <div className="flex flex-col gap-4">
          <TextField
            aria-label={t('sharedCosts.labelField')}
            placeholder={t('sharedCosts.labelField')}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <TextField
            aria-label={t('money.buyAmount')}
            type="text"
            inputMode="decimal"
            placeholder={t('sharedCosts.amountField')}
            value={majorAmount}
            onChange={(e) => setMajorAmount(e.target.value)}
          />

          <div className="flex flex-col gap-2">
            <h3 className="text-body-sm font-semibold text-fg-tertiary">{t('sharedCosts.paidByField')}</h3>
            <div className="flex flex-wrap gap-2">
              <SelectionChip label={t('money.pot')} selected={paidBy === POT_ID} onClick={() => setPaidBy(POT_ID)} />
              {players.map((p) => (
                <SelectionChip key={p.id} label={p.name} selected={paidBy === p.id} onClick={() => setPaidBy(p.id)} />
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <SelectionChip
              label={t('sharedCosts.equalSplit')}
              selected={splitMode === 'equal'}
              onClick={() => setSplitMode('equal')}
            />
            <SelectionChip
              label={t('sharedCosts.customSplit')}
              selected={splitMode === 'custom'}
              onClick={() => setSplitMode('custom')}
            />
          </div>

          <div className="flex flex-col gap-2">
            {players.map((p) => {
              const isSelected = selected.includes(p.id);
              return (
                <div key={p.id} className="flex items-center justify-between gap-2">
                  <SelectionChip label={p.name} selected={isSelected} onClick={() => toggleSelected(p.id)} />
                  {splitMode === 'equal' && isSelected && (
                    <span className="text-body-sm text-fg-tertiary">
                      {t('sharedCosts.perPerson', { amount: formatMoney(equalShare, { locale, currency }) })}
                    </span>
                  )}
                  {splitMode === 'custom' && isSelected && (
                    <TextField
                      aria-label={t('sharedCosts.shareField', { name: p.name })}
                      type="text"
                      inputMode="decimal"
                      value={customShares[p.id] ?? ''}
                      onChange={(e) => setCustomShares((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      className="w-24"
                    />
                  )}
                </div>
              );
            })}
          </div>

          {splitMode === 'custom' && (
            <p className={['text-body-sm font-medium', customRemainder === 0 ? 'text-positive' : 'text-negative'].join(' ')}>
              {t('sharedCosts.remainder', { amount: formatMoney(customRemainder, { locale, currency, showSign: true }) })}
            </p>
          )}

          <Button variant="primary" fullWidth disabled={!canSave} onClick={handleSave}>
            {t('ui.save')}
          </Button>

          {onRemove && (
            <Button variant="destructive" fullWidth onClick={() => setConfirmingRemove(true)}>
              {t('ui.delete')}
            </Button>
          )}
        </div>
      </BottomSheet>

      {onRemove && (
        <DestructiveConfirm
          open={confirmingRemove}
          onClose={() => setConfirmingRemove(false)}
          onConfirm={onRemove}
          title={t('sharedCosts.removeConfirmTitle')}
          description={t('sharedCosts.removeConfirmDesc')}
          confirmLabel={t('ui.delete')}
        />
      )}
    </>
  );
}
