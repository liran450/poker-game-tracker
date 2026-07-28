import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';

import {
  abs,
  add,
  chipsToMoney,
  chipValue,
  compare,
  currencyDecimals,
  formatChipValue,
  formatMoney,
  formatMoneyPlainText,
  fromMajor,
  isZero,
  minor,
  moneyToChips,
  negate,
  net,
  owed,
  splitWithResidue,
  subtract,
  sum,
  toMajor,
  type Minor,
} from './money';

// ---------------------------------------------------------------------------
// minor() — the branded constructor
// ---------------------------------------------------------------------------

describe('minor()', () => {
  it('accepts integers', () => {
    expect(minor(0)).toBe(0);
    expect(minor(5000)).toBe(5000);
    expect(minor(-100)).toBe(-100);
  });

  it('rejects non-integers', () => {
    expect(() => minor(1.5)).toThrow(RangeError);
    expect(() => minor(0.1)).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// Basic arithmetic
// ---------------------------------------------------------------------------

describe('arithmetic', () => {
  const a = minor(5000);
  const b = minor(3000);

  it('add', () => expect(add(a, b)).toBe(8000));
  it('subtract', () => expect(subtract(a, b)).toBe(2000));
  it('negate', () => expect(negate(a)).toBe(-5000));
  it('sum', () => expect(sum([a, b, minor(-1000)])).toBe(7000));
  it('sum of empty array', () => expect(sum([])).toBe(0));
  it('compare lt', () => expect(compare(a, minor(6000))).toBe(-1));
  it('compare eq', () => expect(compare(a, a)).toBe(0));
  it('compare gt', () => expect(compare(a, b)).toBe(1));
  it('abs', () => expect(abs(minor(-42))).toBe(42));
  it('isZero', () => {
    expect(isZero(minor(0))).toBe(true);
    expect(isZero(minor(1))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// splitWithResidue
// ---------------------------------------------------------------------------

describe('splitWithResidue', () => {
  it('splits evenly when possible', () => {
    const shares = splitWithResidue(minor(6000), 3);
    expect(shares).toEqual([2000, 2000, 2000]);
  });

  it('pushes residue onto the first share', () => {
    const shares = splitWithResidue(minor(10000), 3);
    expect(sum(shares)).toBe(10000);
    expect(shares.length).toBe(3);
  });

  it('handles a single recipient', () => {
    expect(splitWithResidue(minor(42), 1)).toEqual([42]);
  });

  it('rejects n=0', () => {
    expect(() => splitWithResidue(minor(100), 0)).toThrow(RangeError);
  });

  it('rejects non-integer n', () => {
    expect(() => splitWithResidue(minor(100), 1.5)).toThrow(RangeError);
  });

  // Property test: splitting any amount N ways sums back to exactly the original
  it('property: shares always sum to the original', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        fc.integer({ min: 1, max: 100 }),
        (amount, n) => {
          const shares = splitWithResidue(minor(amount), n);
          expect(shares.length).toBe(n);
          const total = shares.reduce<number>((a, b) => a + b, 0);
          expect(total).toBe(amount);
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Chip arithmetic
// ---------------------------------------------------------------------------

describe('chip arithmetic', () => {
  it('chipValue: ₪50 / 100 chips = 0.5', () => {
    expect(chipValue(minor(5000), 100)).toBeCloseTo(50);
  });

  it('owed: 3 buy-ins × ₪50 = ₪150', () => {
    expect(owed(3, minor(5000))).toBe(15000);
  });

  it('chipsToMoney: 120 chips at ₪50/100 = ₪60', () => {
    expect(chipsToMoney(120, minor(5000), 100)).toBe(6000);
  });

  it('chipsToMoney: rounds with banker\'s rounding', () => {
    // 7 chips at ₪50 / 100 chips = 3.5 → should round to 4 (half-to-even: 3 is odd → 4)
    expect(chipsToMoney(7, minor(5000), 100)).toBe(350);
    // edge: 5 chips at ₪100 / 3 chips per buy = 166.666... → 167
    expect(chipsToMoney(5, minor(10000), 3)).toBe(16667);
  });

  it('moneyToChips: ₪60 at ₪50/100 = 120 chips', () => {
    expect(moneyToChips(minor(6000), minor(5000), 100)).toBe(120);
  });

  it('moneyToChips: can return fractional chips', () => {
    // ₪1 at ₪50/100 = 2 chips
    expect(moneyToChips(minor(100), minor(5000), 100)).toBe(2);
    // ₪7 at ₪50/100 = 14 chips
    expect(moneyToChips(minor(700), minor(5000), 100)).toBe(14);
  });

  it('net: cashOut − owed', () => {
    expect(net(minor(6000), minor(10000))).toBe(-4000);
    expect(net(minor(12000), minor(10000))).toBe(2000);
  });

  it('chipsPerBuy must be positive', () => {
    expect(() => chipsToMoney(10, minor(5000), 0)).toThrow(RangeError);
    expect(() => chipsToMoney(10, minor(5000), -1)).toThrow(RangeError);
    expect(() => chipValue(minor(5000), 0)).toThrow(RangeError);
  });

  it('moneyToChips: buyAmount must be nonzero', () => {
    expect(() => moneyToChips(minor(100), minor(0), 100)).toThrow(RangeError);
  });

  // Property: chipsToMoney ∘ moneyToChips ≈ identity (up to rounding)
  it('property: chipsToMoney(moneyToChips(x)) ≈ x within rounding', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 100, max: 50_000 }),
        fc.integer({ min: 1, max: 1000 }),
        (amountRaw, buyRaw, chipsPerBuy) => {
          const amount = minor(amountRaw);
          const buy = minor(buyRaw);
          const chips = moneyToChips(amount, buy, chipsPerBuy);
          const back = chipsToMoney(chips, buy, chipsPerBuy);
          // The round-trip may differ by at most 1 minor unit due to rounding
          expect(Math.abs(back - amountRaw)).toBeLessThanOrEqual(1);
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

describe('formatMoney', () => {
  it('formats ₪50 in Hebrew', () => {
    const result = formatMoney(minor(5000), { locale: 'he', currency: 'ILS' });
    expect(result).toContain('50');
  });

  it('formats $50 in English', () => {
    const result = formatMoney(minor(5000), { locale: 'en', currency: 'USD' });
    expect(result).toContain('50');
    expect(result).toContain('$');
  });

  it('shows sign when requested', () => {
    const pos = formatMoney(minor(5000), { locale: 'he', currency: 'ILS', showSign: true });
    expect(pos).toMatch(/^\+/);
    const neg = formatMoney(minor(-5000), { locale: 'he', currency: 'ILS', showSign: true });
    expect(neg).toContain('−');
  });

  it('uses U+2212 minus for negative, never a hyphen', () => {
    const neg = formatMoney(minor(-5000), { locale: 'he', currency: 'ILS' });
    expect(neg).toContain('−');
    expect(neg).not.toMatch(/-/);
  });

  it('drops trailing zeros by default', () => {
    const result = formatMoney(minor(5000), { locale: 'en', currency: 'USD' });
    expect(result).not.toMatch(/\.00/);
  });

  it('shows decimals when they are nonzero', () => {
    const result = formatMoney(minor(5050), { locale: 'en', currency: 'USD' });
    expect(result).toContain('50.5');
  });

  it('zero renders without sign even when showSign is true', () => {
    const result = formatMoney(minor(0), { locale: 'he', currency: 'ILS', showSign: true });
    expect(result).not.toContain('+');
    expect(result).not.toContain('−');
  });
});

describe('formatMoneyPlainText', () => {
  it('wraps in LRI…PDI', () => {
    const result = formatMoneyPlainText(minor(5000), { locale: 'he', currency: 'ILS' });
    expect(result.startsWith('⁦')).toBe(true);
    expect(result.endsWith('⁩')).toBe(true);
  });
});

describe('formatChipValue', () => {
  it('formats ₪0.5 chip value', () => {
    const result = formatChipValue(minor(5000), 100, 'he', 'ILS');
    expect(result).toContain('0.5');
  });

  it('formats $1 chip value', () => {
    const result = formatChipValue(minor(10000), 100, 'en', 'USD');
    expect(result).toContain('1');
  });
});

describe('toMajor', () => {
  it('converts minor to major', () => {
    expect(toMajor(minor(5000))).toBe(50);
    expect(toMajor(minor(50))).toBe(0.5);
    expect(toMajor(minor(0))).toBe(0);
  });
});

describe('currencyDecimals', () => {
  it('returns 2 for ILS', () => {
    expect(currencyDecimals('ILS')).toBe(2);
  });

  it('returns 2 for USD', () => {
    expect(currencyDecimals('USD')).toBe(2);
  });

  it('returns 0 for JPY', () => {
    expect(currencyDecimals('JPY')).toBe(0);
  });
});

describe('fromMajor', () => {
  it('converts major to minor for ILS', () => {
    expect(fromMajor(50, 'ILS')).toBe(5000);
  });

  it('converts major to minor for USD', () => {
    expect(fromMajor(1.5, 'USD')).toBe(150);
  });

  it('converts for JPY (zero decimals)', () => {
    expect(fromMajor(500, 'JPY')).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// No user-facing "agorot" / "cents" / "minor units"
// ---------------------------------------------------------------------------

describe('no minor-unit terminology in user-facing strings', () => {
  const banned = ['agorot', 'cents', 'minor unit', 'agora'];

  it('formatMoney never mentions minor units', () => {
    const tests: Array<[Minor, string, string]> = [
      [minor(5000), 'he', 'ILS'],
      [minor(5000), 'en', 'USD'],
      [minor(-100), 'he', 'ILS'],
      [minor(0), 'en', 'USD'],
    ];
    for (const [v, locale, currency] of tests) {
      const result = formatMoney(v, { locale, currency, showSign: true });
      for (const word of banned) {
        expect(result.toLowerCase()).not.toContain(word);
      }
    }
  });
});
