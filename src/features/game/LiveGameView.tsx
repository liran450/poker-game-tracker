import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { AppShell } from '@components/AppShell';
import { AnnouncementBanner } from '@components/AnnouncementBanner';
import { BottomSheet } from '@components/BottomSheet';
import { Snackbar } from '@components/Snackbar';
import { SyncIndicator } from '@components/SyncIndicator';
import { Button } from '@components/shared/Button';
import { IconButton } from '@components/shared/IconButton';
import { AddPlayersSheet } from './AddPlayersSheet';
import { AuditLogDrawer } from './AuditLogDrawer';
import { BuyInBatchBar } from './BuyInBatchBar';
import { CashPaidSheet } from './CashPaidSheet';
import { EndGameConfirmSheet } from './EndGameConfirmSheet';
import { HandOverHostSheet, TakeOverHostConfirm } from './HostControlSheets';
import { PendingRequestsSheet } from './PendingRequestsSheet';
import { PlayerActionsSheet } from './PlayerActionsSheet';
import { PlayerRow } from './PlayerRow';
import { PotBanner } from './PotBanner';
import { PotResolutionSheet } from './PotResolutionSheet';
import { SettleSheet } from './SettleSheet';
import { SharedCostsSheet } from './SharedCostsSheet';
import { ShareSheet } from './ShareSheet';
import { useBuyInBatchStore, type BuyInBatchEntry } from './buyInBatch';
import { formatBuyInChange } from './buyInText';
import { formatDateShort, formatTimeOfDay } from './time';
import { buildAuditLog } from '@core/auditLog';
import {
  addBuyIn,
  addPlayersToGame,
  addSharedCost,
  beginSettlement,
  editSettledChips,
  removeBuyIn,
  removePlayer,
  removeSharedCost,
  renamePlayer,
  reopenPlayer,
  setCashPaid,
  setPlayerNickname,
  settlePlayer,
  setUnaccounted,
  undoEvent,
  updateSharedCost,
} from '@core/offline/gameActions';
import { listRecentPlayers } from '@core/offline/recentPlayers';
import { useGame } from '@core/offline/useGame';
import { useSyncState } from '@core/offline/useSyncState';
import { useAccountNames } from '../../hooks/useAccountNames';
import { useBeforeUnloadGuard } from '../../hooks/useBeforeUnloadGuard';
import { useGroupMemberOptions } from '../../hooks/useGroupMemberOptions';
import { useElapsedTime } from '../../hooks/useElapsedTime';
import { useLiveGameSync } from '../../hooks/useLiveGameSync';
import { useSession } from '../../hooks/useSession';
import { useWakeLock } from '../../hooks/useWakeLock';
import { dedupeDisplayNames, firstBuyInTimestamp, renderPlayerName } from '@core/players';
import { add, formatChipValue, formatMoney, minor, sum, type Minor } from '@core/money';
import { computePotStatus } from '@core/pot';
import { getHostLastSyncedAt, handOverHost, takeOverHost } from '@data/hostControl';
import { listPendingClaims } from '@data/claims';
import { listPendingJoinRequests } from '@data/joinRequests';

const PENDING_REQUESTS_POLL_MS = 20_000;

type CashPaidTarget = { playerId: string; name: string; currentAmountMinor: Minor };
type SettleTarget = { playerId: string; name: string; mode: 'settle' | 'edit'; initialChips: number };

function hapticTick(): void {
  if ('vibrate' in navigator) navigator.vibrate(10);
}

export interface LiveGameViewProps {
  gameId: string;
}

/**
 * The live game screen — buy-ins, cash paid, settling, shared costs, the pot
 * safeguard, the audit log. Everything reachable while `state.status` is
 * `setup` or `active`; `settling`/`finished` are separate screens
 * (`SettlementRoute`/`SummaryRoute`) that `GamePage` dispatches to instead.
 */
export function LiveGameView({ gameId }: LiveGameViewProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const session = useSession();
  const game = useGame(gameId);
  const recentNames =
    useLiveQuery(() => listRecentPlayers().then((players) => players.map((p) => p.name)), []) ?? [];
  const groupMemberOptions = useGroupMemberOptions(game?.record?.groupId ?? null, session.cloudConfigured);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [actionsForPlayerId, setActionsForPlayerId] = useState<string | null>(null);
  const [cashPaidTarget, setCashPaidTarget] = useState<CashPaidTarget | null>(null);
  const [settleTarget, setSettleTarget] = useState<SettleTarget | null>(null);
  const [pendingRemovalPlayerId, setPendingRemovalPlayerId] = useState<string | null>(null);
  const [gameMenuOpen, setGameMenuOpen] = useState(false);
  const [sharedCostsOpen, setSharedCostsOpen] = useState(false);
  const [potResolutionOpen, setPotResolutionOpen] = useState(false);
  const [auditLogOpen, setAuditLogOpen] = useState(false);
  const [endGameOpen, setEndGameOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [pendingRequestsOpen, setPendingRequestsOpen] = useState(false);
  const [handOverOpen, setHandOverOpen] = useState(false);
  const [takeOverOpen, setTakeOverOpen] = useState(false);
  const [hostLastSyncedAt, setHostLastSyncedAt] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [takeoverAnnouncement, setTakeoverAnnouncement] = useState<string | null>(null);

  const batch = useBuyInBatchStore();
  const sync = useSyncState(gameId);
  useWakeLock(game?.state.status === 'active');
  useBeforeUnloadGuard(sync.pendingCount > 0);
  useLiveGameSync(gameId);
  const elapsed = useElapsedTime(game?.state.startedAt ?? null);

  const isHost = session.cloudConfigured && game?.state.hostId !== null && game?.state.hostId === session.user?.id;
  const viewerIds = game ? [...game.state.viewers] : [];
  const playerAccountIds = game
    ? [...game.state.players.values()].flatMap((p) => (p.userId !== null ? [p.userId] : []))
    : [];
  // Every account-linked identity this screen might need to render a name for — a registered
  // player (seated via a claim, an approved join request, or a group-member pick, docs/build/
  // PLAN.md step 14) is exactly as unresolvable from local state as a viewer already was, since
  // `renderPlayerName`'s account path (`core/players.ts`) needs a real lookup, not just an id.
  const accountIdsToResolve = [...new Set([...viewerIds, ...playerAccountIds])];
  const accountNames = useAccountNames(accountIdsToResolve, session.cloudConfigured);
  const seenHostTakeoverEventIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!isHost) return;
    let cancelled = false;
    const refresh = () => {
      void Promise.all([listPendingJoinRequests(gameId), listPendingClaims(gameId)]).then(
        ([requests, claims]) => {
          if (!cancelled) setPendingCount(requests.length + claims.length);
        },
      );
    };
    refresh();
    const interval = setInterval(refresh, PENDING_REQUESTS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isHost, session.cloudConfigured, gameId, pendingRequestsOpen]);

  useEffect(() => {
    if (!game) return;
    const takeoverIds = game.events.filter((e) => e.type === 'host_taken_over').map((e) => e.clientEventId);

    // First render: remember every takeover that already happened before this view opened,
    // without announcing any of them — the banner is for takeovers witnessed live, not history.
    if (seenHostTakeoverEventIds.current === null) {
      seenHostTakeoverEventIds.current = new Set(takeoverIds);
      return;
    }

    const newEvent = game.events.find(
      (e) => e.type === 'host_taken_over' && !seenHostTakeoverEventIds.current!.has(e.clientEventId),
    );
    if (!newEvent) return;
    seenHostTakeoverEventIds.current = new Set(takeoverIds);

    const newHostPlayer = [...game.state.players.values()].find((p) => p.userId === newEvent.actorId);
    const newHostName = newHostPlayer
      ? renderPlayerName(newHostPlayer, (userId) => accountNames.get(userId))
      : accountNames.get(newEvent.actorId);
    setTakeoverAnnouncement(
      t('hostControl.announcement', { name: newHostName ?? t('share.unknownViewer') }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.events.length]);

  if (!game?.record) return null;

  const { record, state, events } = game;
  const locale = i18n.resolvedLanguage ?? 'he';
  const currency = record.currencyCode ?? 'ILS';
  const buyAmountMinor = minor(record.buyAmountMinor ?? 0);
  const chipsPerBuy = record.chipsPerBuy ?? 1;

  const resolveAccountName = (userId: string): string | undefined => accountNames.get(userId);
  const activePlayers = [...state.players.values()].filter((p) => !p.isRemoved);
  const displayNames = dedupeDisplayNames(
    activePlayers.map((p) => ({ id: p.id, name: renderPlayerName(p, resolveAccountName), order: p.seatOrder })),
  );
  const sortedPlayers = [...activePlayers].sort((a, b) => a.seatOrder - b.seatOrder);
  const actionsPlayer = actionsForPlayerId ? state.players.get(actionsForPlayerId) : undefined;
  const pendingRemovalPlayer = pendingRemovalPlayerId ? state.players.get(pendingRemovalPlayerId) : undefined;

  const potStatus = computePotStatus(activePlayers, buyAmountMinor, chipsPerBuy, state.unaccountedMinor);
  const firstBuyInAt = firstBuyInTimestamp(events);
  const sharedCosts = [...state.sharedCosts.values()];
  const sharedCostsTotal = sum(sharedCosts.map((c) => c.amountMinor));
  const totalCashPaid = sum(activePlayers.map((p) => p.cashPaidMinor));
  const unsettledPlayers = activePlayers.filter((p) => !p.isSettled);

  const currentUserId = session.user?.id ?? null;
  const isSignedInPlayerOrViewer =
    currentUserId !== null &&
    (activePlayers.some((p) => p.userId === currentUserId) || state.viewers.has(currentUserId));
  const currentHostPlayer = activePlayers.find((p) => p.userId === state.hostId);
  const currentHostName =
    (state.hostId !== null ? accountNames.get(state.hostId) : undefined) ??
    (currentHostPlayer ? renderPlayerName(currentHostPlayer, resolveAccountName) : t('share.unknownViewer'));
  const handOverTargets = [
    ...activePlayers
      .filter((p) => p.userId !== null && p.userId !== state.hostId)
      .map((p) => ({ userId: p.userId!, name: displayNames.get(p.id) ?? renderPlayerName(p, resolveAccountName) })),
    ...[...state.viewers]
      .filter((id) => id !== state.hostId)
      .map((id) => ({ userId: id, name: accountNames.get(id) ?? t('share.unknownViewer') })),
  ];

  // Chip units, not money — how many chips are still uncounted across the
  // table, used only for the settle sheet's soft "exceeds remaining" warning.
  const totalBoughtChips = activePlayers.reduce((chips, p) => chips + p.buysCount * chipsPerBuy, 0);
  function chipsRemainingExcluding(playerId: string): number {
    const claimedByOthers = activePlayers
      .filter((p) => p.isSettled && p.chipsFinal !== null && p.id !== playerId)
      .reduce((chips, p) => chips + (p.chipsFinal ?? 0), 0);
    return totalBoughtChips - claimedByOthers;
  }

  const handleIncrement = async (playerId: string): Promise<void> => {
    const event = await addBuyIn(gameId, playerId);
    hapticTick();
    batch.addTap(playerId, 1, event);
  };

  const handleDecrement = async (playerId: string): Promise<void> => {
    const player = state.players.get(playerId);
    if (!player || player.buysCount <= 0) return;
    const event = await removeBuyIn(gameId, playerId);
    hapticTick();
    batch.addTap(playerId, -1, event);
    if (player.buysCount === 1) setPendingRemovalPlayerId(playerId);
  };

  const undoBatchEntries = async (entries: readonly BuyInBatchEntry[]): Promise<void> => {
    for (const entry of entries) {
      for (const event of entry.events) {
        await undoEvent(event);
      }
    }
    batch.clear();
  };

  const singleEntry = batch.entries.length === 1 ? (batch.entries[0] ?? null) : null;
  const showResultingCount = singleEntry !== null && singleEntry.events.length === 1;

  return (
    <AppShell
      header={
        <div className="flex flex-col gap-1 px-2 py-3">
          <div className="flex items-center gap-2">
            <IconButton label={t('game.backToHome')} onClick={() => void navigate('/')}>
              {'✕'}
            </IconButton>
            <h1 className="flex-1 truncate text-center text-heading font-bold">
              {record.name}
              {record.isPrivate && (
                <span className="ms-2 rounded-pill bg-surface-raised px-2 py-0.5 align-middle text-caption font-semibold text-fg-tertiary">
                  {t('game.privateBadge')}
                </span>
              )}
            </h1>
            <div className="flex items-center gap-1">
              <span className="text-caption tabular-nums text-fg-tertiary" dir="ltr">
                {elapsed}
              </span>
              <SyncIndicator state={sync.state} pendingCount={sync.pendingCount} />
              <div className="relative">
                <IconButton label={t('game.menu')} onClick={() => setGameMenuOpen(true)}>
                  {'⋯'}
                </IconButton>
                {isHost && pendingCount > 0 && (
                  <span className="pointer-events-none absolute -top-1 -end-1 flex size-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-on-accent">
                    {pendingCount}
                  </span>
                )}
              </div>
            </div>
          </div>
          <p className="text-center text-body-sm text-fg-tertiary">
            {t('game.headerSummary', {
              chipValue: formatChipValue(buyAmountMinor, chipsPerBuy, locale, currency),
              buyAmount: formatMoney(buyAmountMinor, { locale, currency }),
              count: sortedPlayers.length,
            })}
          </p>
          <PotBanner
            status={potStatus}
            currency={currency}
            locale={locale}
            onOpenResolution={() => setPotResolutionOpen(true)}
          />
          {sharedCosts.length > 0 && (
            <p className="text-center text-body-sm text-fg-tertiary">
              {t('sharedCosts.summaryLine', { amount: formatMoney(sharedCostsTotal, { locale, currency }) })}
            </p>
          )}
          {takeoverAnnouncement && (
            <AnnouncementBanner onDismiss={() => setTakeoverAnnouncement(null)}>
              {takeoverAnnouncement}
            </AnnouncementBanner>
          )}
        </div>
      }
      footer={
        <div className="flex gap-2 px-4 py-3">
          <Button variant="primary" fullWidth onClick={() => setAddSheetOpen(true)}>
            {t('game.addPlayer')}
          </Button>
          {/* share_links is is_host-only at the RLS layer for every game, private or not
              (03-data-model.md#row-level-security's table; see docs/build/NOTES.md for the
              tension with 04-ux-spec.md's private-game section, which the RLS layer wins). */}
          {session.cloudConfigured && isHost && (
            <Button variant="secondary" onClick={() => setShareOpen(true)}>
              {t('ui.share')}
            </Button>
          )}
          <Button variant="secondary" onClick={() => setAuditLogOpen(true)}>
            {t('auditLog.actionBarLabel')}
          </Button>
          <Button variant="secondary" onClick={() => setEndGameOpen(true)}>
            {t('game.endGame')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-2 p-4">
        {sortedPlayers.map((player) => (
          <PlayerRow
            key={player.id}
            name={displayNames.get(player.id) ?? ''}
            buysCount={player.buysCount}
            cashPaidMinor={player.cashPaidMinor}
            buyAmountMinor={buyAmountMinor}
            chipsPerBuy={chipsPerBuy}
            currency={currency}
            isSettled={player.isSettled}
            chipsFinal={player.chipsFinal}
            lateJoinedAt={
              firstBuyInAt !== null && player.joinedAt > firstBuyInAt
                ? formatTimeOfDay(player.joinedAt)
                : null
            }
            onIncrement={() => void handleIncrement(player.id)}
            onDecrement={() => void handleDecrement(player.id)}
            onOpenCashPaid={() =>
              setCashPaidTarget({
                playerId: player.id,
                name: displayNames.get(player.id) ?? '',
                currentAmountMinor: player.cashPaidMinor,
              })
            }
            onOpenActions={() => setActionsForPlayerId(player.id)}
          />
        ))}
      </div>

      <AddPlayersSheet
        open={addSheetOpen}
        onClose={() => setAddSheetOpen(false)}
        onCommit={(names, picks) => void addPlayersToGame(gameId, names, picks)}
        recentNames={recentNames}
        groupMembers={groupMemberOptions}
      />

      {actionsPlayer && (
        <PlayerActionsSheet
          open={actionsForPlayerId !== null}
          onClose={() => setActionsForPlayerId(null)}
          playerName={displayNames.get(actionsPlayer.id) ?? ''}
          hasBuyIns={actionsPlayer.buysCount > 0}
          isSettled={actionsPlayer.isSettled}
          isRegistered={actionsPlayer.userId !== null}
          currentNickname={actionsPlayer.nickname}
          onRename={(name) => void renamePlayer(gameId, actionsPlayer.id, name)}
          onSetNickname={(nickname) => void setPlayerNickname(gameId, actionsPlayer.id, nickname)}
          onRemove={() => void removePlayer(gameId, actionsPlayer.id)}
          onSettle={() =>
            setSettleTarget({
              playerId: actionsPlayer.id,
              name: displayNames.get(actionsPlayer.id) ?? '',
              mode: 'settle',
              initialChips: 0,
            })
          }
          onReopen={() => void reopenPlayer(gameId, actionsPlayer.id)}
          onEditChips={() =>
            setSettleTarget({
              playerId: actionsPlayer.id,
              name: displayNames.get(actionsPlayer.id) ?? '',
              mode: 'edit',
              initialChips: actionsPlayer.chipsFinal ?? 0,
            })
          }
          onOpenCashPaid={() =>
            setCashPaidTarget({
              playerId: actionsPlayer.id,
              name: displayNames.get(actionsPlayer.id) ?? '',
              currentAmountMinor: actionsPlayer.cashPaidMinor,
            })
          }
        />
      )}

      {cashPaidTarget && (
        <CashPaidSheet
          open
          onClose={() => setCashPaidTarget(null)}
          playerName={cashPaidTarget.name}
          currentAmountMinor={cashPaidTarget.currentAmountMinor}
          buyAmountMinor={buyAmountMinor}
          currency={currency}
          locale={locale}
          onSave={(amountMinor) => void setCashPaid(gameId, cashPaidTarget.playerId, amountMinor)}
        />
      )}

      {settleTarget && (
        <SettleSheet
          open
          onClose={() => setSettleTarget(null)}
          playerName={settleTarget.name}
          mode={settleTarget.mode}
          initialChips={settleTarget.initialChips}
          buysCount={state.players.get(settleTarget.playerId)?.buysCount ?? 0}
          buyAmountMinor={buyAmountMinor}
          chipsPerBuy={chipsPerBuy}
          currency={currency}
          locale={locale}
          chipsRemainingInPlay={chipsRemainingExcluding(settleTarget.playerId)}
          onSave={(chips) =>
            void (settleTarget.mode === 'settle'
              ? settlePlayer(gameId, settleTarget.playerId, chips)
              : editSettledChips(gameId, settleTarget.playerId, chips))
          }
        />
      )}

      {pendingRemovalPlayer && (
        <BottomSheet
          open
          onClose={() => setPendingRemovalPlayerId(null)}
          title={t('players.zeroDecrementTitle')}
        >
          <div className="flex flex-col gap-2.5">
            <p className="text-body-sm text-fg-secondary">
              {t('players.zeroDecrementPrompt', { name: displayNames.get(pendingRemovalPlayer.id) ?? '' })}
            </p>
            <Button
              variant="destructive"
              fullWidth
              onClick={() => {
                void removePlayer(gameId, pendingRemovalPlayer.id);
                setPendingRemovalPlayerId(null);
              }}
            >
              {t('players.remove')}
            </Button>
            <Button variant="ghost" fullWidth onClick={() => setPendingRemovalPlayerId(null)}>
              {t('ui.cancel')}
            </Button>
          </div>
        </BottomSheet>
      )}

      <BottomSheet open={gameMenuOpen} onClose={() => setGameMenuOpen(false)} title={t('game.menu')}>
        <div className="flex flex-col gap-2.5">
          <Button
            variant="secondary"
            fullWidth
            onClick={() => {
              setGameMenuOpen(false);
              setSharedCostsOpen(true);
            }}
          >
            {t('sharedCosts.title')}
          </Button>
          {isHost && (
            <>
              <Button
                variant="secondary"
                fullWidth
                onClick={() => {
                  setGameMenuOpen(false);
                  setPendingRequestsOpen(true);
                }}
              >
                {pendingCount > 0
                  ? t('pendingRequests.title') + ` (${pendingCount})`
                  : t('pendingRequests.title')}
              </Button>
              <Button
                variant="secondary"
                fullWidth
                onClick={() => {
                  setGameMenuOpen(false);
                  setHandOverOpen(true);
                }}
              >
                {t('hostControl.menuHandOver')}
              </Button>
            </>
          )}
          {session.cloudConfigured && !isHost && isSignedInPlayerOrViewer && (
            <Button
              variant="secondary"
              fullWidth
              onClick={() => {
                setGameMenuOpen(false);
                void getHostLastSyncedAt(gameId).then(setHostLastSyncedAt);
                setTakeOverOpen(true);
              }}
            >
              {t('hostControl.menuTakeOver')}
            </Button>
          )}
        </div>
      </BottomSheet>

      <SharedCostsSheet
        open={sharedCostsOpen}
        onClose={() => setSharedCostsOpen(false)}
        costs={sharedCosts}
        players={sortedPlayers.map((p) => ({ id: p.id, name: displayNames.get(p.id) ?? '' }))}
        currency={currency}
        locale={locale}
        onAdd={(input) => void addSharedCost(gameId, input)}
        onUpdate={(costId, input) => void updateSharedCost(gameId, costId, input)}
        onRemove={(costId) => void removeSharedCost(gameId, costId)}
      />

      <PotResolutionSheet
        open={potResolutionOpen}
        onClose={() => setPotResolutionOpen(false)}
        discrepancyMinor={potStatus.discrepancyMinor}
        currency={currency}
        settledPlayers={activePlayers
          .filter((p) => p.isSettled && p.chipsFinal !== null && p.settledAt !== null)
          .map((p) => ({
            id: p.id,
            name: displayNames.get(p.id) ?? '',
            chipsFinal: p.chipsFinal!,
            settledAt: p.settledAt!,
          }))}
        onSelectPlayer={(playerId) => {
          setPotResolutionOpen(false);
          const player = state.players.get(playerId);
          if (!player) return;
          setSettleTarget({
            playerId,
            name: displayNames.get(playerId) ?? '',
            mode: 'edit',
            initialChips: player.chipsFinal ?? 0,
          });
        }}
        onAssignToHouse={() => {
          void setUnaccounted(gameId, add(state.unaccountedMinor, potStatus.discrepancyMinor));
          setPotResolutionOpen(false);
        }}
      />

      <AuditLogDrawer
        open={auditLogOpen}
        onClose={() => setAuditLogOpen(false)}
        entries={buildAuditLog(events)}
        playerNames={displayNames}
        currency={currency}
        locale={locale}
        onUndo={(entry) => {
          const original = events.find((e) => e.clientEventId === entry.id);
          if (original) void undoEvent(original);
        }}
      />

      <EndGameConfirmSheet
        open={endGameOpen}
        onClose={() => setEndGameOpen(false)}
        playerCount={sortedPlayers.length}
        totalPotMinor={totalCashPaid}
        sharedCostsMinor={sharedCostsTotal}
        currency={currency}
        locale={locale}
        unsettledPlayerNames={unsettledPlayers.map((p) => displayNames.get(p.id) ?? '')}
        hasPendingSync={sync.pendingCount > 0}
        discrepancyMinor={potStatus.discrepancyMinor}
        onConfirm={() => {
          setEndGameOpen(false);
          void beginSettlement(gameId);
        }}
      />

      {session.cloudConfigured && isHost && currentUserId !== null && (
        <ShareSheet
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          gameId={gameId}
          hostUserId={currentUserId}
          viewerUserIds={viewerIds}
          viewerNames={accountNames}
          isFinished={false}
          liveStatus={{
            gameName: record.name ?? '',
            date: formatDateShort(new Date()),
            buyAmountMinor,
            chipsPerBuy,
            currency,
            locale,
            totalMinor: totalCashPaid,
            players: activePlayers.map((p) => ({
              name: displayNames.get(p.id) ?? '',
              buysCount: p.buysCount,
              owedMinor: minor(p.buysCount * buyAmountMinor),
              cashPaidMinor: p.cashPaidMinor,
              isSettled: p.isSettled,
              chipsFinal: p.chipsFinal,
            })),
          }}
        />
      )}

      {session.cloudConfigured && isHost && (
        <PendingRequestsSheet
          open={pendingRequestsOpen}
          onClose={() => setPendingRequestsOpen(false)}
          gameId={gameId}
          playerNames={displayNames}
        />
      )}

      {session.cloudConfigured && isHost && (
        <HandOverHostSheet
          open={handOverOpen}
          onClose={() => setHandOverOpen(false)}
          targets={handOverTargets}
          onHandOver={(userId) => void handOverHost(gameId, userId)}
        />
      )}

      {session.cloudConfigured && !isHost && isSignedInPlayerOrViewer && (
        <TakeOverHostConfirm
          open={takeOverOpen}
          onClose={() => setTakeOverOpen(false)}
          onConfirm={() => void takeOverHost(gameId)}
          currentHostName={currentHostName}
          hostLastSyncedAt={hostLastSyncedAt}
          locale={locale}
        />
      )}

      {singleEntry && (
        <Snackbar
          key={batch.tapCount}
          open
          duration={3000}
          onClose={() => batch.clear()}
          onUndo={() => void undoBatchEntries([singleEntry])}
        >
          {formatBuyInChange(t, {
            name: displayNames.get(singleEntry.playerId) ?? '',
            deltaBuys: singleEntry.deltaBuys,
            showResultingCount,
            resultingBuysCount: state.players.get(singleEntry.playerId)?.buysCount ?? 0,
            buyAmountMinor,
            chipsPerBuy,
            currency,
            locale,
          })}
        </Snackbar>
      )}

      {batch.entries.length > 1 && (
        <BuyInBatchBar
          entries={batch.entries}
          playerNames={displayNames}
          buyAmountMinor={buyAmountMinor}
          chipsPerBuy={chipsPerBuy}
          currency={currency}
          locale={locale}
          onUndoAll={() => void undoBatchEntries(batch.entries)}
          onConfirm={() => batch.clear()}
        />
      )}
    </AppShell>
  );
}
