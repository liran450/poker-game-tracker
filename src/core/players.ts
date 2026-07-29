import type { PlayerState } from './events';

/**
 * The name shown for a row is composed, not stored (03-data-model.md#naming-and-nicknames):
 * a guest shows their free-text name; a registered player shows their account's display name,
 * or `nickname (display name)` once a per-game nickname is set. The account identity is never
 * overwritten by a nickname — this is a game about money, and the row has to stay unambiguous.
 *
 * `getAccountDisplayName` is unused until accounts exist (step 12) — every player today is a
 * guest, but the composition rule is written once, correctly, rather than assumed away.
 */
export function renderPlayerName(
  player: Pick<PlayerState, 'userId' | 'guestName' | 'nickname'>,
  getAccountDisplayName?: (userId: string) => string | undefined,
): string {
  if (player.userId === null) {
    return player.guestName ?? '';
  }
  const accountName = getAccountDisplayName?.(player.userId) ?? '';
  return player.nickname ? `${player.nickname} (${accountName})` : accountName;
}

/**
 * Assigns the `(1)`, `(2)` suffixes to duplicate rendered names
 * (03-data-model.md#game_players — "uniqueness is per game, applied to the rendered name, and the
 * suffix goes on the *new* entry"). Always recomputed from the currently active player list rather
 * than stored, so a rename or a removal changes who — if anyone — is suffixed, automatically.
 *
 * `order` should be a stable insertion order (seat order, or join time) so "new entry" is
 * well-defined regardless of iteration order.
 */
export function dedupeDisplayNames(
  entries: readonly { id: string; name: string; order: number }[],
): ReadonlyMap<string, string> {
  const sorted = [...entries].sort((a, b) => a.order - b.order);
  const seenCounts = new Map<string, number>();
  const result = new Map<string, string>();

  for (const entry of sorted) {
    const count = seenCounts.get(entry.name) ?? 0;
    result.set(entry.id, count === 0 ? entry.name : `${entry.name} (${count})`);
    seenCounts.set(entry.name, count + 1);
  }

  return result;
}
