import { describe, expect, it } from 'vitest';
import type { GameEvent } from './events';
import { dedupeDisplayNames, firstBuyInTimestamp, renderPlayerName } from './players';

let eventCounter = 0;
function event(type: GameEvent['type'], clientCreatedAt: string): GameEvent {
  eventCounter += 1;
  return {
    clientEventId: `evt-${eventCounter}`,
    gameId: 'g1',
    playerId: null,
    actorId: 'a1',
    clientCreatedAt,
    undoneBy: null,
    type,
    payload: {},
  } as GameEvent;
}

describe('renderPlayerName', () => {
  it('shows the guest name as-is for a guest', () => {
    expect(renderPlayerName({ userId: null, guestName: 'מור', nickname: null })).toBe('מור');
  });

  it('falls back to an empty string for a guest with no name set', () => {
    expect(renderPlayerName({ userId: null, guestName: null, nickname: null })).toBe('');
  });

  it('shows the account display name for a registered player with no nickname', () => {
    const name = renderPlayerName(
      { userId: 'u1', guestName: null, nickname: null },
      () => 'מור לוי',
    );
    expect(name).toBe('מור לוי');
  });

  it('composes nickname (account name) once a nickname is set', () => {
    const name = renderPlayerName(
      { userId: 'u1', guestName: null, nickname: 'הכריש' },
      () => 'מור לוי',
    );
    expect(name).toBe('הכריש (מור לוי)');
  });
});

describe('dedupeDisplayNames', () => {
  it('leaves unique names untouched', () => {
    const result = dedupeDisplayNames([
      { id: 'a', name: 'מור', order: 0 },
      { id: 'b', name: 'אורי', order: 1 },
    ]);
    expect(result.get('a')).toBe('מור');
    expect(result.get('b')).toBe('אורי');
  });

  it('suffixes the second and third occurrence, by insertion order', () => {
    const result = dedupeDisplayNames([
      { id: 'a', name: 'מור', order: 0 },
      { id: 'b', name: 'מור', order: 1 },
      { id: 'c', name: 'מור', order: 2 },
    ]);
    expect(result.get('a')).toBe('מור');
    expect(result.get('b')).toBe('מור (1)');
    expect(result.get('c')).toBe('מור (2)');
  });

  it('is order-independent in the input array — only `order` decides who is "first"', () => {
    const result = dedupeDisplayNames([
      { id: 'c', name: 'מור', order: 2 },
      { id: 'a', name: 'מור', order: 0 },
      { id: 'b', name: 'מור', order: 1 },
    ]);
    expect(result.get('a')).toBe('מור');
    expect(result.get('b')).toBe('מור (1)');
    expect(result.get('c')).toBe('מור (2)');
  });

  it('re-resolves correctly after the first entry is removed from the input', () => {
    // Simulates player "a" being removed: b is now first, gets the plain name.
    const result = dedupeDisplayNames([
      { id: 'b', name: 'מור', order: 1 },
      { id: 'c', name: 'מור', order: 2 },
    ]);
    expect(result.get('b')).toBe('מור');
    expect(result.get('c')).toBe('מור (1)');
  });

  it('re-resolves correctly after a rename removes the collision', () => {
    // Simulates player "b" being renamed away from the colliding name.
    const result = dedupeDisplayNames([
      { id: 'a', name: 'מור', order: 0 },
      { id: 'b', name: 'דנה', order: 1 },
    ]);
    expect(result.get('a')).toBe('מור');
    expect(result.get('b')).toBe('דנה');
  });

  it('re-resolves correctly after a rename creates a new collision', () => {
    // Simulates player "b" being renamed TO match player "a".
    const result = dedupeDisplayNames([
      { id: 'a', name: 'מור', order: 0 },
      { id: 'b', name: 'מור', order: 1 },
    ]);
    expect(result.get('a')).toBe('מור');
    expect(result.get('b')).toBe('מור (1)');
  });
});

describe('firstBuyInTimestamp', () => {
  it('is null when no buy-in has happened yet', () => {
    expect(
      firstBuyInTimestamp([
        event('game_started', '2026-01-01T00:00:00.000Z'),
        event('player_added', '2026-01-01T00:00:01.000Z'),
      ]),
    ).toBeNull();
  });

  it('is the earliest buy_in_added timestamp, regardless of event order', () => {
    expect(
      firstBuyInTimestamp([
        event('buy_in_added', '2026-01-01T00:05:00.000Z'),
        event('buy_in_added', '2026-01-01T00:02:00.000Z'),
        event('buy_in_added', '2026-01-01T00:08:00.000Z'),
      ]),
    ).toBe('2026-01-01T00:02:00.000Z');
  });

  it('ignores every other event type', () => {
    expect(
      firstBuyInTimestamp([
        event('player_added', '2026-01-01T00:00:00.000Z'),
        event('cash_paid_set', '2026-01-01T00:00:01.000Z'),
      ]),
    ).toBeNull();
  });
});
