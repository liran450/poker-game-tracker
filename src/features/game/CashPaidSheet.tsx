import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@components/BottomSheet';
import { InfoExplainer } from '@components/InfoExplainer';
import { SelectionChip } from '@components/SelectionChip';
import { Button } from '@components/shared/Button';
import { TextField } from '@components/shared/TextField';
import { formatMoney, fromMajor, toMajor, type Minor } from '@core/money';

export interface CashPaidSheetProps {
  open: boolean;
  onClose: () => void;
  playerName: string;
  currentAmountMinor: Minor;
  buyAmountMinor: Minor;
  currency: string;
  locale: string;
  onSave: (amountMinor: Minor) => void;
}

/**
 * The cash-paid sheet (04-ux-spec.md#player-row-anatomy, #18): a small numeric
 * sheet pre-selected with the current amount, plus quick chips for one, two
 * and three buy-ins' worth.
 */
export function CashPaidSheet({
  open,
  onClose,
  playerName,
  currentAmountMinor,
  buyAmountMinor,
  currency,
  locale,
  onSave,
}: CashPaidSheetProps) {
  const { t } = useTranslation();
  const [majorValue, setMajorValue] = useState(() => String(toMajor(currentAmountMinor)));

  const presets = [1, 2, 3].map((n) => fromMajor(toMajor(buyAmountMinor) * n, currency));

  function handleSave(): void {
    const amountMinor = fromMajor(Number(majorValue) || 0, currency);
    onSave(amountMinor);
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={t('cashPaid.title', { name: playerName })}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-1">
          <span className="text-body-sm font-semibold text-fg-tertiary">{t('players.cashPaid')}</span>
          <InfoExplainer content={t('cashPaid.explainer')} />
        </div>
        <TextField
          aria-label={t('cashPaid.title', { name: playerName })}
          type="text"
          inputMode="decimal"
          autoFocus
          value={majorValue}
          onChange={(event) => setMajorValue(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
        />
        <div className="flex flex-wrap gap-2">
          {presets.map((amount, i) => (
            <SelectionChip
              key={i}
              label={formatMoney(amount, { locale, currency })}
              selected={Number(majorValue) === toMajor(amount)}
              onClick={() => setMajorValue(String(toMajor(amount)))}
            />
          ))}
        </div>
        <Button variant="primary" fullWidth onClick={handleSave}>
          {t('ui.save')}
        </Button>
      </div>
    </BottomSheet>
  );
}
