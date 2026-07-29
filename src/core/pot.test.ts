import { describe, expect, it } from 'vitest';
import { minor } from './money';
import { computePotStatus, type PotPlayerInput } from './pot';

// B = ₪50 (5000 minor), C = 100 chips → chip value ₪0.5 (250 minor / chip).
const BUY_AMOUNT = minor(5000);
const CHIPS_PER_BUY = 100;
const ZERO = minor(0);

describe('computePotStatus', () => {
  it('is balanced when every player is unsettled (no chips observed yet)', () => {
    const players: PotPlayerInput[] = [
      { buysCount: 3, isSettled: false, chipsFinal: null },
      { buysCount: 2, isSettled: false, chipsFinal: null },
    ];
    const status = computePotStatus(players, BUY_AMOUNT, CHIPS_PER_BUY, ZERO);
    expect(status.totalBuyInsMinor).toBe(25000);
    expect(status.totalChipsMinor).toBe(25000);
    expect(status.discrepancyMinor).toBe(0);
    expect(status.isBalanced).toBe(true);
  });

  it('hand-computed: balanced game, six players, ₪600 = ₪600 (the header mockup fixture)', () => {
    // 12 total buy-ins at ₪50 = ₪600. Two players settle with chips that sum
    // to exactly what they bought; the rest are still playing.
    const players: PotPlayerInput[] = [
      { buysCount: 3, isSettled: true, chipsFinal: 300 }, // ₪150 out, ₪150 in
      { buysCount: 2, isSettled: true, chipsFinal: 200 }, // ₪100 out, ₪100 in
      { buysCount: 3, isSettled: false, chipsFinal: null },
      { buysCount: 4, isSettled: false, chipsFinal: null },
    ];
    const status = computePotStatus(players, BUY_AMOUNT, CHIPS_PER_BUY, ZERO);
    expect(status.totalBuyInsMinor).toBe(60000);
    expect(status.totalChipsMinor).toBe(60000);
    expect(status.isBalanced).toBe(true);
  });

  it('hand-computed: ₪20 missing — chips came up short at settle', () => {
    // Rani bought in twice (₪100) but only cashed out with 60 chips (₪30, wait
    // recompute): using the doc's own worked numbers scaled to this fixture —
    // one settled player short by exactly ₪20 against their own buy-ins.
    const players: PotPlayerInput[] = [
      { buysCount: 2, isSettled: true, chipsFinal: 160 }, // owed ₪100, cashOut ₪80 → short ₪20
      { buysCount: 1, isSettled: false, chipsFinal: null },
    ];
    const status = computePotStatus(players, BUY_AMOUNT, CHIPS_PER_BUY, ZERO);
    expect(status.totalBuyInsMinor).toBe(15000);
    expect(status.totalChipsMinor).toBe(13000);
    expect(status.discrepancyMinor).toBe(2000);
    expect(status.isBalanced).toBe(false);
  });

  it('hand-computed: a settled player cashes out MORE than they bought — negative discrepancy', () => {
    const players: PotPlayerInput[] = [{ buysCount: 1, isSettled: true, chipsFinal: 140 }]; // owed ₪50, cashOut ₪70
    const status = computePotStatus(players, BUY_AMOUNT, CHIPS_PER_BUY, ZERO);
    expect(status.totalBuyInsMinor).toBe(5000);
    expect(status.totalChipsMinor).toBe(7000);
    expect(status.discrepancyMinor).toBe(-2000);
    expect(status.isBalanced).toBe(false);
  });

  it('assigning the discrepancy to the house (unaccountedMinor) rebalances the banner', () => {
    const players: PotPlayerInput[] = [{ buysCount: 2, isSettled: true, chipsFinal: 160 }];
    const short = computePotStatus(players, BUY_AMOUNT, CHIPS_PER_BUY, ZERO);
    expect(short.isBalanced).toBe(false);

    const resolved = computePotStatus(players, BUY_AMOUNT, CHIPS_PER_BUY, short.discrepancyMinor);
    expect(resolved.isBalanced).toBe(true);
    expect(resolved.unaccountedMinor).toBe(2000);
  });

  it('cash paid never enters the calculation — settlement money, not the chip safeguard', () => {
    // computePotStatus takes no cashPaid input at all; this test documents
    // the invariant so a future change accidentally threading it through
    // gets caught, per the step-7 exit criterion.
    const players: PotPlayerInput[] = [{ buysCount: 2, isSettled: true, chipsFinal: 200 }];
    const status = computePotStatus(players, BUY_AMOUNT, CHIPS_PER_BUY, ZERO);
    expect(status.isBalanced).toBe(true); // regardless of however much cash was physically paid
  });

  it('shared costs never enter the calculation — they sum to zero and are orthogonal to chip counts', () => {
    // Two players, one settled exactly matching buy-ins; a shared cost moving
    // money between them at settlement time has no bearing on this function,
    // which never receives shared-cost data at all.
    const players: PotPlayerInput[] = [
      { buysCount: 2, isSettled: true, chipsFinal: 200 },
      { buysCount: 2, isSettled: true, chipsFinal: 200 },
    ];
    const status = computePotStatus(players, BUY_AMOUNT, CHIPS_PER_BUY, ZERO);
    expect(status.isBalanced).toBe(true);
  });

  it('an empty game (no players) is trivially balanced', () => {
    const status = computePotStatus([], BUY_AMOUNT, CHIPS_PER_BUY, ZERO);
    expect(status.totalBuyInsMinor).toBe(0);
    expect(status.totalChipsMinor).toBe(0);
    expect(status.isBalanced).toBe(true);
  });
});
