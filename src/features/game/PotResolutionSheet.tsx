import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@components/BottomSheet';
import { InfoExplainer } from '@components/InfoExplainer';
import { Money } from '@components/Money';
import { Button } from '@components/shared/Button';
import { abs, type Minor } from '@core/money';

export interface SettledPlayerSummary {
  readonly id: string;
  readonly name: string;
  readonly chipsFinal: number;
  readonly settledAt: string;
}

export interface PotResolutionSheetProps {
  open: boolean;
  onClose: () => void;
  discrepancyMinor: Minor;
  currency: string;
  /** Most recently settled first (04-ux-spec.md#the-safeguard-20, resolution 1). */
  settledPlayers: readonly SettledPlayerSummary[];
  onSelectPlayer: (playerId: string) => void;
  onAssignToHouse: () => void;
}

/**
 * The pot banner's red-state resolution sheet (05-settlement.md#the-safeguard-20).
 * Two of the spec's three resolutions are built here: re-checking a settled
 * player's count, and assigning the exact gap to `לא מזוהה / הבית`
 * (`unaccounted_set` — see core/offline/gameActions.ts). "Split evenly among
 * players" is deliberately not offered yet — there is no settlement graph to
 * feed it until step 8 exists, and a button that can't do anything correctly
 * is worse than one that isn't there.
 */
export function PotResolutionSheet({
  open,
  onClose,
  discrepancyMinor,
  currency,
  settledPlayers,
  onSelectPlayer,
  onAssignToHouse,
}: PotResolutionSheetProps) {
  const { t } = useTranslation();
  const sorted = [...settledPlayers].sort((a, b) => (a.settledAt < b.settledAt ? 1 : -1));

  return (
    <BottomSheet open={open} onClose={onClose} title={t('pot.resolutionTitle')}>
      <div className="flex flex-col gap-4">
        <p className="text-body-sm text-fg-secondary">
          <Money value={abs(discrepancyMinor)} currency={currency} size="sm" />
        </p>

        <div className="flex flex-col gap-2">
          <h3 className="text-body-sm font-semibold text-fg-tertiary">{t('pot.fixCounts')}</h3>
          {sorted.length === 0 ? (
            <p className="text-body-sm text-fg-disabled">{t('pot.noSettledPlayers')}</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {sorted.map((player) => (
                <button
                  key={player.id}
                  type="button"
                  onClick={() => onSelectPlayer(player.id)}
                  className="flex min-h-tap items-center justify-between rounded-lg border border-line-strong bg-surface-card px-3.5 text-start"
                >
                  <span className="text-body font-medium">{player.name}</span>
                  <span className="text-body-sm text-fg-tertiary">
                    {t('pot.chipsCount', { count: player.chipsFinal })}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" className="flex-1" onClick={onAssignToHouse}>
            {t('pot.assignToHouse')}
          </Button>
          <InfoExplainer content={t('pot.assignToHouseExplainer')} />
        </div>
      </div>
    </BottomSheet>
  );
}
