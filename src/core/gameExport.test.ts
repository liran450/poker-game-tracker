import { describe, expect, it } from 'vitest';
import { minor } from './money';
import {
  allHistoryExportFileName,
  buildGameExportPayload,
  gameExportFileName,
  type GameExportInput,
} from './gameExport';

function baseInput(overrides: Partial<GameExportInput> = {}): GameExportInput {
  return {
    gameId: 'game-1',
    name: 'פוקר יום חמישי',
    status: 'finished',
    playedOn: '2026-08-01',
    currency: 'ILS',
    finishedAt: '2026-08-02T02:00:00.000Z',
    players: [
      {
        displayName: 'מור',
        buysCount: 2,
        buyInsMinor: minor(10000),
        cashPaidMinor: minor(10000),
        chipsFinal: 150,
        netMinor: minor(-2500),
        sharedCostsShareMinor: minor(-500),
      },
      {
        displayName: 'רני',
        buysCount: 3,
        buyInsMinor: minor(15000),
        cashPaidMinor: minor(15000),
        chipsFinal: 400,
        netMinor: minor(2500),
        sharedCostsShareMinor: minor(500),
      },
    ],
    transfers: [{ fromName: 'מור', toName: 'רני', amountMinor: minor(2500) }],
    ...overrides,
  };
}

describe('buildGameExportPayload', () => {
  it('converts every money field from minor to major units', () => {
    const payload = buildGameExportPayload(baseInput(), () => '2026-08-03T00:00:00.000Z');

    expect(payload.formatVersion).toBe(1);
    expect(payload.exportedAt).toBe('2026-08-03T00:00:00.000Z');
    expect(payload.game).toEqual({
      id: 'game-1',
      name: 'פוקר יום חמישי',
      status: 'finished',
      playedOn: '2026-08-01',
      currency: 'ILS',
      finishedAt: '2026-08-02T02:00:00.000Z',
    });
    expect(payload.players).toEqual([
      { displayName: 'מור', buysCount: 2, buyIns: 100, cashPaid: 100, chipsFinal: 150, net: -25, sharedCostsShare: -5 },
      { displayName: 'רני', buysCount: 3, buyIns: 150, cashPaid: 150, chipsFinal: 400, net: 25, sharedCostsShare: 5 },
    ]);
    expect(payload.transfers).toEqual([{ from: 'מור', to: 'רני', amount: 25 }]);
  });

  it('is complete and re-readable: a round trip through JSON reconstructs the same summary', () => {
    const payload = buildGameExportPayload(baseInput());
    const roundTripped = JSON.parse(JSON.stringify(payload)) as typeof payload;

    expect(roundTripped).toEqual(payload);
    const totalNet = roundTripped.players.reduce((sum, p) => sum + (p.net ?? 0), 0);
    expect(totalNet).toBeCloseTo(0);
    const totalTransferred = roundTripped.transfers.reduce((sum, t) => sum + t.amount, 0);
    expect(totalTransferred).toBe(25);
  });

  it('carries null net/chips through for a player who has not settled yet', () => {
    const payload = buildGameExportPayload(
      baseInput({
        status: 'active',
        finishedAt: null,
        players: [
          {
            displayName: 'אורי',
            buysCount: 1,
            buyInsMinor: minor(5000),
            cashPaidMinor: minor(5000),
            chipsFinal: null,
            netMinor: null,
            sharedCostsShareMinor: minor(0),
          },
        ],
        transfers: [],
      }),
    );

    expect(payload.game.status).toBe('active');
    expect(payload.game.finishedAt).toBeNull();
    expect(payload.players[0]).toEqual({
      displayName: 'אורי',
      buysCount: 1,
      buyIns: 50,
      cashPaid: 50,
      chipsFinal: null,
      net: null,
      sharedCostsShare: 0,
    });
  });
});

describe('file names', () => {
  it('gameExportFileName is stable, filesystem-safe and keyed on the game', () => {
    expect(gameExportFileName('11111111-2222-3333-4444-555555555555', '2026-08-01')).toBe(
      'poker-game-2026-08-01-11111111.json',
    );
  });

  it('allHistoryExportFileName is keyed on the export date', () => {
    expect(allHistoryExportFileName(() => '2026-08-03T12:34:56.000Z')).toBe('poker-history-2026-08-03.json');
  });
});
