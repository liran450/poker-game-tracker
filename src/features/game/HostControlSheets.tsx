import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@components/BottomSheet';
import { Button } from '@components/shared/Button';
import { formatRelativeTime } from './time';

export interface HandOverTarget {
  readonly userId: string;
  readonly name: string;
}

export interface HandOverHostSheetProps {
  open: boolean;
  onClose: () => void;
  targets: readonly HandOverTarget[];
  onHandOver: (userId: string) => void;
}

/**
 * `⋯` → `העבר ניהול` (04-ux-spec.md#handing-over-6). Guests can't be host — they have no
 * account — so `targets` is only ever signed-in current players/viewers; the caller is
 * responsible for that filtering (`LiveGameView`), same shape as every other list this screen
 * builds from live state.
 */
export function HandOverHostSheet({ open, onClose, targets, onHandOver }: HandOverHostSheetProps) {
  const { t } = useTranslation();
  return (
    <BottomSheet open={open} onClose={onClose} title={t('hostControl.handOverTitle')}>
      {targets.length === 0 ? (
        <p className="text-body-sm text-fg-tertiary">{t('hostControl.handOverEmpty')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {targets.map((target) => (
            <Button
              key={target.userId}
              variant="secondary"
              fullWidth
              onClick={() => {
                onHandOver(target.userId);
                onClose();
              }}
            >
              {target.name}
            </Button>
          ))}
        </div>
      )}
    </BottomSheet>
  );
}

export interface TakeOverHostConfirmProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  currentHostName: string;
  /** `games.host_last_synced_at` — null means never observed synced at all. */
  hostLastSyncedAt: string | null;
  locale: string;
}

type SyncFreshness = 'fresh' | 'stale' | 'unknown';

function syncFreshness(hostLastSyncedAt: string | null): SyncFreshness {
  if (hostLastSyncedAt === null) return 'unknown';
  const ageMs = Date.now() - new Date(hostLastSyncedAt).getTime();
  return ageMs <= 2 * 60_000 ? 'fresh' : 'stale';
}

/**
 * `⋯` → `קח ניהול` (04-ux-spec.md#host-takeover-warning). No waiting period — the warning is
 * the whole guardrail, not a gate. An `unknown` freshness (host_last_synced_at never stamped —
 * e.g. an offline-only game that never reached the server) needs a second tap, matching the
 * spec's escalation ("the confirm button requires a second tap").
 */
export function TakeOverHostConfirm({
  open,
  onClose,
  onConfirm,
  currentHostName,
  hostLastSyncedAt,
  locale,
}: TakeOverHostConfirmProps) {
  const { t } = useTranslation();
  const [armed, setArmed] = useState(false);
  const freshness = syncFreshness(hostLastSyncedAt);

  function handleClose(): void {
    setArmed(false);
    onClose();
  }

  function handleConfirmTap(): void {
    if (freshness === 'unknown' && !armed) {
      setArmed(true);
      return;
    }
    onConfirm();
    handleClose();
  }

  return (
    <BottomSheet open={open} onClose={handleClose} title={t('hostControl.takeOverTitle')}>
      <div className="flex flex-col gap-3">
        <p className="text-body-sm text-fg-secondary">
          {t('hostControl.takeOverCurrentHost', { name: currentHostName })}
        </p>
        <p
          className={
            freshness === 'fresh'
              ? 'text-body-sm font-semibold text-positive'
              : freshness === 'stale'
                ? 'text-body-sm font-semibold text-accent'
                : 'text-body-sm font-semibold text-negative'
          }
        >
          {hostLastSyncedAt !== null
            ? t('hostControl.takeOverLastSynced', {
                time: formatRelativeTime(hostLastSyncedAt, locale),
              })
            : t('hostControl.takeOverLastSyncedUnknown')}
        </p>
        <p className="text-body-sm text-fg-secondary">
          {freshness === 'stale' ? t('hostControl.takeOverWarningStale') : t('hostControl.takeOverWarning')}
        </p>
        <div className="flex flex-col gap-2.5">
          <Button variant="destructive" fullWidth onClick={handleConfirmTap}>
            {armed ? t('hostControl.takeOverConfirmAgain') : t('hostControl.takeOverConfirm')}
          </Button>
          <Button variant="ghost" fullWidth onClick={handleClose}>
            {t('ui.cancel')}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
