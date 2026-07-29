import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@components/BottomSheet';
import { SelectionChip } from '@components/SelectionChip';
import { Button } from '@components/shared/Button';
import { TextField } from '@components/shared/TextField';
import { chipsToMoney, formatMoney, net, owed, type Minor } from '@core/money';

const QUICK_MULTIPLES = [0, 0.5, 1, 1.5];

export interface SettleSheetProps {
  open: boolean;
  onClose: () => void;
  playerName: string;
  /** 'settle' closes an open row; 'edit' corrects an already-settled row's count (עריכת ז'יטונים). */
  mode: 'settle' | 'edit';
  initialChips: number;
  buysCount: number;
  buyAmountMinor: Minor;
  chipsPerBuy: number;
  currency: string;
  locale: string;
  /** Total chips still uncounted across the table — an entry above this is flagged, not blocked. */
  chipsRemainingInPlay: number;
  onSave: (chips: number) => void;
}

/**
 * The settle sheet (04-ux-spec.md#settling-a-player-15), reused for
 * "עריכת ז'יטונים" on an already-settled row — same input, same live
 * conversion, a different verb on the button and a different event underneath
 * (player_settled vs. chips_set — see core/offline/gameActions.ts).
 */
export function SettleSheet({
  open,
  onClose,
  playerName,
  mode,
  initialChips,
  buysCount,
  buyAmountMinor,
  chipsPerBuy,
  currency,
  locale,
  chipsRemainingInPlay,
  onSave,
}: SettleSheetProps) {
  const { t } = useTranslation();
  const [chipsValue, setChipsValue] = useState(() => String(initialChips));

  const chips = Math.max(0, Math.round(Number(chipsValue) || 0));
  const cashOutMinor = chipsToMoney(chips, buyAmountMinor, chipsPerBuy);
  const owedMinor = owed(buysCount, buyAmountMinor);
  const netMinor = net(cashOutMinor, owedMinor);
  const exceedsRemaining = chips > chipsRemainingInPlay;

  function handleSave(): void {
    onSave(chips);
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={t('settle.title', { name: playerName })}>
      <div className="flex flex-col items-center gap-3 text-center">
        <TextField
          aria-label={t('settle.title', { name: playerName })}
          type="text"
          inputMode="numeric"
          autoFocus
          value={chipsValue}
          onChange={(event) => setChipsValue(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
          className="text-center text-title font-bold tabular-nums"
        />

        <p className="text-body-sm text-fg-secondary">
          {t('settle.conversion', {
            money: formatMoney(cashOutMinor, { locale, currency }),
            net: formatMoney(netMinor, { locale, currency, showSign: true }),
          })}
        </p>

        {exceedsRemaining && (
          <p role="alert" className="text-body-sm font-semibold text-negative">
            {t('settle.exceedsRemaining')}
          </p>
        )}

        <div className="flex flex-wrap justify-center gap-2">
          {QUICK_MULTIPLES.map((multiple) => {
            const value = Math.round(chipsPerBuy * multiple);
            return (
              <SelectionChip
                key={multiple}
                label={String(value)}
                selected={chips === value}
                onClick={() => setChipsValue(String(value))}
              />
            );
          })}
        </div>

        <Button variant="primary" fullWidth onClick={handleSave}>
          {mode === 'settle' ? t('settle.confirm') : t('ui.save')}
        </Button>
      </div>
    </BottomSheet>
  );
}
