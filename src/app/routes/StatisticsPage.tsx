import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { AppShell } from '@components/AppShell';
import { Banner } from '@components/Banner';
import { EmptyState } from '@components/EmptyState';
import { Button } from '@components/shared/Button';
import { IconButton } from '@components/shared/IconButton';
import { SelectionChip } from '@components/SelectionChip';
import {
  computeFunStatistics,
  computeGroupPlayerStatistics,
  computeGroupTableStatistics,
  computePersonalStatistics,
  summarizeCurrency,
  type PersonalResultEntry,
} from '@core/statistics';
import { listMyGroups, type Group } from '@data/groups';
import { getGroupStatisticsSource, getPersonalStatisticsSource, type GroupStatisticsSource } from '@data/statistics';
import { FunStatsRow } from '@features/statistics/FunStatsRow';
import { GroupLeaderboard } from '@features/statistics/GroupLeaderboard';
import { GroupTableStats } from '@features/statistics/GroupTableStats';
import { PersonalStatsView } from '@features/statistics/PersonalStatsView';
import { useSession } from '../../hooks/useSession';

/** `'all'` is the sentinel for "הכל" (no group filter); anything else is a real group id. */
type Scope = string;
const ALL_SCOPE: Scope = 'all';
type Tab = 'personal' | 'group';

/**
 * The screen map's "Statistics" node (04-ux-spec.md#statistics, 06-statistics.md,
 * docs/build/PLAN.md step 15). No mockup covers this screen — built in the established visual
 * language per CLAUDE.md's "extend it yourself" working style, the same way `AccountPage` and
 * `GroupsListPage` were for steps 12/14.
 *
 * One group switcher (a chip row: "הכל" plus each of the caller's groups) feeds both tabs:
 * "שלי" reads personal figures scoped to whichever chip is selected (06-statistics.md#scoping's
 * שלי/הכל distinction is really the same query with/without a group_id filter), and "החבורה" —
 * only reachable once a real group is selected, since a group leaderboard can't aggregate across
 * group boundaries — reads that group's leaderboard, table stats and fun stats together.
 */
export function StatisticsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const session = useSession();

  const [groups, setGroups] = useState<Group[]>([]);
  const [scope, setScope] = useState<Scope>(ALL_SCOPE);
  const [tab, setTab] = useState<Tab>('personal');
  // A group leaderboard can't aggregate across group boundaries, so "החבורה" only means anything
  // once a real group is selected — computed at render time rather than synced via an effect.
  const activeTab: Tab = scope === ALL_SCOPE ? 'personal' : tab;
  const [personalEntries, setPersonalEntries] = useState<PersonalResultEntry[] | null>(null);
  const [groupSource, setGroupSource] = useState<GroupStatisticsSource | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session.cloudConfigured || !session.profile) return;
    void (async () => {
      setGroups(await listMyGroups());
    })();
  }, [session.cloudConfigured, session.profile]);

  useEffect(() => {
    void (async () => {
      const profile = session.profile;
      if (!session.cloudConfigured || !profile) return;
      setLoading(true);
      setError(null);
      try {
        const entries = await getPersonalStatisticsSource(profile.id, scope === ALL_SCOPE ? null : scope);
        setPersonalEntries(entries);
      } catch {
        setError(t('statistics.genericError'));
      } finally {
        setLoading(false);
      }
    })();
  }, [session.cloudConfigured, session.profile, scope, t]);

  useEffect(() => {
    void (async () => {
      if (activeTab !== 'group' || scope === ALL_SCOPE) return;
      setLoading(true);
      setError(null);
      try {
        setGroupSource(await getGroupStatisticsSource(scope));
      } catch {
        setError(t('statistics.genericError'));
      } finally {
        setLoading(false);
      }
    })();
  }, [activeTab, scope, t]);

  const personalStats = personalEntries ? computePersonalStatistics(personalEntries) : null;

  const groupPlayerStats = groupSource
    ? computeGroupPlayerStatistics(groupSource.results, groupSource.games, groupSource.displayNames, groupSource.statsVisibility)
    : [];
  const groupTableStats = groupSource ? computeGroupTableStatistics(groupSource.games, groupSource.results) : null;
  const funStats = groupSource
    ? computeFunStatistics(
        groupSource.results,
        groupSource.games,
        groupSource.transfers,
        groupSource.displayNames,
        groupPlayerStats,
        session.profile?.id ?? null,
      )
    : null;
  const groupCurrency = groupSource ? summarizeCurrency(groupSource.games) : null;

  return (
    <AppShell
      header={
        <div className="flex items-center gap-2 px-2 py-3">
          <IconButton label={t('game.backToHome')} onClick={() => void navigate('/')}>
            {'✕'}
          </IconButton>
          <h1 className="text-heading font-bold">{t('statistics.title')}</h1>
        </div>
      }
    >
      <div className="flex flex-col gap-4 p-4">
        {!session.cloudConfigured ? (
          <Banner variant="info">{t('auth.notConfigured')}</Banner>
        ) : session.loading ? null : !session.profile ? (
          <div className="flex flex-col items-start gap-3">
            <Banner variant="info">{t('statistics.signInRequired')}</Banner>
            <Button variant="primary" onClick={() => void navigate('/account')}>
              {t('statistics.signIn')}
            </Button>
          </div>
        ) : (
          <>
            {error && <Banner variant="error">{error}</Banner>}

            {groups.length > 0 && (
              <div className="flex flex-wrap gap-2" role="listbox" aria-label={t('statistics.groupSwitcher')}>
                <SelectionChip
                  label={t('statistics.allGroupsChip')}
                  selected={scope === ALL_SCOPE}
                  onClick={() => setScope(ALL_SCOPE)}
                />
                {groups.map((group) => (
                  <SelectionChip
                    key={group.id}
                    label={group.name}
                    selected={scope === group.id}
                    onClick={() => setScope(group.id)}
                  />
                ))}
              </div>
            )}

            <div className="flex gap-2 border-b border-line">
              <button
                type="button"
                className={[
                  'min-h-tap px-3 text-body font-semibold',
                  activeTab === 'personal' ? 'border-b-2 border-accent text-fg' : 'text-fg-tertiary',
                ].join(' ')}
                onClick={() => setTab('personal')}
              >
                {t('statistics.tabPersonal')}
              </button>
              {scope !== ALL_SCOPE && (
                <button
                  type="button"
                  className={[
                    'min-h-tap px-3 text-body font-semibold',
                    activeTab === 'group' ? 'border-b-2 border-accent text-fg' : 'text-fg-tertiary',
                  ].join(' ')}
                  onClick={() => setTab('group')}
                >
                  {t('statistics.tabGroup')}
                </button>
              )}
            </div>

            {loading && <p className="text-body-sm text-fg-tertiary">{t('statistics.loading')}</p>}

            {activeTab === 'personal' &&
              (personalStats === null ? null : personalStats.gamesPlayed === 0 ? (
                <EmptyState
                  title={t('statistics.emptyPersonalTitle')}
                  description={t('statistics.emptyPersonalDescription')}
                />
              ) : (
                <PersonalStatsView stats={personalStats} />
              ))}

            {activeTab === 'group' &&
              (groupSource === null ? null : groupTableStats === null || groupTableStats.gamesCount === 0 ? (
                <EmptyState
                  title={t('statistics.emptyGroupTitle')}
                  description={t('statistics.emptyGroupDescription')}
                />
              ) : (
                <div className="flex flex-col gap-4">
                  {groupCurrency?.mixed && (
                    <p className="text-caption text-fg-tertiary">{t('statistics.currencyMixedNote')}</p>
                  )}
                  <GroupLeaderboard players={groupPlayerStats} currency={groupCurrency?.currency ?? 'ILS'} />
                  <GroupTableStats stats={groupTableStats} currency={groupCurrency?.currency ?? 'ILS'} />
                  {funStats && <FunStatsRow stats={funStats} currency={groupCurrency?.currency ?? 'ILS'} />}
                </div>
              ))}
          </>
        )}
      </div>
    </AppShell>
  );
}
