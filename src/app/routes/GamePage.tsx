import { useParams } from 'react-router';
import { LiveGameView } from '@features/game/LiveGameView';
import { SettlementRoute } from '@features/game/SettlementRoute';
import { SummaryRoute } from '@features/game/SummaryRoute';
import { useGame } from '@core/offline/useGame';

/**
 * Dispatches on `state.status` — the game's whole lifecycle lives at one
 * URL (`/#/game/:id`), never a separate route per phase, so a share link or
 * a bookmark keeps working no matter which screen the game has reached.
 */
export function GamePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const game = useGame(gameId ?? '');

  if (!gameId || !game?.record) return null;

  switch (game.state.status) {
    case 'settling':
      return <SettlementRoute gameId={gameId} />;
    case 'finished':
      return <SummaryRoute gameId={gameId} />;
    default:
      return <LiveGameView gameId={gameId} />;
  }
}
