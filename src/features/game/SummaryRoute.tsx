import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  computeBalances,
  HOUSE_ID,
  POT_ID,
  type SettlementPlayerInput,
  type SettlementSharedCostInput,
} from '@core/settlement';
import { minor } from '@core/money';
import { dedupeDisplayNames, renderPlayerName } from '@core/players';
import { reopenGame } from '@core/offline/gameActions';
import { useGame } from '@core/offline/useGame';
import { useAccountNames } from '../../hooks/useAccountNames';
import { useReopenWindow } from '../../hooks/useReopenWindow';
import { useSession } from '../../hooks/useSession';
import { formatFinalSettlementText, representativeShare } from './shareText';
import { formatDateShort } from './time';
import { SummaryScreen } from './SummaryScreen';

export interface SummaryRouteProps {
  gameId: string;
}

/**
 * Wires the post-settlement summary screen to live game state
 * (04-ux-spec.md#summary-screen-after-settlement). Reads from `state`, not
 * the stored snapshot (`db.snapshots`) — the snapshot exists so statistics
 * and a purged game's results card keep working after the live rows are
 * gone (03-data-model.md#permanent-tables), which is step 16's concern, not
 * this screen's; `PlayerResultSnapshot` deliberately carries no live player
 * id to join transfers against (matches the real schema), so reading live
 * state here — still fully populated immediately after finalising — is
 * both simpler and correct for the window this screen actually serves.
 */
export function SummaryRoute({ gameId }: SummaryRouteProps) {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const session = useSession();
  const game = useGame(gameId);
  const reopenWindow = useReopenWindow(game?.state.endedAt ?? null);
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

  const partyNameById = new Map<string, string>();
  partyNameById.set(POT_ID, i18n.t('money.pot'));
  partyNameById.set(HOUSE_ID, i18n.t('money.unaccountedBucket'));
  for (const p of activePlayers) partyNameById.set(p.id, displayNames.get(p.id) ?? '');

  const results = activePlayers.map((p) => {
    const b = balances.players.find((row) => row.playerId === p.id)!;
    return { id: p.id, name: displayNames.get(p.id) ?? '', netMinor: b.netMinor, sharedMinor: b.sharedMinor };
  });

  const transfers = [...state.transfers.values()]
    .filter((t) => t.amountMinor > 0)
    .map((t) => ({
      fromId: t.fromPlayerId,
      fromName: partyNameById.get(t.fromPlayerId) ?? '',
      toName: partyNameById.get(t.toPlayerId) ?? '',
      amountMinor: t.amountMinor,
    }));

  function handleShareOrCopy(action: 'share' | 'copy'): void {
    const text = formatFinalSettlementText(i18n.t.bind(i18n), {
      gameName: record.name ?? '',
      date: formatDateShort(state.endedAt ? new Date(state.endedAt) : new Date()),
      buyAmountMinor,
      chipsPerBuy,
      playerCount: activePlayers.length,
      currency,
      locale,
      results: results.map((r) => ({ name: r.name, netMinor: r.netMinor })),
      sharedCosts: [...state.sharedCosts.values()].map((c) => ({
        label: c.label,
        amountMinor: c.amountMinor,
        perPersonMinor: representativeShare(c.shares),
      })),
      transfers,
    });
    if (action === 'share' && navigator.share) {
      void navigator.share({ text }).catch(() => void navigator.clipboard.writeText(text));
    } else {
      void navigator.clipboard.writeText(text);
    }
  }

  return (
    <SummaryScreen
      gameName={record.name ?? ''}
      date={formatDateShort(state.endedAt ? new Date(state.endedAt) : new Date())}
      playerCount={activePlayers.length}
      currency={currency}
      results={results}
      transfers={transfers}
      canReopen={reopenWindow.canReopen}
      reopenHoursRemaining={reopenWindow.hoursRemaining}
      onShare={() => handleShareOrCopy('share')}
      onCopyTransfers={() => handleShareOrCopy('copy')}
      onReopen={() => void reopenGame(gameId)}
      onBack={() => void navigate('/')}
    />
  );
}
