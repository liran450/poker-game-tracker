import type { TFunction } from 'i18next';
import { formatMoneyPlainText, LRI, MINUS, PDI, type Minor } from '@core/money';

function signOf(n: number): '+' | typeof MINUS | '' {
  if (n > 0) return '+';
  if (n < 0) return MINUS;
  return '';
}

/** Wraps a plain-text numeric figure in LRI/PDI so it can't reorder inside Hebrew text (07-hebrew-glossary.md#bidi-rules). */
export function isolated(text: string): string {
  return `${LRI}${text}${PDI}`;
}

export interface BuyInChangeParams {
  readonly name: string;
  readonly deltaBuys: number;
  /**
   * True only for the single-tap, single-player case — the spec shows the
   * *resulting* buy-in number then ("קנייה 3"), not a signed delta. As soon
   * as a second tap or a second row is in the same window, every row
   * switches to the signed-delta form ("+1 קנייה"), even a row that itself
   * only got one tap — the batch-bar example makes this explicit (`אורי ·
   * +1 קנייה`, a single tap, still delta-form once `מור` is also in the bar).
   */
  readonly showResultingCount: boolean;
  /** Their live buysCount after this tap — only read when `showResultingCount` is true. */
  readonly resultingBuysCount: number;
  readonly buyAmountMinor: Minor;
  readonly chipsPerBuy: number;
  readonly currency: string;
  readonly locale: string;
}

/**
 * The buy-in change line, in every unit that matters at once
 * (04-ux-spec.md#the-buy-in-counter--the-most-important-interaction-in-the-app):
 * "מור · קנייה 3 · +100 ז'יטונים · +₪50" for one tap, "מור · +3 קניות ·
 * +300 ז'יטונים · +₪150" once taps coalesce. Every signed figure is
 * LRI/PDI-isolated (07-hebrew-glossary.md#bidi-rules) — this composes a
 * plain string, the same convention as `formatMoneyPlainText`, since it's
 * rendered as one text node inside the snackbar/batch bar, not through
 * dedicated `<Money>` slots.
 */
export function formatBuyInChange(t: TFunction, params: BuyInChangeParams): string {
  const {
    name,
    deltaBuys,
    showResultingCount,
    resultingBuysCount,
    buyAmountMinor,
    chipsPerBuy,
    currency,
    locale,
  } = params;

  const chipsDelta = deltaBuys * chipsPerBuy;
  const moneyDelta = (deltaBuys * buyAmountMinor) as Minor;

  const countPhrase = showResultingCount
    ? t('buyIn.buyInNumber', { count: isolated(String(resultingBuysCount)) })
    : t('buyIn.delta', { count: Math.abs(deltaBuys), sign: signOf(deltaBuys) });

  const chipsPhrase = t('buyIn.chipsDelta', {
    figure: isolated(`${signOf(chipsDelta)}${Math.abs(chipsDelta)}`),
  });

  const moneyPhrase = formatMoneyPlainText(moneyDelta, { locale, currency, showSign: true });

  return t('buyIn.snackbarLine', { name, countPhrase, chipsPhrase, money: moneyPhrase });
}
