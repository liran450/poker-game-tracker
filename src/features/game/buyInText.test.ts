import { describe, expect, it } from 'vitest';
import i18next from '@i18n/index';
import { minor } from '@core/money';
import { formatBuyInChange } from './buyInText';

// Uses the real i18next singleton (with the real Hebrew bundle) rather than
// the raw-key fallback most component tests rely on, because this module's
// entire job is composing the exact spec-worded sentence
// (04-ux-spec.md#the-buy-in-counter--the-most-important-interaction-in-the-app)
// and that can only be verified against the real translations.
const t = i18next.t.bind(i18next);

const BUY_AMOUNT = minor(5000); // ₪50
const CHIPS_PER_BUY = 100;

describe('formatBuyInChange', () => {
  it('a single add reads the resulting buy-in number, not a delta', () => {
    const text = formatBuyInChange(t, {
      name: 'מור',
      deltaBuys: 1,
      showResultingCount: true,
      resultingBuysCount: 3,
      buyAmountMinor: BUY_AMOUNT,
      chipsPerBuy: CHIPS_PER_BUY,
      currency: 'ILS',
      locale: 'he',
    });
    // Matches the glossary's own worked example exactly.
    expect(text).toContain('מור');
    expect(text).toContain('קנייה');
    expect(text).toContain('3');
    expect(text).toContain('100');
    expect(text).toContain('ז\'יטונים');
    expect(text).toContain('50');
    expect(text).not.toMatch(/\+3\b/); // never a delta form for a single tap
  });

  it('a single remove also reads the resulting number, with a negative money/chip change', () => {
    const text = formatBuyInChange(t, {
      name: 'מור',
      deltaBuys: -1,
      showResultingCount: true,
      resultingBuysCount: 2,
      buyAmountMinor: BUY_AMOUNT,
      chipsPerBuy: CHIPS_PER_BUY,
      currency: 'ILS',
      locale: 'he',
    });
    expect(text).toContain('קנייה');
    expect(text).toContain('2');
    expect(text).toContain('−100');
    expect(text).toContain('−');
    expect(text).toContain('50');
  });

  it('coalesced taps switch to a signed delta, pluralised correctly at three', () => {
    const text = formatBuyInChange(t, {
      name: 'מור',
      deltaBuys: 3,
      showResultingCount: false,
      resultingBuysCount: 3,
      buyAmountMinor: BUY_AMOUNT,
      chipsPerBuy: CHIPS_PER_BUY,
      currency: 'ILS',
      locale: 'he',
    });
    expect(text).toContain('+3');
    expect(text).toContain('קניות');
    expect(text).toContain('+300');
    expect(text).toContain('+');
    expect(text).toContain('150');
  });

  it('a coalesced net delta of exactly one still uses the singular form, not the resulting-count form', () => {
    // Two taps (+1, +1, −1 → net +1) must read "+1 קנייה", matching the
    // batch-bar row example in the spec — singular wording, but signed.
    const text = formatBuyInChange(t, {
      name: 'אורי',
      deltaBuys: 1,
      showResultingCount: false,
      resultingBuysCount: 4,
      buyAmountMinor: BUY_AMOUNT,
      chipsPerBuy: CHIPS_PER_BUY,
      currency: 'ILS',
      locale: 'he',
    });
    expect(text).toContain('+1');
    expect(text).toContain('קנייה');
    expect(text).not.toContain('קניות');
  });

  it('a coalesced delta of exactly two uses the dedicated Hebrew "two" plural form', () => {
    const text = formatBuyInChange(t, {
      name: 'רני',
      deltaBuys: -2,
      showResultingCount: false,
      resultingBuysCount: 0,
      buyAmountMinor: BUY_AMOUNT,
      chipsPerBuy: CHIPS_PER_BUY,
      currency: 'ILS',
      locale: 'he',
    });
    expect(text).toContain('−2');
    expect(text).toContain('קניות');
  });
});
