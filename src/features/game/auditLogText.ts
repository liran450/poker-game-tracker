import type { TFunction } from 'i18next';
import type { AuditLogEntry } from '@core/auditLog';
import { formatMoneyPlainText, type Minor } from '@core/money';

export interface DescribeAuditEntryOptions {
  readonly playerName: string | null;
  readonly currency: string;
  readonly locale: string;
  readonly time: string;
}

/**
 * The audit log's per-entry line (04-ux-spec.md#audit-log-drawer-22):
 * "{{time}} · {{name}} — {{action}}". Every action phrase is a gender-neutral
 * noun phrase ("קנייה 3", "סגירה עם 120 ז'יטונים") rather than a conjugated
 * verb ("נסגר"/"נסגרה") — the schema carries no gender field for a player, so
 * a single wording has to serve everyone (docs/build/NOTES.md).
 */
export function describeAuditEntry(t: TFunction, entry: AuditLogEntry, options: DescribeAuditEntryOptions): string {
  const { playerName, currency, locale, time } = options;
  const action = describeAction(t, entry, currency, locale);
  return playerName
    ? t('auditLog.line', { time, name: playerName, action })
    : t('auditLog.lineNoPlayer', { time, action });
}

function describeAction(t: TFunction, entry: AuditLogEntry, currency: string, locale: string): string {
  switch (entry.type) {
    case 'buy_in_added':
    case 'buy_in_removed':
      return t('auditLog.buyInAction', { count: entry.buysAfter ?? 0 });

    case 'cash_paid_set': {
      const payload = entry.payload as { amountMinor: number };
      return t('auditLog.cashPaidAction', {
        amount: formatMoneyPlainText(payload.amountMinor as Minor, { locale, currency }),
      });
    }

    case 'player_settled': {
      const payload = entry.payload as { chipsFinal: number };
      return t('auditLog.settledAction', { chips: payload.chipsFinal });
    }

    case 'player_reopened':
      return t('auditLog.reopenedAction');

    case 'chips_set': {
      const payload = entry.payload as { chips: number };
      return t('auditLog.chipsEditedAction', { chips: payload.chips });
    }

    case 'player_added':
      return t('auditLog.playerAddedAction');

    case 'player_removed':
      return t('auditLog.playerRemovedAction');

    case 'player_renamed': {
      const payload = entry.payload as { name: string };
      return t('auditLog.playerRenamedAction', { name: payload.name });
    }

    case 'shared_cost_added': {
      const payload = entry.payload as { label: string; amountMinor: number };
      return t('auditLog.sharedCostAddedAction', {
        label: payload.label,
        amount: formatMoneyPlainText(payload.amountMinor as Minor, { locale, currency }),
      });
    }

    case 'shared_cost_removed':
      return t('auditLog.sharedCostRemovedAction');

    case 'shared_cost_updated': {
      const payload = entry.payload as { label: string };
      return t('auditLog.sharedCostUpdatedAction', { label: payload.label });
    }

    case 'unaccounted_set': {
      const payload = entry.payload as { amountMinor: number };
      return t('auditLog.unaccountedSetAction', {
        amount: formatMoneyPlainText(payload.amountMinor as Minor, { locale, currency }),
      });
    }

    case 'game_started':
      return t('auditLog.gameStartedAction');

    case 'host_changed':
      return t('auditLog.hostChangedAction');

    default:
      return t('auditLog.genericAction', { type: entry.type });
  }
}
