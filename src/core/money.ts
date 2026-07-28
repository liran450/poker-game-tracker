declare const __brand: unique symbol;

/**
 * An integer in the currency's minor unit. The brand prevents a raw `number`
 * from being passed where a Minor is expected — the compiler catches the
 * mistake even when the values happen to be the same.
 */
export type Minor = number & { readonly [__brand]: 'Minor' };

export function minor(n: number): Minor {
  if (!Number.isInteger(n)) {
    throw new RangeError(`minor() requires an integer, got ${n}`);
  }
  return n as Minor;
}

// ---------------------------------------------------------------------------
// Arithmetic — integers only, never floats
// ---------------------------------------------------------------------------

export function add(a: Minor, b: Minor): Minor {
  return (a + b) as Minor;
}

export function subtract(a: Minor, b: Minor): Minor {
  return (a - b) as Minor;
}

export function negate(a: Minor): Minor {
  return (-(a as number)) as Minor;
}

export function sum(values: readonly Minor[]): Minor {
  let total = 0;
  for (const v of values) total += v;
  return total as Minor;
}

export function compare(a: Minor, b: Minor): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function abs(a: Minor): Minor {
  return Math.abs(a) as Minor;
}

export function isZero(a: Minor): boolean {
  return a === 0;
}

// ---------------------------------------------------------------------------
// Split with residue — dividing M among N recipients so the total is exact
// ---------------------------------------------------------------------------

/**
 * Splits `amount` into `n` shares using round-half-to-even (banker's rounding),
 * then pushes the accumulated residue onto the shares so the sum is exactly
 * `amount`. The residue goes to the first share (index 0), which the caller can
 * assign to the largest |balance| as the spec requires.
 *
 * Returns an array of length `n`.
 */
export function splitWithResidue(amount: Minor, n: number): Minor[] {
  if (n <= 0 || !Number.isInteger(n)) {
    throw new RangeError(`splitWithResidue: n must be a positive integer, got ${n}`);
  }
  if (n === 1) return [amount];

  const raw = amount / n;
  const rounded = bankersRound(raw);
  const shares = Array.from<Minor>({ length: n }).fill(rounded as Minor);

  const residue = amount - rounded * n;
  shares[0] = (shares[0]! + residue) as Minor;

  return shares;
}

/**
 * Round half-to-even (banker's rounding). For integer division of minor units
 * this avoids the systematic bias of round-half-up.
 */
function bankersRound(x: number): number {
  const floor = Math.floor(x);
  const frac = x - floor;
  if (Math.abs(frac - 0.5) < 1e-9) {
    return floor % 2 === 0 ? floor : floor + 1;
  }
  return Math.round(x);
}

// ---------------------------------------------------------------------------
// Chip arithmetic — the bridge between physical chips and money
// ---------------------------------------------------------------------------

/**
 * How much one chip is worth in minor units. This is a rational number, NOT a
 * Minor — it only exists as an intermediate for the conversions below.
 */
export function chipValue(buyAmountMinor: Minor, chipsPerBuy: number): number {
  if (chipsPerBuy <= 0) {
    throw new RangeError('chipsPerBuy must be positive');
  }
  return buyAmountMinor / chipsPerBuy;
}

/**
 * What a player owes given their number of buy-ins. Pure multiplication,
 * always exact because both operands are integers.
 */
export function owed(buys: number, buyAmountMinor: Minor): Minor {
  return (buys * buyAmountMinor) as Minor;
}

/**
 * Cash-out value of a chip count: `chips * buyAmount / chipsPerBuy`.
 * Uses banker's rounding per the spec (05-settlement.md#rounding-and-precision).
 */
export function chipsToMoney(
  chips: number,
  buyAmountMinor: Minor,
  chipsPerBuy: number,
): Minor {
  if (chipsPerBuy <= 0) {
    throw new RangeError('chipsPerBuy must be positive');
  }
  return bankersRound(chips * buyAmountMinor / chipsPerBuy) as Minor;
}

/**
 * How many chips a given minor-unit amount is worth. Returns a number that may
 * be fractional — the caller decides how to present that.
 */
export function moneyToChips(
  amountMinor: Minor,
  buyAmountMinor: Minor,
  chipsPerBuy: number,
): number {
  if (buyAmountMinor === 0) {
    throw new RangeError('buyAmountMinor must be nonzero');
  }
  return amountMinor * chipsPerBuy / buyAmountMinor;
}

/**
 * Net poker result: cashOut − owed. Statistics only — never includes cash paid
 * or shared costs (05-settlement.md#the-money-model).
 */
export function net(cashOutMinor: Minor, owedMinor: Minor): Minor {
  return subtract(cashOutMinor, owedMinor);
}

// ---------------------------------------------------------------------------
// Formatting — Intl.NumberFormat, never a hardcoded symbol
// ---------------------------------------------------------------------------

const LRI = '⁦';
const PDI = '⁩';
const MINUS = '−'; // U+2212, not hyphen

export interface FormatMoneyOptions {
  locale: string;
  currency: string;
  showSign?: boolean;
  /**
   * When true, trailing `.00` (or equivalent) is dropped. The spec says
   * "two decimals only when nonzero" (07-hebrew-glossary.md).
   */
  trailingZeros?: boolean;
}

function getFormatter(locale: string, currency: string): Intl.NumberFormat {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/**
 * Format a Minor value for display. Returns a plain string — NO bidi marks.
 * The `<Money>` component and `formatMoneyPlainText` add isolation.
 */
export function formatMoney(value: Minor, options: FormatMoneyOptions): string {
  const { locale, currency, showSign = false, trailingZeros = false } = options;
  const formatter = getFormatter(locale, currency);
  const absValue = Math.abs(value) / 100;

  let formatted = formatter.format(absValue);

  if (!trailingZeros) {
    formatted = formatted.replace(/([.,])00(?=\s*[^\d]|$)/, '');
  }

  if (showSign) {
    if (value > 0) return `+${formatted}`;
    if (value < 0) return `${MINUS}${formatted}`;
    return formatted;
  }

  if (value < 0) return `${MINUS}${formatted}`;
  return formatted;
}

/**
 * Format for chip value display: "ז'יטון = ₪0.5"
 */
export function formatChipValue(
  buyAmountMinor: Minor,
  chipsPerBuy: number,
  locale: string,
  currency: string,
): string {
  const cv = chipValue(buyAmountMinor, chipsPerBuy);
  const formatter = getFormatter(locale, currency);
  return formatter.format(cv / 100);
}

/**
 * Minor value as a major-unit number for display. E.g. 5000 → 50.
 * NOT for arithmetic — only for presenting values.
 */
export function toMajor(value: Minor): number {
  return value / 100;
}

/**
 * Plain-text formatter for share text. Wraps the amount in LRI…PDI so the
 * number stays LTR inside RTL text (WhatsApp, SMS, clipboard).
 */
export function formatMoneyPlainText(value: Minor, options: FormatMoneyOptions): string {
  return `${LRI}${formatMoney(value, options)}${PDI}`;
}

/**
 * The decimal count for a currency. 0 for JPY/KRW, 2 for most.
 * Used to convert between minor and major units correctly per currency.
 */
export function currencyDecimals(currency: string): number {
  try {
    const fmt = new Intl.NumberFormat('en', { style: 'currency', currency });
    const parts = fmt.formatToParts(1);
    const frac = parts.find(p => p.type === 'fraction');
    return frac ? frac.value.length : 0;
  } catch {
    return 2;
  }
}

/**
 * Convert a user-entered major-unit value to Minor, using the currency's
 * decimal count. E.g. for ILS: 50 → 5000. For JPY: 500 → 500.
 */
export function fromMajor(value: number, currency: string): Minor {
  const decimals = currencyDecimals(currency);
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) as Minor;
}
