import { useTranslation } from 'react-i18next';
import {
  computeBalances,
  computeReconciliation,
  computeSettlementProgress,
  settlementNodes,
  HOUSE_ID,
  POT_ID,
  type SettlementPlayerInput,
  type SettlementSharedCostInput,
} from '@core/settlement';
import { minor, type Minor } from '@core/money';
import { dedupeDisplayNames, renderPlayerName } from '@core/players';
import {
  addManualTransfer,
  deleteTransfer,
  editTransfer,
  finalizeGame,
  recomputeTransfers,
} from '@core/offline/gameActions';
import { useGame } from '@core/offline/useGame';
import { useAccountNames } from '../../hooks/useAccountNames';
import { useSession } from '../../hooks/useSession';
import { formatFinalSettlementText, representativeShare } from './shareText';
import { SettlementScreen } from './SettlementScreen';
import type { TransferPartyOption } from './TransferPartyPicker';

export interface SettlementRouteProps {
  gameId: string;
}

/** Wires the settlement/edit-mode screen to live game state and gameActions. */
export function SettlementRoute({ gameId }: SettlementRouteProps) {
  const { i18n } = useTranslation();
  const session = useSession();
  const game = useGame(gameId);
  const accountIds = game
    ? [...new Set([...game.state.players.values()].flatMap((p) => (p.userId !== null ? [p.userId] : [])))]
    : [];
  const accountNames = useAccountNames(accountIds, session.cloudConfigured);

  if (!game?.record) return null;
  const { record, state } = game;

  const locale = i18n.resolvedLanguage ?? 'he';
  const currency = record.currencyCode ?? 'ILS';
  const buyAmountMinor = minor(record.buyAmountMinor ?? 0);
  const chipsPerBuy = record.chipsPerBuy ?? 1;

  const activePlayers = [...state.players.values()].filter((p) => !p.isRemoved);
  const displayNames = dedupeDisplayNames(
    activePlayers.map((p) => ({
      id: p.id,
      name: renderPlayerName(p, (userId) => accountNames.get(userId)),
      order: p.seatOrder,
    })),
  );

  const settlementPlayers: SettlementPlayerInput[] = activePlayers.map((p) => ({
    id: p.id,
    seatOrder: p.seatOrder,
    buysCount: p.buysCount,
    cashPaidMinor: p.cashPaidMinor,
    chipsFinal: p.chipsFinal ?? 0,
  }));
  const sharedCosts: SettlementSharedCostInput[] = [...state.sharedCosts.values()].map((c) => ({
    id: c.id,
    amountMinor: c.amountMinor,
    paidByPlayerId: c.paidByPlayerId,
    shares: c.shares,
  }));

  const balances = computeBalances(
    settlementPlayers,
    sharedCosts,
    buyAmountMinor,
    chipsPerBuy,
    state.unaccountedMinor,
  );
  const nodes = settlementNodes(balances);
  const transfers = [...state.transfers.values()]
    .filter((t) => t.amountMinor > 0)
    .map((t) => ({ id: t.id, fromId: t.fromPlayerId, toId: t.toPlayerId, amountMinor: t.amountMinor }));
  const reconciliation = computeReconciliation(nodes, transfers);
  const progress = computeSettlementProgress(nodes, transfers);

  const partyNameById = new Map<string, string>();
  partyNameById.set(POT_ID, i18n.t('money.pot'));
  partyNameById.set(HOUSE_ID, i18n.t('money.unaccountedBucket'));
  for (const p of activePlayers) partyNameById.set(p.id, displayNames.get(p.id) ?? '');

  const partyOptions: TransferPartyOption[] = activePlayers.map((p) => ({
    id: p.id,
    name: displayNames.get(p.id) ?? '',
  }));

  const results = activePlayers.map((p) => {
    const b = balances.players.find((row) => row.playerId === p.id)!;
    return {
      id: p.id,
      name: displayNames.get(p.id) ?? '',
      netMinor: b.netMinor,
      sharedMinor: b.sharedMinor,
    };
  });

  const reconciliationRows = reconciliation.map((row) => ({
    ...row,
    name: partyNameById.get(row.nodeId) ?? row.nodeId,
  }));

  function handleShareText(): void {
    const text = formatFinalSettlementText(i18n.t.bind(i18n), {
      gameName: record.name ?? '',
      date: (state.startedAt ?? record.createdAt ?? '').slice(0, 10),
      buyAmountMinor,
      chipsPerBuy,
      playerCount: activePlayers.length,
      currency,
      locale,
      results: results.map((r) => ({ name: r.name, netMinor: r.netMinor })),
      sharedCosts: sharedCosts.map((c) => ({
        label: [...state.sharedCosts.values()].find((sc) => sc.id === c.id)?.label ?? '',
        amountMinor: c.amountMinor,
        perPersonMinor: representativeShare(c.shares),
      })),
      transfers: transfers.map((t) => ({
        fromId: t.fromId,
        fromName: partyNameById.get(t.fromId) ?? '',
        toName: partyNameById.get(t.toId) ?? '',
        amountMinor: t.amountMinor,
      })),
    });
    if (navigator.share) {
      void navigator.share({ text }).catch(() => void navigator.clipboard.writeText(text));
    } else {
      void navigator.clipboard.writeText(text);
    }
  }

  function handleFinish(): void {
    void finalizeGame(gameId, {
      name: record.name ?? '',
      playedOn: (state.startedAt ?? record.createdAt ?? '').slice(0, 10),
      currency,
      isPrivate: record.isPrivate ?? false,
    });
  }

  return (
    <SettlementScreen
      gameName={record.name ?? ''}
      currency={currency}
      locale={locale}
      results={results}
      partyOptions={partyOptions}
      partyNameById={partyNameById}
      transfers={transfers}
      reconciliationRows={reconciliationRows}
      assignedMinor={progress.assignedMinor}
      totalToMoveMinor={progress.totalToMoveMinor}
      isComplete={progress.isComplete}
      onEditParty={(transferId, side, newId) => {
        const current = state.transfers.get(transferId);
        if (!current) return;
        const fromId = side === 'from' ? newId : current.fromPlayerId;
        const toId = side === 'to' ? newId : current.toPlayerId;
        void editTransfer(gameId, transferId, fromId, toId, current.amountMinor);
      }}
      onEditAmount={(transferId, amountMinor: Minor) => {
        const current = state.transfers.get(transferId);
        if (!current) return;
        void editTransfer(gameId, transferId, current.fromPlayerId, current.toPlayerId, amountMinor);
      }}
      onDeleteTransfer={(transferId) => {
        const current = state.transfers.get(transferId);
        if (!current) return;
        void deleteTransfer(gameId, transferId, current.fromPlayerId, current.toPlayerId);
      }}
      onAddTransfer={() => {
        const [first, second] = activePlayers;
        if (!first) return;
        void addManualTransfer(gameId, first.id, (second ?? first).id, minor(0));
      }}
      onRecompute={() => {
        void recomputeTransfers(
          gameId,
          transfers.map((t) => ({ id: t.id, fromPlayerId: t.fromId, toPlayerId: t.toId })),
        );
      }}
      onShareText={handleShareText}
      onFinish={handleFinish}
    />
  );
}
