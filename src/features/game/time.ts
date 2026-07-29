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
