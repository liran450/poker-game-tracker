import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppShell } from '@components/AppShell';
import { Button } from '@components/shared/Button';
import { Card } from '@components/shared/Card';
import { IconButton } from '@components/shared/IconButton';
import { BottomSheet } from '@components/BottomSheet';
import { SelectionChip } from '@components/SelectionChip';
import { Banner } from '@components/Banner';
import { Snackbar } from '@components/Snackbar';
import { SlideToConfirm } from '@components/SlideToConfirm';
import { InfoExplainer } from '@components/InfoExplainer';
import { DestructiveConfirm } from '@components/DestructiveConfirm';
import { EmptyState } from '@components/EmptyState';
import { SyncIndicator } from '@components/SyncIndicator';
import { AnnouncementBanner } from '@components/AnnouncementBanner';
import { StatHero } from '@components/StatHero';
import { Sparkline } from '@components/Sparkline';
import { LeaderboardRow } from '@components/LeaderboardRow';
import { ResultsCard } from '@components/ResultsCard';
import { Money } from '@components/Money';
import { minor } from '@core/money';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-heading font-bold text-accent">{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

export function GalleryPage() {
  const { t } = useTranslation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [chips, setChips] = useState<Record<string, boolean>>({ a: false, b: true, c: false });

  return (
    <AppShell
      header={
        <div className="flex items-center justify-between px-5 py-3">
          <h1 className="text-heading font-bold">{t('gallery.title')}</h1>
          <SyncIndicator state="synced" />
        </div>
      }
      footer={
        <div className="flex items-center justify-around px-4 py-3">
          <Button variant="primary" size="sm">{t('gallery.buttons')}</Button>
          <Button variant="ghost" size="sm">{t('gallery.banners')}</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-8 px-4 py-6">
        {/* Buttons */}
        <Section title={t('gallery.buttons')}>
          <Row>
            <Button variant="primary">{t('ui.confirm')}</Button>
            <Button variant="secondary">{t('ui.edit')}</Button>
            <Button variant="ghost">{t('ui.cancel')}</Button>
            <Button variant="destructive">{t('ui.delete')}</Button>
          </Row>
          <Row>
            <Button variant="primary" size="sm">{t('ui.save')}</Button>
            <Button variant="primary" size="lg" fullWidth>{t('home.startFirstGame')}</Button>
          </Row>
          <Row>
            <Button variant="primary" disabled>{t('ui.confirm')}</Button>
            <IconButton label={t('ui.close')}>{'⋯'}</IconButton>
            <IconButton label={t('ui.close')} size="sm">{'✕'}</IconButton>
          </Row>
        </Section>

        {/* Cards */}
        <Section title={t('gallery.cards')}>
          <Card className="p-4">
            <p className="text-body-sm text-fg-secondary">{t('gallery.noGames')}</p>
          </Card>
          <Card elevated className="p-4">
            <p className="text-body-sm text-fg-secondary">{t('gallery.noGamesDesc')}</p>
          </Card>
        </Section>

        {/* Selection Chips */}
        <Section title={t('gallery.selectionChips')}>
          <Row>
            <SelectionChip
              label={t('gallery.demoName1')}
              selected={!!chips['a']}
              onClick={() => setChips((c) => ({ ...c, a: !c['a'] }))}
            />
            <SelectionChip
              label={t('gallery.demoName2')}
              selected={!!chips['b']}
              onClick={() => setChips((c) => ({ ...c, b: !c['b'] }))}
            />
            <SelectionChip
              label={t('gallery.demoName3')}
              selected={!!chips['c']}
              groupMember
              onClick={() => setChips((c) => ({ ...c, c: !c['c'] }))}
            />
          </Row>
        </Section>

        {/* Banners */}
        <Section title={t('gallery.banners')}>
          <Banner variant="success">{t('money.balanced', { buyTotal: '₪250', chipTotal: '500' })}</Banner>
          <Banner variant="error">{t('money.discrepancy', { amount: '₪50', buyTotal: '₪250', chipTotal: '450' })}</Banner>
          <Banner variant="info">{t('offline.body')}</Banner>
        </Section>

        {/* Sync Indicator */}
        <Section title={t('gallery.syncIndicator')}>
          <Row>
            <SyncIndicator state="synced" />
            <SyncIndicator state="syncing" />
            <SyncIndicator state="pending" pendingCount={3} />
            <SyncIndicator state="failed" />
          </Row>
        </Section>

        {/* Snackbar */}
        <Section title={t('gallery.snackbar')}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setSnackbarOpen(true)}
          >
            {t('gallery.snackbar')}
          </Button>
        </Section>

        {/* Announcement Banner */}
        <Section title={t('gallery.announcementBanner')}>
          <AnnouncementBanner>{t('gallery.sampleAnnouncement')}</AnnouncementBanner>
          <AnnouncementBanner onDismiss={() => undefined}>{t('gallery.sampleAnnouncement')}</AnnouncementBanner>
        </Section>

        {/* Bottom Sheet */}
        <Section title={t('gallery.bottomSheet')}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setSheetOpen(true)}
          >
            {t('gallery.bottomSheet')}
          </Button>
        </Section>

        {/* Slide to Confirm */}
        <Section title={t('gallery.slideToConfirm')}>
          <SlideToConfirm label={t('gallery.endGame')} onConfirm={() => undefined} />
        </Section>

        {/* Info Explainer */}
        <Section title={t('gallery.infoExplainer')}>
          <Row>
            <span className="text-body font-semibold">{t('gallery.infoExplainer')}</span>
            <InfoExplainer content={t('gallery.sampleExplainer')} />
          </Row>
        </Section>

        {/* Destructive Confirm */}
        <Section title={t('gallery.destructiveConfirm')}>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteOpen(true)}
          >
            {t('ui.delete')}
          </Button>
        </Section>

        {/* Empty State */}
        <Section title={t('gallery.emptyState')}>
          <EmptyState
            icon="♠"
            title={t('gallery.noGames')}
            description={t('gallery.noGamesDesc')}
            action={<Button variant="primary" size="sm">{t('home.startFirstGame')}</Button>}
          />
        </Section>

        {/* Stat Hero */}
        <Section title={t('gallery.statHero')}>
          <Card className="py-2">
            <StatHero
              value={minor(12050)}
              currency="ILS"
              label={t('gallery.totalProfit')}
              sampleSize={t('gallery.sampleSize', { count: 42 })}
            />
          </Card>
          <Card className="py-2">
            <StatHero
              value={minor(-3200)}
              currency="ILS"
              label={t('gallery.totalProfit')}
              sampleSize={t('gallery.sampleSize', { count: 8 })}
            />
          </Card>
        </Section>

        {/* Sparkline */}
        <Section title={t('gallery.sparkline')}>
          <Card className="flex items-center justify-center p-4">
            <Sparkline data={[0, 50, 30, 80, 60, 120, 100, 150]} />
          </Card>
          <Card className="flex items-center justify-center p-4">
            <Sparkline data={[0, -20, -50, -30, -80, -60, -100]} />
          </Card>
        </Section>

        {/* Leaderboard */}
        <Section title={t('gallery.leaderboard')}>
          <div className="flex flex-col gap-2">
            <LeaderboardRow rank={1} name={t('gallery.demoFullName1')} value={minor(12050)} currency="ILS" sampleSize={t('gallery.sampleSize', { count: 42 })} />
            <LeaderboardRow rank={2} name={t('gallery.demoFullName2')} value={minor(8300)} currency="ILS" sampleSize={t('gallery.sampleSize', { count: 38 })} />
            <LeaderboardRow rank={3} name={t('gallery.demoFullName3')} value={minor(-3200)} currency="ILS" sampleSize={t('gallery.sampleSize', { count: 35 })} />
          </div>
        </Section>

        {/* Results Card */}
        <Section title={t('gallery.resultsCard')}>
          <ResultsCard
            gameName={t('gallery.gameName')}
            date={t('gallery.gameDate')}
            playerCount={t('gallery.playerCountLabel', { count: 6 })}
            result={<Money value={minor(12050)} currency="ILS" showSign />}
          />
          <ResultsCard
            gameName={t('gallery.gameName')}
            date={t('gallery.gameDate')}
            playerCount={t('gallery.playerCountLabel', { count: 4 })}
            result={<Money value={minor(-5000)} currency="ILS" showSign />}
          >
            <p className="text-body-sm text-fg-tertiary">{t('gallery.noGamesDesc')}</p>
          </ResultsCard>
        </Section>
      </div>

      {/* Modals */}
      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={t('gallery.bottomSheet')}>
        <div className="flex flex-col gap-3">
          <Button variant="primary" fullWidth>{t('ui.confirm')}</Button>
          <Button variant="ghost" fullWidth>{t('ui.cancel')}</Button>
        </div>
      </BottomSheet>

      <Snackbar
        open={snackbarOpen}
        onClose={() => setSnackbarOpen(false)}
        onUndo={() => undefined}
      >
        {t('gallery.sampleSnackbar')}
      </Snackbar>

      <DestructiveConfirm
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => undefined}
        title={t('gallery.deleteTitle')}
        description={t('gallery.deleteDesc')}
        confirmLabel={t('gallery.deleteConfirmLabel')}
      />
    </AppShell>
  );
}
