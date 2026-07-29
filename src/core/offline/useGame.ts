import { useLiveQuery } from 'dexie-react-hooks';
import { fold, type GameState } from '../events';
import { db, type CachedGameRecord } from './db';

export interface UseGameResult {
  readonly record: CachedGameRecord | undefined;
  readonly state: GameState;
}

/** One game's cached record and folded state, reactive to both tables. */
export function useGame(gameId: string): UseGameResult | undefined {
  return useLiveQuery(async () => {
    const record = await db.games.get(gameId);
    const events = await db.events.where('gameId').equals(gameId).toArray();
    return { record, state: fold(events) };
  }, [gameId]);
}
