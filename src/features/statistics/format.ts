import { MINUS } from '@core/money';

/**
 * A percentage for display inside Hebrew text — same bidi concern `<Money>` exists for
 * (CLAUDE.md#rendering-amounts): a signed number needs isolation, or it can reorder inside RTL
 * text. Callers wrap the result in a `dir="ltr"` span, same pattern as `<Money>` itself.
 */
export function formatPercent(fraction: number, locale: string, showSign = false): string {
  const formatter = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 });
  const formatted = formatter.format(Math.abs(fraction));
  if (showSign) {
    if (fraction > 0) return `+${formatted}`;
    if (fraction < 0) return `${MINUS}${formatted}`;
    return formatted;
  }
  return fraction < 0 ? `${MINUS}${formatted}` : formatted;
}

/** `H:MM`, matching `useElapsedTime`'s convention — a poker night runs hours, not seconds. */
export function formatDurationMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** `0` (Sunday) – `6` (Saturday) → the `statistics.weekdayN` i18n key. */
export function weekdayKey(weekday: number): string {
  return `statistics.weekday${weekday}`;
}
