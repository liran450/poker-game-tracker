/** 24-hour `HH:MM`, per 07-hebrew-glossary.md#formatting-conventions ("Times: 24-hour, 23:42"). */
export function formatTimeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString('he', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** `DD.MM.YY`, per 07-hebrew-glossary.md#formatting-conventions ("Dates: 26.07.25"). */
export function formatDateShort(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear() % 100).padStart(2, '0');
  return `${dd}.${mm}.${yy}`;
}

/**
 * "לפני 4 דקות" — the host takeover warning's last-sync line
 * (04-ux-spec.md#host-takeover-warning) is the one place in the app that needs relative time.
 */
export function formatRelativeTime(iso: string, locale: string, now: Date = new Date()): string {
  const diffMs = new Date(iso).getTime() - now.getTime();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const diffMinutes = Math.round(diffMs / 60_000);
  if (Math.abs(diffMinutes) < 60) return rtf.format(diffMinutes, 'minute');
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return rtf.format(diffHours, 'hour');
  return rtf.format(Math.round(diffHours / 24), 'day');
}
