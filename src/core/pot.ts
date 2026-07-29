import { add, chipsToMoney, isZero, type Minor, owed, subtract } from './money';

/**
 * The subset of PlayerState the safeguard needs — kept narrow so callers
 * (and tests) don't have to build a full PlayerState fixture.
 */
export interface PotPlayerInput {
  readonly buysCount: number;
  readonly isSettled: boolean;
  readonly chipsFinal: number | null;
}

export interface PotStatus {
  readonly totalBuyInsMinor: Minor;
  readonly totalChipsMinor: Minor;
  readonly unaccountedMinor: Minor;
  readonly discrepancyMinor: Minor;
  readonly isBalanced: boolean;
}

/**
 * The safeguard (05-settlement.md#the-safeguard-20): compares total money
 * bought in against total money accounted for in chips.
 *
 * A player who hasn't settled yet has no counted chip stack — the app never
 * observes chips mid-game, only at settle time. Rather than treat every
 * still-playing buy-in as a live discrepancy (which would paint the banner
 * red for the entire game, every game), an unsettled player's chips are
 * assumed to exactly match what they bought, i.e. neutral: no discrepancy is
 * attributed to them until they actually cash out with a different count.
 * Only settled players can contribute a real (positive or negative)
 * discrepancy. This is a build-time reading of the spec, recorded in
 * docs/build/NOTES.md — the spec defines the formula but not this case.
 *
 * `unaccountedMinor` (the "assign to the house" resolution) is subtracted so
 * that assigning the exact discrepancy to the house brings the banner back
 * to balanced, per 04-ux-spec.md#the-safeguard-20.
 */
export function computePotStatus(
  players: readonly PotPlayerInput[],
  buyAmountMinor: Minor,
  chipsPerBuy: number,
  unaccountedMinor: Minor,
): PotStatus {
  let totalBuyInsMinor = 0 as Minor;
  let totalChipsMinor = 0 as Minor;

  for (const player of players) {
    const buyIn = owed(player.buysCount, buyAmountMinor);
    totalBuyInsMinor = add(totalBuyInsMinor, buyIn);

    const accountedFor =
      player.isSettled && player.chipsFinal !== null
        ? chipsToMoney(player.chipsFinal, buyAmountMinor, chipsPerBuy)
        : buyIn;
    totalChipsMinor = add(totalChipsMinor, accountedFor);
  }

  const discrepancyMinor = subtract(subtract(totalBuyInsMinor, totalChipsMinor), unaccountedMinor);

  return {
    totalBuyInsMinor,
    totalChipsMinor,
    unaccountedMinor,
    discrepancyMinor,
    isBalanced: isZero(discrepancyMinor),
  };
}
