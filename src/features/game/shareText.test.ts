import { describe, expect, it } from 'vitest';
import i18next from '@i18n/index';
import { minor } from '@core/money';
import { POT_ID } from '@core/settlement';
import { formatFinalSettlementText, formatLiveStatusText } from './shareText';

// Real i18next singleton, same convention as buyInText.test.ts / auditLogText.test.ts —
// this module's whole job is composing the exact spec-worded sentences.
const t = i18next.t.bind(i18next);

const BUY_AMOUNT = minor(5000); // ₪50
const CHIPS_PER_BUY = 100;

describe('formatLiveStatusText', () => {
  it('matches the glossary\'s worked example (07-hebrew-glossary.md#live-game-status-8)', () => {
    const text = formatLiveStatusText(t, {
      gameName: 'פוקר',
      date: '26.07.25',
      buyAmountMinor: BUY_AMOUNT,
      chipsPerBuy: CHIPS_PER_BUY,
      currency: 'ILS',
      locale: 'he',
      totalMinor: minor(40000),
      players: [
        { name: 'מור', buysCount: 3, owedMinor: minor(15000), cashPaidMinor: minor(0), isSettled: false, chipsFinal: null },
        { name: 'אורי', buysCount: 2, owedMinor: minor(10000), cashPaidMinor: minor(0), isSettled: false, chipsFinal: null },
        { name: 'רני', buysCount: 1, owedMinor: minor(5000), cashPaidMinor: minor(5000), isSettled: false, chipsFinal: null },
        { name: 'דנה', buysCount: 2, owedMinor: minor(10000), cashPaidMinor: minor(0), isSettled: true, chipsFinal: 240 },
      ],
    });

    expect(text).toContain('פוקר');
    expect(text).toContain('26.07.25');
    expect(text).toContain('מור');
    expect(text).toContain('3 קניות');
    expect(text).toContain('150'); // ₪150
    expect(text).toContain('רני');
    expect(text).toContain('1 קנייה'); // singular for 1
    expect(text).toContain('שילם במזומן');
    expect(text).toContain('דנה');
    expect(text).toContain('240');
    expect(text).toContain('ז\'יטונים');
    expect(text).toContain('400'); // ₪400 total
  });

  it('is plain text with real newlines, no markdown', () => {
    const text = formatLiveStatusText(t, {
      gameName: 'משחק',
      date: '01.01.26',
      buyAmountMinor: BUY_AMOUNT,
      chipsPerBuy: CHIPS_PER_BUY,
      currency: 'ILS',
      locale: 'he',
      totalMinor: minor(0),
      players: [],
    });
    expect(text).not.toMatch(/[*_#`]/);
    expect(text.split('\n').length).toBeGreaterThan(1);
  });
});

describe('formatFinalSettlementText', () => {
  it('matches the glossary\'s worked example (07-hebrew-glossary.md#final-settlement-16)', () => {
    const text = formatFinalSettlementText(t, {
      gameName: 'פוקר',
      date: '26.07.25',
      buyAmountMinor: BUY_AMOUNT,
      chipsPerBuy: CHIPS_PER_BUY,
      playerCount: 4,
      currency: 'ILS',
      locale: 'he',
      results: [
        { name: 'דנה', netMinor: minor(5000) },
        { name: 'אורי', netMinor: minor(2000) },
        { name: 'רני', netMinor: minor(-3000) },
        { name: 'מור', netMinor: minor(-4000) },
      ],
      sharedCosts: [],
      transfers: [
        { fromId: 'mor', fromName: 'מור', toName: 'דנה', amountMinor: minor(4000) },
        { fromId: 'rani', fromName: 'רני', toName: 'דנה', amountMinor: minor(1000) },
        { fromId: 'rani', fromName: 'רני', toName: 'אורי', amountMinor: minor(2000) },
      ],
    });

    expect(text).toContain('סיכום');
    expect(text).toContain('4 שחקנים');
    expect(text).toContain('תוצאות:');
    expect(text).toContain('+');
    expect(text).toContain('50');
    expect(text).toContain('−'); // U+2212 minus, per 07-hebrew-glossary.md#bidi-rules
    expect(text).toContain('30');
    expect(text).toContain('העברות:');
    expect(text).toContain('מור משלם לדנה');
    expect(text).toContain('40');
    // Winner (דנה) sorted first regardless of input order.
    expect(text.indexOf('דנה')).toBeLessThan(text.indexOf('מור'));
  });

  it('routes a pot transfer through "מהקופה ל" instead of "משלם ל"', () => {
    const text = formatFinalSettlementText(t, {
      gameName: 'פוקר',
      date: '26.07.25',
      buyAmountMinor: BUY_AMOUNT,
      chipsPerBuy: CHIPS_PER_BUY,
      playerCount: 2,
      currency: 'ILS',
      locale: 'he',
      results: [
        { name: 'דנה', netMinor: minor(6000) },
        { name: 'רני', netMinor: minor(-4000) },
      ],
      sharedCosts: [],
      transfers: [{ fromId: POT_ID, fromName: '', toName: 'דנה', amountMinor: minor(6000) }],
    });

    expect(text).toContain('מהקופה לדנה');
    expect(text).not.toContain('משלם');
  });

  it('adds a shared-costs line before the transfers when there are any', () => {
    const text = formatFinalSettlementText(t, {
      gameName: 'פוקר',
      date: '26.07.25',
      buyAmountMinor: BUY_AMOUNT,
      chipsPerBuy: CHIPS_PER_BUY,
      playerCount: 6,
      currency: 'ILS',
      locale: 'he',
      results: [],
      sharedCosts: [{ label: 'פיצה', amountMinor: minor(12000), perPersonMinor: minor(2000) }],
      transfers: [],
    });

    expect(text).toContain('הוצאות משותפות: פיצה');
    expect(text).toContain('120');
    expect(text).toContain('20');
    expect(text).toContain('לאחד');
  });

  it('omits the transfers heading entirely when there is nothing to move', () => {
    const text = formatFinalSettlementText(t, {
      gameName: 'פוקר',
      date: '26.07.25',
      buyAmountMinor: BUY_AMOUNT,
      chipsPerBuy: CHIPS_PER_BUY,
      playerCount: 2,
      currency: 'ILS',
      locale: 'he',
      results: [
        { name: 'א', netMinor: minor(0) },
        { name: 'ב', netMinor: minor(0) },
      ],
      sharedCosts: [],
      transfers: [],
    });
    expect(text).not.toContain('העברות:');
  });
});
