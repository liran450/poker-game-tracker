/** 24-hour `HH:MM`, per 07-hebrew-glossary.md#formatting-conventions ("Times: 24-hour, 23:42"). */
export function formatTimeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString('he', { hour: '2-digit', minute: '2-digit', hour12: false });
}
