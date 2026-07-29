import { describe, expect, it } from 'vitest';
import i18next from '@i18n/index';
import type { AuditLogEntry } from '@core/auditLog';
import { describeAuditEntry } from './auditLogText';

const t = i18next.t.bind(i18next);

function entry(partial: Partial<AuditLogEntry> & Pick<AuditLogEntry, 'type'>): AuditLogEntry {
  return {
    id: 'e1',
    at: '2026-01-01T00:14:00.000Z',
    playerId: 'p1',
    actorId: 'a1',
    payload: {},
    category: 'management',
    isUndone: false,
    isReversible: false,
    buysAfter: null,
    ...partial,
  };
}

const opts = { playerName: 'מור', currency: 'ILS', locale: 'he', time: '00:14' };

describe('describeAuditEntry', () => {
  it('a buy-in reads "time · name — קנייה N", matching the spec example', () => {
    const text = describeAuditEntry(t, entry({ type: 'buy_in_added', buysAfter: 3 }), opts);
    expect(text).toContain('00:14');
    expect(text).toContain('מור');
    expect(text).toContain('קנייה');
    expect(text).toContain('3');
  });

  it('a settle reads the chip count, noun-phrased (no gendered verb)', () => {
    const text = describeAuditEntry(
      t,
      entry({ type: 'player_settled', payload: { chipsFinal: 120, settledAt: '' } }),
      { ...opts, playerName: 'אורי' },
    );
    expect(text).toContain('אורי');
    expect(text).toContain('120');
    expect(text).not.toMatch(/נסגר[הת]?\s*ה/); // no conjugated form leaking in
  });

  it('a per-game event with no player omits the name segment', () => {
    const text = describeAuditEntry(t, entry({ type: 'game_started', playerId: null }), {
      ...opts,
      playerName: null,
    });
    expect(text).toContain('00:14');
    expect(text).not.toContain('undefined');
  });

  it('an unreachable-yet event type still produces a line, never throwing', () => {
    expect(() => describeAuditEntry(t, entry({ type: 'note', payload: { text: 'x' } }), opts)).not.toThrow();
  });
});
