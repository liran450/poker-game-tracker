import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Money } from '@components/Money';
import { IconButton } from '@components/shared/IconButton';
import { TextField } from '@components/shared/TextField';
import { fromMajor, toMajor, type Minor } from '@core/money';

export interface TransferRowProps {
  mode: 'read' | 'edit';
  fromName: string;
  toName: string;
  amountMinor: Minor;
  currency: string;
  onEditFrom?: () => void;
  onEditTo?: () => void;
  onAmountChange?: (amountMinor: Minor) => void;
  onDelete?: () => void;
  onCopied?: () => void;
}

/**
 * A transfer, in read mode (04-ux-spec.md#summary-screen-after-settlement)
 * or edit mode (05-settlement.md#edit-mode-1617) — one component, per the
 * settle-sheet precedent, since the two modes share every field and differ
 * only in whether they're tappable.
 */
export function TransferRow({
  mode,
  fromName,
  toName,
  amountMinor,
  currency,
  onEditFrom,
  onEditTo,
  onAmountChange,
  onDelete,
  onCopied,
}: TransferRowProps) {
  const { t } = useTranslation();
  const [editingAmount, setEditingAmount] = useState(false);
  const [amountMajor, setAmountMajor] = useState(() => String(toMajor(amountMinor)));

  function copy(text: string): void {
    void navigator.clipboard.writeText(text).then(onCopied);
  }

  function commitAmount(): void {
    setEditingAmount(false);
    onAmountChange?.(fromMajor(Number(amountMajor) || 0, currency));
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-card px-3.5 py-2.5">
      <div className="flex flex-1 items-center gap-1.5 text-body font-semibold">
        <button
          type="button"
          disabled={mode === 'read'}
          onClick={() => (mode === 'edit' ? onEditFrom?.() : copy(fromName))}
          className="truncate"
        >
          {fromName}
        </button>
        <span aria-hidden="true" className="text-fg-tertiary">
          {'←'}
        </span>
        <button
          type="button"
          disabled={mode === 'read'}
          onClick={() => (mode === 'edit' ? onEditTo?.() : copy(toName))}
          className="truncate"
        >
          {toName}
        </button>
      </div>

      {mode === 'edit' && editingAmount ? (
        <TextField
          aria-label={t('settlement.amountField')}
          type="text"
          inputMode="decimal"
          autoFocus
          value={amountMajor}
          onChange={(e) => setAmountMajor(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={commitAmount}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitAmount();
          }}
          className="w-24 text-end tabular-nums"
        />
      ) : (
        <button
          type="button"
          onClick={() => (mode === 'edit' ? setEditingAmount(true) : copy(String(toMajor(amountMinor))))}
        >
          <Money value={amountMinor} currency={currency} size="md" className="font-bold" />
        </button>
      )}

      {mode === 'edit' && onDelete && (
        <IconButton label={t('settlement.deleteTransfer')} size="sm" onClick={onDelete}>
          {'🗑️'}
        </IconButton>
      )}
    </div>
  );
}
