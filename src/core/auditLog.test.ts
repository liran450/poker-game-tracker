import { describe, expect, it } from 'vitest';
import { buildAuditLog } from './auditLog';
import { createUndoEvent, type GameEvent } from './events';

const GAME_ID = 'game-1';
const PLAYER = 'player-1';
const ACTOR = 'actor-1';

let counter = 0;
function at(offsetSeconds: number): string {
  return new Date(2026, 0, 1, 0, 0, offsetSeconds).toISOString();
}

function event(partial: Partial<GameEvent> & Pick<GameEvent, 'type'>): GameEvent {
  counter += 1;
  return {
    clientEventId: `evt-${counter}`,
    gameId: GAME_ID,
    playerId: PLAYER,
    actorId: ACTOR,
    clientCreatedAt: at(counter),
    undoneBy: null,
    payload: {},
    ...partial,
  } as GameEvent;
}

describe('buildAuditLog', () => {
  it('categorises events per the audit drawer filter chips', () => {
    const [buyIn, settle, add] = [
      event({ type: 'buy_in_added' }),
      event({ type: 'player_settled', payload: { chipsFinal: 100, settledAt: at(99) } }),
      event({ type: 'player_added', payload: { userId: null, guestName: 'מור', nickname: null, seatOrder: 0 } }),
    ];
    const entries = buildAuditLog([buyIn, settle, add]);
    expect(entries.map((e) => e.category)).toEqual(['buy_ins', 'settlements', 'management']);
  });

  it('tracks a running buy-in count per player, in chronological order', () => {
    const other = 'player-2';
    const events = [
      event({ type: 'buy_in_added', playerId: PLAYER }),
      event({ type: 'buy_in_added', playerId: other }),
      event({ type: 'buy_in_added', playerId: PLAYER }),
      event({ type: 'buy_in_removed', playerId: PLAYER }),
    ];
    const entries = buildAuditLog(events);
    const forPlayer = entries.filter((e) => e.playerId === PLAYER);
    expect(forPlayer.map((e) => e.buysAfter)).toEqual([1, 2, 1]);
    expect(entries.find((e) => e.playerId === other)?.buysAfter).toBe(1);
  });

  it('collapses an undone event and its inverse into a single entry', () => {
    const original = event({ type: 'buy_in_added' });
    const { inverseEvent, undoneByEventId } = createUndoEvent(original, ACTOR);
    const undoneOriginal = { ...original, undoneBy: undoneByEventId };

    const entries = buildAuditLog([undoneOriginal, inverseEvent]);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe(original.clientEventId);
    expect(entries[0]?.isUndone).toBe(true);
  });

  it('an undone tap does not shift the running count for taps that follow it', () => {
    const first = event({ type: 'buy_in_added' }); // → 1
    const second = event({ type: 'buy_in_added' }); // → 2, later undone
    const { inverseEvent, undoneByEventId } = createUndoEvent(second, ACTOR);
    const undoneSecond = { ...second, undoneBy: undoneByEventId };
    const third = event({ type: 'buy_in_added' }); // should read 2, not 3

    const entries = buildAuditLog([first, undoneSecond, inverseEvent, third]);
    const active = entries.filter((e) => !e.isUndone);
    expect(active.map((e) => e.buysAfter)).toEqual([1, 2]);
  });

  it('marks generically-reversible types as such, and last-writer-wins types as not', () => {
    const entries = buildAuditLog([
      event({ type: 'buy_in_added' }),
      event({ type: 'cash_paid_set', payload: { amountMinor: 1000 } }),
      event({ type: 'chips_set', payload: { chips: 50 } }),
      event({ type: 'shared_cost_removed', payload: { costId: 'c1' } }),
    ]);
    const byType = new Map(entries.map((e) => [e.type, e.isReversible]));
    expect(byType.get('buy_in_added')).toBe(true);
    expect(byType.get('cash_paid_set')).toBe(false);
    expect(byType.get('chips_set')).toBe(false);
    expect(byType.get('shared_cost_removed')).toBe(false);
  });

  it('returns entries in chronological order (oldest first)', () => {
    const a = event({ type: 'buy_in_added' });
    const b = event({ type: 'buy_in_removed' });
    const entries = buildAuditLog([b, a]); // passed out of order
    expect(entries.map((e) => e.id)).toEqual([a.clientEventId, b.clientEventId]);
  });
});
