import { useLiveQuery } from 'dexie-react-hooks';
import { fold, type GameStatus } from '../events';
import { db } from './db';

export interface GameListEntry {
  readonly id: string;
  readonly name: string;
  readonly status: GameStatus;
  readonly playerCount: number;
  readonly buyAmountMinor: number;
  readonly chipsPerBuy: number;
  readonly currencyCode: string;
  readonly isPrivate: boolean;
  readonly updatedAt: string;
}

/**
 * The games list, newest-touched first. One `useLiveQuery` reading both
 * `games` and `events` — Dexie tracks every table a querier touches, so this
 * stays reactive to a rename, a new player, or a new game alike.
 */
export function useGamesList(): readonly GameListEntry[] {
  return (
    useLiveQuery(async () => {
      const cached = await db.games.orderBy('updatedAt').reverse().toArray();
      const entries: GameListEntry[] = [];

      for (const game of cached) {
        const events = await db.events.where('gameId').equals(game.id).toArray();
        const state = fold(events);
        const activePlayers = [...state.players.values()].filter((p) => !p.isRemoved);

        entries.push({
          id: game.id,
          name: game.name ?? '',
          status: state.status,
          playerCount: activePlayers.length,
          buyAmountMinor: game.buyAmountMinor ?? 0,
          chipsPerBuy: game.chipsPerBuy ?? 1,
          currencyCode: game.currencyCode ?? 'ILS',
          isPrivate: game.isPrivate ?? false,
          updatedAt: game.updatedAt,
        });
      }

      return entries;
    }, []) ?? []
  );
}
