import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@components/BottomSheet';
import { Button } from '@components/shared/Button';
import {
  createShareLink,
  listShareLinks,
  revokeShareLink,
  rotateShareLink,
  type ShareLink,
} from '@data/shareLinks';
import type { Minor } from '@core/money';
import { formatLiveStatusText, type LiveStatusPlayer } from './shareText';

export interface ShareSheetProps {
  open: boolean;
  onClose: () => void;
  gameId: string;
  hostUserId: string;
  viewerUserIds: readonly string[];
  /** Resolved display names for `viewerUserIds` — fetched once by the caller
   * (`LiveGameView`) and shared with `HandOverHostSheet`, rather than each sheet
   * re-fetching the same profiles. */
  viewerNames: ReadonlyMap<string, string>;
  isFinished: boolean;
  /** Only for the text-preview section — the live-status template
   * (04-ux-spec.md#sharing-5-14's "Text" section). */
  liveStatus: {
    gameName: string;
    date: string;
    buyAmountMinor: Minor;
    chipsPerBuy: number;
    currency: string;
    locale: string;
    players: readonly LiveStatusPlayer[];
    totalMinor: Minor;
  };
}

/**
 * `שיתוף` (04-ux-spec.md#sharing-5-14) — host-only (private-game restriction is enforced by
 * `create_share_link`... actually by `share_links_insert`'s `is_host` RLS policy; nobody else
 * ever reaches this sheet's create/revoke/rotate actions since `LiveGameView` only renders the
 * button for the host). Not built here, deliberately: "add viewer from group members" — there is
 * no group member list to pick from until step 14's groups UI exists; the viewer list below is
 * read-only (who's already watching), matching the sheet's other two sections which are all
 * either read-only or link-management.
 */
export function ShareSheet({
  open,
  onClose,
  gameId,
  hostUserId,
  viewerUserIds,
  viewerNames,
  isFinished,
  liveStatus,
}: ShareSheetProps) {
  const { t } = useTranslation();
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<'link' | 'text' | null>(null);

  useEffect(() => {
    if (!open) return;
    void listShareLinks(gameId).then(setLinks);
  }, [open, gameId]);

  const activeLink = links?.find((l) => l.revokedAt === null) ?? null;
  const [freshUrl, setFreshUrl] = useState<string | null>(null);

  async function handleCreate(): Promise<void> {
    setBusy(true);
    try {
      const { link, url } = await createShareLink(gameId, hostUserId);
      setLinks((prev) => [...(prev ?? []), link]);
      setFreshUrl(url);
    } finally {
      setBusy(false);
    }
  }

  async function handleRotate(): Promise<void> {
    setBusy(true);
    try {
      const { url } = await rotateShareLink(gameId, hostUserId, activeLink?.id ?? null);
      setLinks(await listShareLinks(gameId));
      setFreshUrl(url);
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(): Promise<void> {
    if (!activeLink) return;
    setBusy(true);
    try {
      await revokeShareLink(activeLink.id);
      setLinks(await listShareLinks(gameId));
      setFreshUrl(null);
    } finally {
      setBusy(false);
    }
  }

  function copyOrShare(text: string, kind: 'link' | 'text'): void {
    if (navigator.share) {
      void navigator.share({ text }).catch(() => void navigator.clipboard.writeText(text));
    } else {
      void navigator.clipboard.writeText(text);
    }
    setCopied(kind);
  }

  const statusText = formatLiveStatusText(t, liveStatus);

  return (
    <BottomSheet open={open} onClose={onClose} title={t('share.title')}>
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-2">
          <h2 className="text-body font-semibold text-fg">{t('share.linkSectionTitle')}</h2>
          {activeLink ? (
            <>
              <p className="text-body-sm text-fg-secondary">
                {isFinished ? t('share.linkGrantsFinished') : t('share.linkGrantsLive')}
              </p>
              <p className="text-caption text-fg-tertiary">
                {t('share.linkExpiry')}
                {activeLink.viewCount > 0 && ` · ${t('share.viewerCount', { count: activeLink.viewCount })}`}
              </p>
              {freshUrl && (
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    fullWidth
                    disabled={busy}
                    onClick={() => copyOrShare(freshUrl, 'link')}
                  >
                    {t('share.shareLink')}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      void navigator.clipboard.writeText(freshUrl);
                      setCopied('link');
                    }}
                  >
                    {t('ui.copy')}
                  </Button>
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="secondary" fullWidth disabled={busy} onClick={() => void handleRotate()}>
                  {t('share.rotateLink')}
                </Button>
                <Button variant="destructive" fullWidth disabled={busy} onClick={() => void handleRevoke()}>
                  {t('share.revokeLink')}
                </Button>
              </div>
            </>
          ) : (
            <Button variant="primary" fullWidth disabled={busy || links === null} onClick={() => void handleCreate()}>
              {t('share.createLink')}
            </Button>
          )}
          {copied === 'link' && <p className="text-caption text-positive">{t('share.copied')}</p>}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-body font-semibold text-fg">{t('share.viewersSectionTitle')}</h2>
          {viewerUserIds.length === 0 ? (
            <p className="text-body-sm text-fg-tertiary">{t('share.noViewers')}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {viewerUserIds.map((id) => (
                <li key={id} className="text-body-sm text-fg-secondary">
                  {viewerNames.get(id) ?? t('share.unknownViewer')}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-body font-semibold text-fg">{t('share.textSectionTitle')}</h2>
          <p className="whitespace-pre-wrap rounded-lg bg-surface-raised p-3 text-body-sm text-fg-secondary">
            {statusText}
          </p>
          <div className="flex gap-2">
            <Button variant="primary" fullWidth onClick={() => copyOrShare(statusText, 'text')}>
              {t('ui.share')}
            </Button>
            <Button
              variant="secondary"
              fullWidth
              onClick={() => {
                void navigator.clipboard.writeText(statusText);
                setCopied('text');
              }}
            >
              {t('ui.copy')}
            </Button>
          </div>
          {copied === 'text' && <p className="text-caption text-positive">{t('share.copied')}</p>}
        </section>
      </div>
    </BottomSheet>
  );
}
