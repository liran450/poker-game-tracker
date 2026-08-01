import { useParams } from 'react-router';
import { LiveGameView } from '@features/game/LiveGameView';
import { PastGameResultsView } from '@features/game/PastGameResultsView';
import { SettlementRoute } from '@features/game/SettlementRoute';
import { SummaryRoute } from '@features/game/SummaryRoute';
import { useGame } from '@core/offline/useGame';

/**
 * Dispatches on `state.status` — the game's whole lifecycle lives at one
 * URL (`/#/game/:id`), never a separate route per phase, so a share link or
 * a bookmark keeps working no matter which screen the game has reached.
 *
 * `useGame` returns `undefined` while its Dexie query is still in flight —
 * genuinely no answer yet — and only afterward can `record` be trusted as
 * "really not on this device" (docs/build/PLAN.md step 16). That case falls
 * through to `PastGameResultsView`, the one path that still works for a
 * purged game or one this device never had at all: it reads the permanent
 * tables directly instead of a local fold.
 */
export function GamePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const game = useGame(gameId ?? '');

  if (!gameId || game === undefined) return null;
  if (!game.record) return <PastGameResultsView gameId={gameId} />;

  switch (game.state.status) {
    case 'settling':
      return <SettlementRoute gameId={gameId} />;
    case 'finished':
      return <SummaryRoute gameId={gameId} />;
    default:
      return <LiveGameView gameId={gameId} />;
  }
}
