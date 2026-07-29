import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppShell } from '@components/AppShell';
import { DestructiveConfirm } from '@components/DestructiveConfirm';
import { Money } from '@components/Money';
import { Button } from '@components/shared/Button';
import { type Minor } from '@core/money';
import { ReconciliationStrip, type ReconciliationStripRow } from './ReconciliationStrip';
import { SettlementBanner } from './SettlementBanner';
import { TransferPartyPicker, type TransferPartyOption } from './TransferPartyPicker';
import { TransferRow } from './TransferRow';

export interface SettlementScreenPlayerResult {
  readonly id: string;
  readonly name: string;
  readonly netMinor: Minor;
  readonly sharedMinor: Minor;
}

export interface SettlementScreenTransfer {
  readonly id: string;
  readonly fromId: string;
  readonly toId: string;
  readonly amountMinor: Minor;
}

export interface SettlementScreenProps {
  gameName: string;
  currency: string;
  locale: string;
  results: readonly SettlementScreenPlayerResult[];
  partyOptions: readonly TransferPartyOption[];
  partyNameById: ReadonlyMap<string, string>;
  transfers: readonly SettlementScreenTransfer[];
  reconciliationRows: readonly ReconciliationStripRow[];
  assignedMinor: Minor;
  totalToMoveMinor: Minor;
  isComplete: boolean;
  onEditParty: (transferId: string, side: 'from' | 'to', newId: string) => void;
  onEditAmount: (transferId: string, amountMinor: Minor) => void;
  onDeleteTransfer: (transferId: string) => void;
  onAddTransfer: () => void;
  onRecompute: () => void;
  onShareText: () => void;
  onFinish: () => void;
}

type EditingParty = { transferId: string; side: 'from' | 'to' };

/**
 * The settlement/edit-mode screen (05-settlement.md#edit-mode-1617): the
 * sticky balance banner, the results section, the editable transfer list,
 * and the bottom bar (`שתף כטקסט` · `חשב מחדש` · `סיים`).
 */
export function SettlementScreen({
  gameName,
  currency,
  locale,
  results,
  partyOptions,
  partyNameById,
  transfers,
  reconciliationRows,
  assignedMinor,
  totalToMoveMinor,
  isComplete,
  onEditParty,
  onEditAmount,
  onDeleteTransfer,
  onAddTransfer,
  onRecompute,
  onShareText,
  onFinish,
}: SettlementScreenProps) {
  const { t } = useTranslation();
  const [resultsOpen, setResultsOpen] = useState(true);
  const [editingParty, setEditingParty] = useState<EditingParty | null>(null);
  const [recomputeConfirmOpen, setRecomputeConfirmOpen] = useState(false);

  return (
    <AppShell
      header={
        <div className="flex flex-col gap-2 px-4 py-3">
          <h1 className="text-heading font-bold">{gameName}</h1>
          <SettlementBanner
            assignedMinor={assignedMinor}
            totalToMoveMinor={totalToMoveMinor}
            isComplete={isComplete}
            currency={currency}
            locale={locale}
          />
        </div>
      }
      footer={
        <div className="flex gap-2 px-4 py-3">
          <Button variant="secondary" onClick={onShareText}>
            {t('summary.share')}
          </Button>
          <Button variant="secondary" onClick={() => setRecomputeConfirmOpen(true)}>
            {t('settlement.recalculate')}
          </Button>
          <Button variant="primary" fullWidth onClick={onFinish}>
            {t('settlement.finish')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 p-4">
        <section className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setResultsOpen((v) => !v)}
            className="flex items-center justify-between text-body-sm font-semibold text-fg-tertiary"
          >
            <span>{t('settlement.resultsHeading')}</span>
            <span aria-hidden="true">{resultsOpen ? '▾' : '◂'}</span>
          </button>
          {resultsOpen && (
            <div className="flex flex-col gap-1.5">
              {results.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-lg bg-surface-card px-3.5 py-2.5"
                >
                  <span className="text-body font-semibold">{r.name}</span>
                  <div className="flex flex-col items-end gap-0.5">
                    <Money value={r.netMinor} currency={currency} showSign size="md" className="font-bold" />
                    {r.sharedMinor !== 0 && (
                      <Money value={r.sharedMinor} currency={currency} showSign size="sm" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-body-sm font-semibold text-fg-tertiary">{t('settlement.transfersHeading')}</h2>
          <div className="flex flex-col gap-2">
            {transfers.map((transfer) => (
              <TransferRow
                key={transfer.id}
                mode="edit"
                fromName={partyNameById.get(transfer.fromId) ?? ''}
                toName={partyNameById.get(transfer.toId) ?? ''}
                amountMinor={transfer.amountMinor}
                currency={currency}
                onEditFrom={() => setEditingParty({ transferId: transfer.id, side: 'from' })}
                onEditTo={() => setEditingParty({ transferId: transfer.id, side: 'to' })}
                onAmountChange={(amountMinor) => onEditAmount(transfer.id, amountMinor)}
                onDelete={() => onDeleteTransfer(transfer.id)}
              />
            ))}
          </div>
          <Button variant="ghost" onClick={onAddTransfer}>
            {t('settlement.addTransfer')}
          </Button>
        </section>

        <section className="flex flex-col gap-2">
          <ReconciliationStrip rows={reconciliationRows} currency={currency} />
        </section>
      </div>

      <TransferPartyPicker
        open={editingParty !== null}
        onClose={() => setEditingParty(null)}
        players={partyOptions}
        selectedId={null}
        onSelect={(id) => {
          if (editingParty) onEditParty(editingParty.transferId, editingParty.side, id);
        }}
      />

      <DestructiveConfirm
        open={recomputeConfirmOpen}
        onClose={() => setRecomputeConfirmOpen(false)}
        onConfirm={onRecompute}
        title={t('settlement.recalculateConfirmTitle')}
        description={t('settlement.recalculateConfirmDesc')}
        confirmLabel={t('settlement.recalculateConfirmLabel')}
      />
    </AppShell>
  );
}
