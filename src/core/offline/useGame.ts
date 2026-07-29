import { useLiveQuery } from 'dexie-react-hooks';
import { fold, type GameEvent, type GameState } from '../events';
import { db, type CachedGameRecord } from './db';

export interface UseGameResult {
  readonly record: CachedGameRecord | undefined;
  readonly state: GameState;
  /** The raw log, for the audit drawer and for looking up an event to undo — never filtered or sorted. */
  readonly events: readonly GameEvent[];
}

/** One game's cached record, raw event log and folded state, reactive to both tables. */
export function useGame(gameId: string): UseGameResult | undefined {
  return useLiveQuery(async () => {
    const record = await db.games.get(gameId);
    const events = await db.events.where('gameId').equals(gameId).toArray();
    return { record, state: fold(events), events };
  }, [gameId]);
}
