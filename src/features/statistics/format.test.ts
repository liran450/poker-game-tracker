import { describe, expect, it } from 'vitest';
import { MINUS } from '@core/money';
import { formatDurationMinutes, formatPercent, weekdayKey } from './format';

describe('formatPercent', () => {
  it('formats a positive fraction without a sign by default', () => {
    expect(formatPercent(0.62, 'en')).toBe('62%');
  });

  it('uses U+2212, not a hyphen, for a negative value', () => {
    const formatted = formatPercent(-0.67, 'en');
    expect(formatted).toBe(`${MINUS}67%`);
    expect(formatted).not.toContain('-');
  });

  it('adds an explicit + for a positive value when showSign is set', () => {
    expect(formatPercent(0.1, 'en', true)).toBe('+10%');
  });
});

describe('formatDurationMinutes', () => {
  it('formats H:MM, zero-padded', () => {
    expect(formatDurationMinutes(185)).toBe('03:05');
    expect(formatDurationMinutes(0)).toBe('00:00');
  });
});

describe('weekdayKey', () => {
  it('maps a weekday index to its i18n key', () => {
    expect(weekdayKey(0)).toBe('statistics.weekday0');
    expect(weekdayKey(6)).toBe('statistics.weekday6');
  });
});
