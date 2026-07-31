import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@components/BottomSheet';
import { Button } from '@components/shared/Button';
import { decideJoinRequest, listPendingJoinRequests, type JoinRequest } from '@data/joinRequests';
import { decideClaim, listPendingClaims, type PlayerClaim } from '@data/claims';

export interface PendingRequestsSheetProps {
  open: boolean;
  onClose: () => void;
  gameId: string;
  /** Player id → display name, for rendering a claim's target row. */
  playerNames: ReadonlyMap<string, string>;
}

/**
 * The host's pending-requests sheet (04-ux-spec.md#the-viewers-experience): one list, join
 * requests and guest-row claims together, each row captioned by how the person arrived. Approving
 * a join request offers player-or-viewer via the two buttons rather than a picker — matches the
 * mockup's `[ דחה ] [ אשר ]` pair; "אשר כצופה" is the one extra action a plain approve/reject
 * pair doesn't cover, added as a third, lighter button rather than a sheet-in-a-sheet.
 */
export function PendingRequestsSheet({ open, onClose, gameId, playerNames }: PendingRequestsSheetProps) {
  const { t } = useTranslation();
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [claims, setClaims] = useState<PlayerClaim[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    const [requests, pendingClaims] = await Promise.all([
      listPendingJoinRequests(gameId),
      listPendingClaims(gameId),
    ]);
    setJoinRequests(requests);
    setClaims(pendingClaims);
  }

  useEffect(() => {
    if (!open) return;
    void (async () => {
      await refresh();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, gameId]);

  async function handleJoinDecision(request: JoinRequest, approve: boolean): Promise<void> {
    setBusyId(request.id);
    try {
      await decideJoinRequest(request.id, approve);
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function handleClaimDecision(claim: PlayerClaim, approve: boolean): Promise<void> {
    setBusyId(claim.id);
    try {
      await decideClaim(claim.id, approve);
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  const empty = joinRequests.length === 0 && claims.length === 0;

  return (
    <BottomSheet open={open} onClose={onClose} title={t('pendingRequests.title')}>
      <div className="flex flex-col gap-3">
        {empty && <p className="text-body-sm text-fg-tertiary">{t('pendingRequests.empty')}</p>}

        {joinRequests.map((request) => (
          <div key={request.id} className="flex flex-col gap-2 rounded-lg bg-surface-raised p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-body font-semibold text-fg">{request.requestedName}</span>
              <div className="flex gap-1.5">
                <Button
                  variant="secondary"
                  disabled={busyId === request.id}
                  onClick={() => void handleJoinDecision(request, false)}
                >
                  {t('ui.reject')}
                </Button>
                <Button
                  variant="primary"
                  disabled={busyId === request.id}
                  onClick={() => void handleJoinDecision(request, true)}
                >
                  {t('ui.approve')}
                </Button>
              </div>
            </div>
            <p className="text-caption text-fg-tertiary">
              {t(
                request.source === 'in_app'
                  ? 'pendingRequests.arrivedInApp'
                  : 'pendingRequests.arrivedViaLink',
              )}
            </p>
          </div>
        ))}

        {claims.map((claim) => (
          <div key={claim.id} className="flex flex-col gap-2 rounded-lg bg-surface-raised p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-body font-semibold text-fg">
                {t('pendingRequests.claimLabel', {
                  name: playerNames.get(claim.gamePlayerId) ?? '',
                })}
              </span>
              <div className="flex gap-1.5">
                <Button
                  variant="secondary"
                  disabled={busyId === claim.id}
                  onClick={() => void handleClaimDecision(claim, false)}
                >
                  {t('ui.reject')}
                </Button>
                <Button
                  variant="primary"
                  disabled={busyId === claim.id}
                  onClick={() => void handleClaimDecision(claim, true)}
                >
                  {t('ui.approve')}
                </Button>
              </div>
            </div>
            <p className="text-caption text-fg-tertiary">{t('pendingRequests.claimExplainer')}</p>
          </div>
        ))}
      </div>
    </BottomSheet>
  );
}
