import type { TFunction } from 'i18next';
import { formatChipValue, formatMoneyPlainText, type Minor } from '@core/money';
import { POT_ID } from '@core/settlement';
import { isolated } from './buyInText';

export interface ShareMoneyOptions {
  readonly currency: string;
  readonly locale: string;
}

export interface LiveStatusPlayer {
  readonly name: string;
  readonly buysCount: number;
  readonly owedMinor: Minor;
  readonly cashPaidMinor: Minor;
  readonly isSettled: boolean;
  readonly chipsFinal: number | null;
}

export interface LiveStatusParams extends ShareMoneyOptions {
  readonly gameName: string;
  readonly date: string;
  readonly buyAmountMinor: Minor;
  readonly chipsPerBuy: number;
  readonly players: readonly LiveStatusPlayer[];
  readonly totalMinor: Minor;
}

function money(value: Minor, options: ShareMoneyOptions, showSign = false): string {
  return formatMoneyPlainText(value, { ...options, showSign });
}

/**
 * Live game status (07-hebrew-glossary.md#live-game-status-8), the mid-game
 * share text — buy-ins so far, who's paid cash, who's already settled.
 * "נסגר/ה עם 240 ז'יטונים" in the glossary's own example is a conjugated verb
 * (feminine, for דנה); there's no gender field on a player to key that off
 * (docs/build/NOTES.md's audit-log decision applies here too), so this uses
 * the same gender-neutral noun phrase the audit log already established.
 */
export function formatLiveStatusText(t: TFunction, params: LiveStatusParams): string {
  const { gameName, date, buyAmountMinor, chipsPerBuy, currency, locale, players, totalMinor } = params;
  const moneyOptions: ShareMoneyOptions = { currency, locale };

  const lines: string[] = [
    t('share.liveHeader', { name: gameName, date }),
    t('share.stakesLine', {
      buyAmount: money(buyAmountMinor, moneyOptions),
      chipValue: isolated(formatChipValue(buyAmountMinor, chipsPerBuy, locale, currency)),
    }),
    '',
    ...players.map((p) => formatLivePlayerLine(t, p, moneyOptions)),
    '',
    t('share.totalInGame', { amount: money(totalMinor, moneyOptions) }),
  ];

  return lines.join('\n');
}

function formatLivePlayerLine(t: TFunction, p: LiveStatusPlayer, moneyOptions: ShareMoneyOptions): string {
  const buyPhrase = t('share.buyInCount', { count: p.buysCount });
  let line = t('share.playerLine', { name: p.name, buyPhrase, money: money(p.owedMinor, moneyOptions) });

  if (p.cashPaidMinor > 0) {
    line += ` · ${t('share.cashPaidFlag')}`;
  }
  if (p.isSettled && p.chipsFinal !== null) {
    line += ` · ${t('share.settledFlag', { chips: p.chipsFinal })}`;
  }
  return line;
}

export interface FinalResultPlayer {
  readonly name: string;
  readonly netMinor: Minor;
}

export interface FinalTransfer {
  readonly fromId: string;
  readonly fromName: string;
  readonly toName: string;
  readonly amountMinor: Minor;
}

export interface FinalSharedCostLine {
  readonly label: string;
  readonly amountMinor: Minor;
  readonly perPersonMinor: Minor;
}

/**
 * A representative "per person" figure for a shared cost's `₪20 לאחד` line —
 * any one share is exact (they're pre-split with `splitWithResidue`), so the
 * first is as good as any; the odd agora of residue lands on exactly one
 * person and isn't worth a caveat in a share-text summary line.
 */
export function representativeShare(shares: ReadonlyMap<string, Minor>): Minor {
  return [...shares.values()][0] ?? (0 as Minor);
}

export interface FinalSettlementParams extends ShareMoneyOptions {
  readonly gameName: string;
  readonly date: string;
  readonly buyAmountMinor: Minor;
  readonly chipsPerBuy: number;
  readonly playerCount: number;
  readonly results: readonly FinalResultPlayer[];
  readonly sharedCosts: readonly FinalSharedCostLine[];
  readonly transfers: readonly FinalTransfer[];
}

/**
 * Final settlement (07-hebrew-glossary.md#final-settlement-16) — the message
 * that actually gets pasted into the group chat. Results sorted net
 * descending (winner first), each transfer its own line, a pot line reads
 * `מהקופה ל<name> — <amount>` instead of `<name> משלם ל<name> — <amount>`.
 */
export function formatFinalSettlementText(t: TFunction, params: FinalSettlementParams): string {
  const {
    gameName,
    date,
    buyAmountMinor,
    chipsPerBuy,
    playerCount,
    results,
    sharedCosts,
    transfers,
    currency,
    locale,
  } = params;
  const moneyOptions: ShareMoneyOptions = { currency, locale };

  const sortedResults = [...results].sort((a, b) => b.netMinor - a.netMinor);

  const lines: string[] = [
    t('share.finalHeader', { name: gameName, date }),
    t('share.stakesLineWithCount', {
      buyAmount: money(buyAmountMinor, moneyOptions),
      chipValue: isolated(formatChipValue(buyAmountMinor, chipsPerBuy, locale, currency)),
      count: playerCount,
    }),
    '',
    t('share.resultsHeading'),
    ...sortedResults.map((r) =>
      t('share.resultLine', { name: r.name, amount: money(r.netMinor, moneyOptions, true) }),
    ),
  ];

  if (sharedCosts.length > 0) {
    lines.push('');
    for (const cost of sharedCosts) {
      lines.push(
        t('share.sharedCostsLine', {
          label: cost.label,
          amount: money(cost.amountMinor, moneyOptions),
          perPerson: money(cost.perPersonMinor, moneyOptions),
        }),
      );
    }
  }

  if (transfers.length > 0) {
    lines.push('', t('share.transfersHeading'));
    for (const transfer of transfers) {
      const amount = money(transfer.amountMinor, moneyOptions);
      lines.push(
        transfer.fromId === POT_ID
          ? t('share.transferLinePot', { to: transfer.toName, amount })
          : t('share.transferLine', { from: transfer.fromName, to: transfer.toName, amount }),
      );
    }
  }

  return lines.join('\n');
}
