import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { AppShell } from '@components/AppShell';
import { EmptyState } from '@components/EmptyState';
import { Money } from '@components/Money';
import { Button } from '@components/shared/Button';
import { IconButton } from '@components/shared/IconButton';
import { buildGameExportPayload, gameExportFileName } from '@core/gameExport';
import {
  fetchPastGameResult,
  pastGameResultToExportInput,
  type PastGameResult,
} from '@data/gameHistory';
import { downloadJson } from './download';
import { formatDateShort } from './time';
import { TransferRow } from './TransferRow';

export interface PastGameResultsViewProps {
  gameId: string;
  /** Injectable for tests; defaults to the real remote fetch. */
  loadResult?: (gameId: string) => Promise<PastGameResult | null>;
}

/**
 * The fallback `GamePage` renders once `useGame` resolves with no local record at all — a game
 * purged from this device's own Dexie cache, or one this device never had (a share link opened
 * on a fresh browser, or an iOS IndexedDB eviction, docs/build/NOTES.md). The only source left at
 * that point is the permanent-table read `src/data/gameHistory.ts#fetchPastGameResult` — RLS
 * itself decides whether this caller may see it at all, so "not visible" and "genuinely purged
 * everywhere" both land on the same friendly dead end (04-ux-spec.md#revoked-expired-or-purged).
 * There is deliberately no audit log here — a purged game's `game_events` are gone for real
 * (03-data-model.md#retention-and-archiving), and even an unpurged-but-foreign game's log was
 * never on this device to fold in the first place.
 */
export function PastGameResultsView({ gameId, loadResult = fetchPastGameResult }: PastGameResultsViewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Keyed by gameId so a param change (navigating from one game's dead-end straight to another's,
  // without a remount) reads as "loading again" until the new fetch actually resolves, rather than
  // flashing the previous game's result under the new id.
  const [loaded, setLoaded] = useState<{ gameId: string; result: PastGameResult | null } | undefined>(
    undefined,
  );

  useEffect(() => {
    let cancelled = false;
    void loadResult(gameId).then((result) => {
      if (!cancelled) setLoaded({ gameId, result });
    });
    return () => {
      cancelled = true;
    };
  }, [gameId, loadResult]);

  const result = loaded?.gameId === gameId ? loaded.result : undefined;

  function handleExport(): void {
    if (!result) return;
    const payload = buildGameExportPayload(pastGameResultToExportInput(result));
    downloadJson(gameExportFileName(gameId, payload.game.playedOn), payload);
  }

  const header = (
    <div className="flex items-center gap-2 px-2 py-3">
      <IconButton label={t('game.backToHome')} onClick={() => void navigate('/')}>
        {'✕'}
      </IconButton>
      <h1 className="flex-1 truncate text-center text-heading font-bold">
        {result ? result.summary.name : ''}
      </h1>
      <div className="size-10" aria-hidden="true" />
    </div>
  );

  if (result === undefined) {
    return (
      <AppShell header={header}>
        <p className="p-8 text-center text-body-sm text-fg-tertiary">{t('pastGame.loading')}</p>
      </AppShell>
    );
  }

  if (result === null) {
    return (
      <AppShell header={header}>
        <EmptyState title={t('pastGame.notFoundTitle')} description={t('pastGame.notFoundDescription')} />
      </AppShell>
    );
  }

  const { summary, players, transfers } = result;
  const sortedPlayers = [...players].sort((a, b) => b.netMinor - a.netMinor);
  const winnerId = sortedPlayers[0]?.netMinor && sortedPlayers[0].netMinor > 0 ? sortedPlayers[0].id : null;

  return (
    <AppShell header={header}>
      <div className="flex flex-col gap-4 p-4">
        <p className="text-center text-body-sm text-fg-tertiary">
          {formatDateShort(new Date(summary.finishedAt))} · {t('home.playerCount', { count: summary.playerCount })}
        </p>

        <section className="flex flex-col gap-1.5">
          {sortedPlayers.map((p) => (
            <div
              key={p.id}
              className={[
                'flex items-center justify-between rounded-lg px-3.5 py-3',
                p.id === winnerId
                  ? 'bg-[image:var(--gradient-card-positive)] border border-positive/25'
                  : 'bg-surface-card',
              ].join(' ')}
            >
              <span className="text-body font-semibold">{p.displayName}</span>
              <Money value={p.netMinor} currency={summary.currency} showSign size="lg" className="font-bold" />
            </div>
          ))}
        </section>

        <section className="flex flex-col gap-2">
          {transfers.length === 0 ? (
            <p className="text-body-sm text-fg-disabled">{t('summary.noTransfers')}</p>
          ) : (
            transfers.map((transfer) => (
              <TransferRow
                key={`${transfer.fromName}-${transfer.toName}-${transfer.orderIndex}`}
                mode="read"
                fromName={transfer.fromName}
                toName={transfer.toName}
                amountMinor={transfer.amountMinor}
                currency={summary.currency}
              />
            ))
          )}
        </section>

        <p className="text-center text-caption text-fg-disabled">{t('pastGame.auditLogUnavailable')}</p>

        <Button variant="secondary" fullWidth onClick={handleExport}>
          {t('pastGame.exportGame')}
        </Button>
      </div>
    </AppShell>
  );
}
