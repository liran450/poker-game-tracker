import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppShell } from '@components/AppShell';
import { BottomSheet } from '@components/BottomSheet';
import { DestructiveConfirm } from '@components/DestructiveConfirm';
import { InstallPrompt } from '@components/InstallPrompt';
import { Money } from '@components/Money';
import { Button } from '@components/shared/Button';
import { IconButton } from '@components/shared/IconButton';
import { type Minor } from '@core/money';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';
import { TransferRow } from './TransferRow';

export interface SummaryScreenPlayerResult {
  readonly id: string;
  readonly name: string;
  readonly netMinor: Minor;
  readonly sharedMinor: Minor;
}

export interface SummaryScreenTransfer {
  readonly fromId: string;
  readonly fromName: string;
  readonly toName: string;
  readonly amountMinor: Minor;
}

export interface SummaryScreenProps {
  gameName: string;
  date: string;
  playerCount: number;
  currency: string;
  results: readonly SummaryScreenPlayerResult[];
  transfers: readonly SummaryScreenTransfer[];
  canReopen: boolean;
  reopenHoursRemaining: number | null;
  onShare: () => void;
  onCopyTransfers: () => void;
  onReopen: () => void;
  onBack: () => void;
}

/**
 * The summary screen (04-ux-spec.md#summary-screen-after-settlement): result
 * cards sorted net descending, the transfer list in read mode, `שיתוף` /
 * `העתק העברות` as equal bottom-bar buttons, and `פתח מחדש` tucked in the
 * `⋯` menu with its 24h countdown — no "mark as paid" checkbox, dropped for
 * good (05-settlement.md#payment-links--reality-check-23).
 */
export function SummaryScreen({
  gameName,
  date,
  playerCount,
  currency,
  results,
  transfers,
  canReopen,
  reopenHoursRemaining,
  onShare,
  onCopyTransfers,
  onReopen,
  onBack,
}: SummaryScreenProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [reopenConfirmOpen, setReopenConfirmOpen] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(false);
  const install = useInstallPrompt();

  const sortedResults = [...results].sort((a, b) => b.netMinor - a.netMinor);
  const winnerId = sortedResults[0]?.netMinor && sortedResults[0].netMinor > 0 ? sortedResults[0].id : null;

  return (
    <AppShell
      header={
        <div className="flex items-center justify-between px-4 py-3">
          <IconButton label={t('game.backToHome')} onClick={onBack}>
            {'✕'}
          </IconButton>
          <div className="flex flex-col items-center">
            <h1 className="text-heading font-bold">{gameName}</h1>
            <span className="text-body-sm text-fg-tertiary">
              {date} · {t('home.playerCount', { count: playerCount })}
            </span>
          </div>
          <IconButton label={t('summary.menu')} onClick={() => setMenuOpen(true)}>
            {'⋯'}
          </IconButton>
        </div>
      }
      footer={
        <div className="flex gap-2 px-4 py-3">
          <Button variant="secondary" fullWidth onClick={onCopyTransfers}>
            {t('summary.copyTransfers')}
          </Button>
          <Button variant="primary" fullWidth onClick={onShare}>
            {t('summary.share')}
          </Button>
        </div>
      }
    >
      {install.canInstall && !installDismissed && (
        <InstallPrompt
          onInstall={install.promptInstall}
          onDismiss={() => setInstallDismissed(true)}
        />
      )}

      <div className="flex flex-col gap-4 p-4">
        <section className="flex flex-col gap-1.5">
          {sortedResults.map((r) => (
            <div
              key={r.id}
              className={[
                'flex items-center justify-between rounded-lg px-3.5 py-3',
                r.id === winnerId
                  ? 'bg-[image:var(--gradient-card-positive)] border border-positive/25'
                  : 'bg-surface-card',
              ].join(' ')}
            >
              <span className="text-body font-semibold">{r.name}</span>
              <div className="flex flex-col items-end gap-0.5">
                <Money value={r.netMinor} currency={currency} showSign size="lg" className="font-bold" />
                {r.sharedMinor !== 0 && (
                  <Money value={r.sharedMinor} currency={currency} showSign size="sm" />
                )}
              </div>
            </div>
          ))}
        </section>

        <section className="flex flex-col gap-2">
          {transfers.length === 0 ? (
            <p className="text-body-sm text-fg-disabled">{t('summary.noTransfers')}</p>
          ) : (
            transfers.map((transfer, i) => (
              <TransferRow
                key={i}
                mode="read"
                fromName={transfer.fromName}
                toName={transfer.toName}
                amountMinor={transfer.amountMinor}
                currency={currency}
              />
            ))
          )}
        </section>
      </div>

      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} title={t('summary.menu')}>
        <div className="flex flex-col gap-2.5">
          {canReopen ? (
            <>
              <Button
                variant="secondary"
                fullWidth
                onClick={() => {
                  setMenuOpen(false);
                  setReopenConfirmOpen(true);
                }}
              >
                {t('summary.reopen')}
              </Button>
              {reopenHoursRemaining !== null && (
                <p className="text-center text-caption text-fg-tertiary">
                  {t('summary.reopenCountdown', { hours: reopenHoursRemaining })}
                </p>
              )}
            </>
          ) : (
            <p className="text-center text-body-sm text-fg-disabled">{t('summary.reopenExpired')}</p>
          )}
        </div>
      </BottomSheet>

      <DestructiveConfirm
        open={reopenConfirmOpen}
        onClose={() => setReopenConfirmOpen(false)}
        onConfirm={onReopen}
        title={t('summary.reopenConfirmTitle')}
        description={t('summary.reopenConfirmDesc')}
        confirmLabel={t('summary.reopenConfirmLabel')}
      />
    </AppShell>
  );
}
