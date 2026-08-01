import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { AppShell } from '@components/AppShell';
import { Banner } from '@components/Banner';
import { InfoExplainer } from '@components/InfoExplainer';
import { Money } from '@components/Money';
import { Button } from '@components/shared/Button';
import { TextField } from '@components/shared/TextField';
import { EmptyState } from '@components/EmptyState';
import { minor } from '@core/money';
import {
  resolveSharedGame,
  resolveSharedSettlement,
  type SharedGameProjection,
  type SharedSettlementProjection,
} from '@data/shareLinks';
import { requestToJoinViaLink } from '@data/joinRequests';
import { submitClaimViaLink } from '@data/claims';
import { TransferRow } from '../../features/game/TransferRow';
import { useSession } from '../../hooks/useSession';

type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'live'; readonly projection: Extract<SharedGameProjection, { kind: 'live' }> }
  | { readonly kind: 'settled'; readonly projection: SharedSettlementProjection };

/**
 * The share-link destination (`/#/s/:token`, 04-ux-spec.md#the-viewers-experience). No table RLS
 * covers anonymous callers at all (03-data-model.md#anonymous-share-access) — every read here
 * goes through `get_shared_game`/`get_shared_settlement`, and every write (asking to join,
 * claiming a guest row) requires signing in first, same as the rest of the app
 * (docs/build/NOTES.md's step-13 decision on anonymous writes).
 *
 * Left undone (docs/build/PROGRESS.md step 13): a *signed-in* viewer who instead opens
 * `/#/game/:id` directly (added via join-request approval, never touching a link) still sees the
 * full host-editing screen — `LiveGameView` has no read-only branch of its own yet. This route is
 * the complete experience for the share-link path specifically, which is what 04-ux-spec.md's own
 * "the viewer's experience" section is written around.
 */
export function SharedGamePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const session = useSession();
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [requestedName, setRequestedName] = useState('');
  const [requestSent, setRequestSent] = useState(false);
  const [claimedPlayerId, setClaimedPlayerId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void resolveSharedGame(token)
      .then((projection) => {
        if (cancelled) return;
        if (projection.kind === 'finished') {
          return resolveSharedSettlement(token).then((settlement) => {
            if (!cancelled) setState({ kind: 'settled', projection: settlement });
          });
        }
        setState({ kind: 'live', projection });
        return undefined;
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'unavailable' });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleRequestToJoin(): Promise<void> {
    if (!token || requestedName.trim() === '') return;
    await requestToJoinViaLink(token, requestedName.trim());
    setRequestSent(true);
  }

  async function handleClaim(gamePlayerId: string): Promise<void> {
    if (!token) return;
    await submitClaimViaLink(token, gamePlayerId);
    setClaimedPlayerId(gamePlayerId);
  }

  if (state.kind === 'loading') return null;

  if (state.kind === 'unavailable') {
    return (
      <AppShell header={<div className="p-4" />}>
        <EmptyState
          icon={<span aria-hidden="true">{'🃏'}</span>}
          title={t('sharedLink.unavailableTitle')}
          description={t('sharedLink.unavailableDescription')}
          action={
            <Button variant="primary" onClick={() => void navigate('/')}>
              {t('game.backToHome')}
            </Button>
          }
        />
      </AppShell>
    );
  }

  if (state.kind === 'settled') {
    const { projection } = state;
    return (
      <AppShell header={<div className="px-4 py-3"><h1 className="text-heading font-bold">{projection.game.name}</h1></div>}>
        <div className="flex flex-col gap-4 p-4">
          <p className="text-body-sm text-fg-tertiary">{t('sharedLink.settledOnly')}</p>
          <div className="flex flex-col gap-2">
            {[...projection.playerResults]
              .sort((a, b) => b.netMinor - a.netMinor)
              .map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg bg-surface-raised p-3">
                  <span className="text-body font-semibold text-fg">
                    {r.displayName || r.guestName || ''}
                  </span>
                  <Money value={minor(r.netMinor)} currency={projection.game.currency} showSign />
                </div>
              ))}
          </div>
          <div className="flex flex-col gap-1.5">
            {projection.transfers.map((tr) => (
              <TransferRow
                key={tr.orderIndex}
                mode="read"
                fromName={tr.fromName}
                toName={tr.toName}
                amountMinor={minor(tr.amountMinor)}
                currency={projection.game.currency}
              />
            ))}
          </div>
        </div>
      </AppShell>
    );
  }

  const { projection } = state;
  const currency = projection.game.currency;
  const currentUserId = session.user?.id ?? null;

  return (
    <AppShell
      header={
        <div className="flex flex-col gap-1.5 px-4 py-3">
          <h1 className="text-heading font-bold">{projection.game.name}</h1>
          <Banner variant="info">{t('sharedLink.viewOnly')}</Banner>
        </div>
      }
      footer={
        <div className="flex flex-col gap-2 px-4 py-3">
          {requestSent ? (
            <p className="text-center text-body-sm text-fg-tertiary">{t('sharedLink.requestSent')}</p>
          ) : session.cloudConfigured && currentUserId !== null ? (
            <div className="flex gap-2">
              <TextField
                aria-label={t('sharedLink.requestedNameLabel')}
                value={requestedName}
                onChange={(e) => setRequestedName(e.target.value)}
                placeholder={t('sharedLink.requestedNameLabel')}
                className="flex-1"
              />
              <Button variant="primary" onClick={() => void handleRequestToJoin()}>
                {t('sharedLink.requestToJoin')}
              </Button>
            </div>
          ) : (
            <Button variant="primary" fullWidth onClick={() => void navigate('/account')}>
              {t('sharedLink.signInToRequest')}
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-2 p-4">
        {[...projection.players]
          .sort((a, b) => a.seatOrder - b.seatOrder)
          .map((p) => {
            const name = p.nickname ? `${p.nickname}` : (p.guestName ?? '');
            const isMine = p.userId !== null && p.userId === currentUserId;
            const canClaim =
              session.cloudConfigured &&
              currentUserId !== null &&
              p.userId === null &&
              claimedPlayerId !== p.id;
            return (
              <div
                key={p.id}
                className={[
                  'flex items-center justify-between rounded-lg bg-surface-raised p-3',
                  isMine ? 'border-2 border-accent' : '',
                ].join(' ')}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-body font-semibold text-fg">{name}</span>
                  <span className="text-caption text-fg-tertiary">
                    {t('buyIn.buyInNumber', { count: p.buysCount })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Money value={minor(p.buysCount * projection.game.buyAmountMinor)} currency={currency} size="sm" />
                  {canClaim && (
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" onClick={() => void handleClaim(p.id)}>
                        {t('sharedLink.claimRow')}
                      </Button>
                      <InfoExplainer content={t('sharedLink.claimExplainer')} />
                    </div>
                  )}
                  {claimedPlayerId === p.id && (
                    <span className="text-caption text-positive">{t('sharedLink.claimSent')}</span>
                  )}
                </div>
              </div>
            );
          })}
        <p className="text-center text-caption text-fg-tertiary">
          {t('share.viewerCount', { count: projection.viewerCount })}
        </p>
      </div>
    </AppShell>
  );
}
