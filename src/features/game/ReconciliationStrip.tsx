import { useTranslation } from 'react-i18next';
import { Money } from '@components/Money';
import type { Minor } from '@core/money';

export interface ReconciliationStripRow {
  readonly nodeId: string;
  readonly name: string;
  readonly shouldMoveMinor: Minor;
  readonly actuallyAssignedMinor: Minor;
  readonly differenceMinor: Minor;
  readonly isReconciled: boolean;
}

export interface ReconciliationStripProps {
  rows: readonly ReconciliationStripRow[];
  currency: string;
}

/**
 * The per-player correctness strip under the transfer list
 * (05-settlement.md#edit-mode-1617): שם / אמור / בפועל / פער, every row
 * carrying `✓` or a signed figure — never colour alone
 * (04-ux-spec.md#accessibility).
 */
export function ReconciliationStrip({ rows, currency }: ReconciliationStripProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-1 text-caption font-semibold text-fg-tertiary">
        <span>{t('settlement.reconciliation.name')}</span>
        <span>{t('settlement.reconciliation.shouldMove')}</span>
        <span>{t('settlement.reconciliation.actuallyAssigned')}</span>
        <span>{t('settlement.reconciliation.difference')}</span>
      </div>
      {rows.map((row) => (
        <div
          key={row.nodeId}
          className={[
            'grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 rounded-md px-2.5 py-2',
            row.isReconciled ? 'bg-tint-positive' : 'bg-tint-negative',
          ].join(' ')}
        >
          <span className="truncate text-body-sm font-semibold">{row.name}</span>
          <Money value={row.shouldMoveMinor} currency={currency} size="sm" />
          <Money value={row.actuallyAssignedMinor} currency={currency} size="sm" />
          {row.isReconciled ? (
            <span className="text-body-sm font-bold text-positive" aria-label={t('settlement.reconciliation.ok')}>
              {'✓'}
            </span>
          ) : (
            <Money value={row.differenceMinor} currency={currency} size="sm" showSign />
          )}
        </div>
      ))}
    </div>
  );
}
