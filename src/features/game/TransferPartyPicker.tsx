import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@components/BottomSheet';
import { SelectionChip } from '@components/SelectionChip';
import { POT_ID } from '@core/settlement';

export interface TransferPartyOption {
  readonly id: string;
  readonly name: string;
}

export interface TransferPartyPickerProps {
  open: boolean;
  onClose: () => void;
  players: readonly TransferPartyOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/**
 * The transfer row's "chip picker" (05-settlement.md#edit-mode-1617): tapping
 * a name in edit mode opens this — a grid of tappable name chips listing
 * every player plus `קופה`, not a native `<select>`.
 */
export function TransferPartyPicker({
  open,
  onClose,
  players,
  selectedId,
  onSelect,
}: TransferPartyPickerProps) {
  const { t } = useTranslation();

  return (
    <BottomSheet open={open} onClose={onClose} title={t('settlement.pickerTitle')}>
      <div className="flex flex-wrap gap-2">
        <SelectionChip
          label={t('money.pot')}
          selected={selectedId === POT_ID}
          onClick={() => {
            onSelect(POT_ID);
            onClose();
          }}
        />
        {players.map((player) => (
          <SelectionChip
            key={player.id}
            label={player.name}
            selected={selectedId === player.id}
            onClick={() => {
              onSelect(player.id);
              onClose();
            }}
          />
        ))}
      </div>
    </BottomSheet>
  );
}
