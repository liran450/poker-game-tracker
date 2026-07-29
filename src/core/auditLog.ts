import { eventCompare, type EventType, type GameEvent, isGenericallyReversible } from './events';

export type AuditCategory = 'buy_ins' | 'settlements' | 'management';

const CATEGORY_BY_TYPE: Record<EventType, AuditCategory> = {
  buy_in_added: 'buy_ins',
  buy_in_removed: 'buy_ins',
  cash_paid_set: 'buy_ins',
  player_settled: 'settlements',
  player_reopened: 'settlements',
  chips_set: 'settlements',
  unaccounted_set: 'settlements',
  player_added: 'management',
  player_removed: 'management',
  player_renamed: 'management',
  nickname_set: 'management',
  shared_cost_added: 'management',
  shared_cost_removed: 'management',
  shared_cost_updated: 'management',
  game_started: 'management',
  game_settling: 'management',
  game_ended: 'management',
  game_reopened: 'management',
  host_changed: 'management',
  host_taken_over: 'management',
  viewer_added: 'management',
  viewer_removed: 'management',
  join_requested: 'management',
  join_approved: 'management',
  join_rejected: 'management',
  player_invited: 'management',
  claim_requested: 'management',
  claim_approved: 'management',
  claim_rejected: 'management',
  transfer_edited: 'management',
  note: 'management',
};

export interface AuditLogEntry {
  readonly id: string;
  readonly type: EventType;
  readonly at: string;
  readonly playerId: string | null;
  readonly actorId: string;
  readonly payload: unknown;
  readonly category: AuditCategory;
  readonly isUndone: boolean;
  readonly isReversible: boolean;
  /** The player's buy-in count immediately after this event — only set for buy_in_added/removed. */
  readonly buysAfter: number | null;
}

/**
 * Turns the raw event log into audit-log entries (04-ux-spec.md#audit-log-drawer-22).
 * Unlike `fold()`, this renders *every* event that happened, not just the ones
 * that are still active — the log's job is to settle arguments, so an undone
 * action has to stay visible (collapsed, per the spec) rather than vanish.
 *
 * Undo pairing follows the same rule as `fold()`: an event with `undoneBy` set
 * names its own inverse, and both ids collapse into a single entry (keyed by
 * the original) rather than two. The running buy-in count shown next to a
 * `buy_in_added`/`buy_in_removed` entry reflects the *active* sequence — an
 * undone tap doesn't shift the count shown on taps that come after it, even
 * though the undone tap itself still shows the count it would have produced.
 *
 * Returned in chronological order (oldest first); the drawer renders it
 * newest-first.
 */
export function buildAuditLog(events: readonly GameEvent[]): readonly AuditLogEntry[] {
  const sorted = [...events].sort(eventCompare);

  const undoneOriginalIds = new Set<string>();
  const inverseIds = new Set<string>();
  for (const event of sorted) {
    if (event.undoneBy !== null) {
      undoneOriginalIds.add(event.clientEventId);
      inverseIds.add(event.undoneBy);
    }
  }

  const buysCount = new Map<string, number>();
  const entries: AuditLogEntry[] = [];

  for (const event of sorted) {
    // The inverse event itself is never its own log line — it's folded into
    // the original's collapsed, struck-through entry below.
    if (inverseIds.has(event.clientEventId)) continue;

    const isUndone = undoneOriginalIds.has(event.clientEventId);
    let buysAfter: number | null = null;

    if (event.type === 'buy_in_added' || event.type === 'buy_in_removed') {
      const playerId = event.playerId;
      if (playerId !== null) {
        const before = buysCount.get(playerId) ?? 0;
        const after = before + (event.type === 'buy_in_added' ? 1 : -1);
        buysAfter = after;
        if (!isUndone) buysCount.set(playerId, after);
      }
    }

    entries.push({
      id: event.clientEventId,
      type: event.type,
      at: event.clientCreatedAt,
      playerId: event.playerId,
      actorId: event.actorId,
      payload: event.payload,
      category: CATEGORY_BY_TYPE[event.type],
      isUndone,
      isReversible: isGenericallyReversible(event.type),
      buysAfter,
    });
  }

  return entries;
}
