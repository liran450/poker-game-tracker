import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@components/BottomSheet';
import type { AuditCategory, AuditLogEntry } from '@core/auditLog';
import { describeAuditEntry } from './auditLogText';
import { formatTimeOfDay } from './time';

export type AuditFilter = 'all' | AuditCategory | 'undone';

export interface AuditLogDrawerProps {
  open: boolean;
  onClose: () => void;
  entries: readonly AuditLogEntry[];
  /** playerId → display name, for the entries that carry one. */
  playerNames: ReadonlyMap<string, string>;
  currency: string;
  locale: string;
  onUndo: (entry: AuditLogEntry) => void;
}

const FILTERS: readonly AuditFilter[] = ['all', 'buy_ins', 'settlements', 'management', 'undone'];

/**
 * The audit log drawer (04-ux-spec.md#audit-log-drawer-22): newest first,
 * live, filterable. Undone actions stay in the log but are hidden behind the
 * dedicated "בוטלים" filter rather than shown inline, per spec. Reversible
 * entries offer undo via a tap-to-confirm affordance rather than literal
 * long-press timing — easier to discover, easier to test, same outcome.
 */
export function AuditLogDrawer({
  open,
  onClose,
  entries,
  playerNames,
  currency,
  locale,
  onUndo,
}: AuditLogDrawerProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<AuditFilter>('all');
  const [confirmingUndoId, setConfirmingUndoId] = useState<string | null>(null);

  const newestFirst = useMemo(() => [...entries].reverse(), [entries]);
  const visible = newestFirst.filter((entry) =>
    filter === 'undone' ? entry.isUndone : !entry.isUndone && (filter === 'all' || entry.category === filter),
  );

  return (
    <BottomSheet open={open} onClose={onClose} title={t('auditLog.title')} className="max-h-[60dvh]">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label={t('auditLog.title')}>
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={[
                'min-h-9 rounded-pill border px-3 text-caption font-semibold',
                filter === f
                  ? 'border-accent bg-surface-amber-dim text-fg'
                  : 'border-line-strong bg-surface-card text-fg-secondary',
              ].join(' ')}
            >
              {t(`auditLog.filter.${f}`)}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-1" aria-live="polite">
          {visible.length === 0 ? (
            <p className="py-6 text-center text-body-sm text-fg-disabled">{t('auditLog.empty')}</p>
          ) : (
            visible.map((entry) => {
              const playerName = entry.playerId ? (playerNames.get(entry.playerId) ?? null) : null;
              const line = describeAuditEntry(t, entry, {
                playerName,
                currency,
                locale,
                time: formatTimeOfDay(entry.at),
              });

              if (entry.isUndone) {
                return (
                  <p key={entry.id} className="flex items-center gap-2 py-1.5 text-body-sm text-fg-disabled">
                    <span className="line-through">{line}</span>
                    <span className="shrink-0 rounded-pill bg-surface-raised px-2 py-0.5 text-caption">
                      {t('ui.undone')}
                    </span>
                  </p>
                );
              }

              if (!entry.isReversible) {
                return (
                  <p key={entry.id} className="py-1.5 text-body-sm text-fg-secondary">
                    {line}
                  </p>
                );
              }

              return (
                <div key={entry.id} className="flex items-center justify-between gap-2 py-1.5">
                  <p className="text-body-sm text-fg-secondary">{line}</p>
                  {confirmingUndoId === entry.id ? (
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onUndo(entry);
                          setConfirmingUndoId(null);
                        }}
                        className="text-caption font-bold text-accent"
                      >
                        {t('ui.undo')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingUndoId(null)}
                        className="text-caption text-fg-tertiary"
                      >
                        {t('ui.cancel')}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingUndoId(entry.id)}
                      aria-label={t('auditLog.undoAction', { action: line })}
                      className="shrink-0 text-caption text-fg-tertiary underline"
                    >
                      {t('ui.undo')}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
