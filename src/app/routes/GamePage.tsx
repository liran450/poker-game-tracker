import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { AppShell } from '@components/AppShell';
import { Button } from '@components/shared/Button';
import { IconButton } from '@components/shared/IconButton';
import { AddPlayersSheet } from '@features/game/AddPlayersSheet';
import { PlayerActionsSheet } from '@features/game/PlayerActionsSheet';
import { PlayerRow } from '@features/game/PlayerRow';
import { addPlayersToGame, removePlayer, renamePlayer } from '@core/offline/gameActions';
import { listRecentPlayers } from '@core/offline/recentPlayers';
import { useGame } from '@core/offline/useGame';
import { dedupeDisplayNames, renderPlayerName } from '@core/players';
import { formatChipValue, formatMoney, minor, owed } from '@core/money';

export function GamePage() {
  const { t, i18n } = useTranslation();
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const game = useGame(gameId ?? '');
  const recentNames =
    useLiveQuery(() => listRecentPlayers().then((players) => players.map((p) => p.name)), []) ?? [];
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [actionsForPlayerId, setActionsForPlayerId] = useState<string | null>(null);

  if (!gameId || !game?.record) return null;

  const { record, state } = game;
  const locale = i18n.resolvedLanguage ?? 'he';
  const currency = record.currencyCode ?? 'ILS';
  const buyAmountMinor = minor(record.buyAmountMinor ?? 0);
  const chipsPerBuy = record.chipsPerBuy ?? 1;

  const activePlayers = [...state.players.values()].filter((p) => !p.isRemoved);
  const displayNames = dedupeDisplayNames(
    activePlayers.map((p) => ({ id: p.id, name: renderPlayerName(p), order: p.seatOrder })),
  );
  const sortedPlayers = [...activePlayers].sort((a, b) => a.seatOrder - b.seatOrder);
  const actionsPlayer = actionsForPlayerId ? state.players.get(actionsForPlayerId) : undefined;

  return (
    <AppShell
      header={
        <div className="flex flex-col gap-1 px-2 py-3">
          <div className="flex items-center gap-2">
            <IconButton label={t('game.backToHome')} onClick={() => void navigate('/')}>
              {'✕'}
            </IconButton>
            <h1 className="flex-1 truncate text-center text-heading font-bold">{record.name}</h1>
            <span className="size-12" aria-hidden="true" />
          </div>
          <p className="text-center text-body-sm text-fg-tertiary">
            {t('game.headerSummary', {
              chipValue: formatChipValue(buyAmountMinor, chipsPerBuy, locale, currency),
              buyAmount: formatMoney(buyAmountMinor, { locale, currency }),
              count: sortedPlayers.length,
            })}
          </p>
        </div>
      }
      footer={
        <div className="px-4 py-3">
          <Button variant="primary" fullWidth onClick={() => setAddSheetOpen(true)}>
            {t('game.addPlayer')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-2 p-4">
        {sortedPlayers.map((player) => (
          <PlayerRow
            key={player.id}
            name={displayNames.get(player.id) ?? ''}
            amountOwed={owed(player.buysCount, buyAmountMinor)}
            currency={currency}
            isLateJoiner={state.startedAt !== null && player.joinedAt > state.startedAt}
            onOpenActions={() => setActionsForPlayerId(player.id)}
          />
        ))}
      </div>

      <AddPlayersSheet
        open={addSheetOpen}
        onClose={() => setAddSheetOpen(false)}
        onCommit={(names) => void addPlayersToGame(gameId, names)}
        recentNames={recentNames}
      />

      {actionsPlayer && (
        <PlayerActionsSheet
          open={actionsForPlayerId !== null}
          onClose={() => setActionsForPlayerId(null)}
          playerName={displayNames.get(actionsPlayer.id) ?? ''}
          hasBuyIns={actionsPlayer.buysCount > 0}
          onRename={(name) => void renamePlayer(gameId, actionsPlayer.id, name)}
          onRemove={() => void removePlayer(gameId, actionsPlayer.id)}
        />
      )}
    </AppShell>
  );
}
