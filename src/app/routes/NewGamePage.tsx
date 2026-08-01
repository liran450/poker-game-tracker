import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { AppShell } from '@components/AppShell';
import { Button } from '@components/shared/Button';
import { TextField } from '@components/shared/TextField';
import { SelectionChip } from '@components/SelectionChip';
import { InfoExplainer } from '@components/InfoExplainer';
import { AddPlayersSheet } from '@features/game/AddPlayersSheet';
import { formatDateShort } from '@features/game/time';
import { createGame, type AccountPlayerPick } from '@core/offline/gameActions';
import { getLastUsedGroupId, setLastUsedGroupId } from '@core/offline/lastUsedGroup';
import { listRecentPlayers } from '@core/offline/recentPlayers';
import { formatChipValue, formatMoney, fromMajor } from '@core/money';
import { listMyGroups, type Group } from '@data/groups';
import { useGroupMemberOptions } from '../../hooks/useGroupMemberOptions';
import { useSession } from '../../hooks/useSession';

const CURRENCY = 'ILS'; // inherited from the group; not user-visible in v1 (01-product-spec.md#61)
const AMOUNT_PRESETS = [20, 50, 100];

export function NewGamePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const session = useSession();
  const locale = i18n.resolvedLanguage ?? 'he';

  const [name, setName] = useState(() =>
    t('newGame.defaultName', { date: formatDateShort(new Date()) }),
  );
  const [buyAmountMajor, setBuyAmountMajor] = useState(50);
  const [chipsPerBuy, setChipsPerBuy] = useState(100);
  const [isPrivate, setIsPrivate] = useState(false);
  const [playerNames, setPlayerNames] = useState<string[]>([]);
  const [accountPlayers, setAccountPlayers] = useState<AccountPlayerPick[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);

  const recentNames = useLiveQuery(() => listRecentPlayers().then((r) => r.map((p) => p.name)), []) ?? [];
  const groupMembers = useGroupMemberOptions(groupId, session.cloudConfigured);

  useEffect(() => {
    if (!session.cloudConfigured || !session.profile) return;
    let cancelled = false;
    void listMyGroups().then((groups) => {
      if (cancelled) return;
      setMyGroups(groups);
    });
    return () => {
      cancelled = true;
    };
  }, [session.cloudConfigured, session.profile]);

  useEffect(() => {
    if (myGroups.length === 0) return;
    void getLastUsedGroupId().then((id) => {
      if (id !== null && myGroups.some((g) => g.id === id)) setGroupId(id);
    });
  }, [myGroups]);

  const safeChipsPerBuy = chipsPerBuy > 0 ? chipsPerBuy : 1;
  const buyAmountMinor = fromMajor(buyAmountMajor, CURRENCY);
  const chipValueLabel = formatChipValue(buyAmountMinor, safeChipsPerBuy, locale, CURRENCY);
  const canStart = buyAmountMajor > 0 && chipsPerBuy > 0 && !submitting;
  const totalPlayerCount = playerNames.length + accountPlayers.length;

  async function handleStart() {
    if (!canStart) return;
    setSubmitting(true);
    const { gameId } = await createGame({
      name: name.trim() || t('newGame.defaultName', { date: formatDateShort(new Date()) }),
      buyAmountMinor,
      chipsPerBuy,
      currencyCode: CURRENCY,
      isPrivate,
      groupId,
      playerNames,
      accountPlayers,
    });
    if (groupId !== null) await setLastUsedGroupId(groupId);
    void navigate(`/game/${gameId}`);
  }

  return (
    <AppShell
      header={
        <div className="flex items-center px-5 py-3">
          <h1 className="text-heading font-bold">{t('newGame.title')}</h1>
        </div>
      }
      footer={
        <div className="px-4 py-3">
          <Button variant="primary" fullWidth size="lg" disabled={!canStart} onClick={() => void handleStart()}>
            {t('newGame.start')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6 p-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="new-game-name" className="text-body-sm font-semibold text-fg-tertiary">
            {t('newGame.nameLabel')}
          </label>
          <TextField id="new-game-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-2">
            <label htmlFor="new-game-buy-amount" className="text-body-sm font-semibold text-fg-tertiary">
              {t('money.buyAmount')}
            </label>
            <TextField
              id="new-game-buy-amount"
              type="text"
              inputMode="decimal"
              value={String(buyAmountMajor)}
              onChange={(e) => setBuyAmountMajor(Number(e.target.value) || 0)}
            />
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <label htmlFor="new-game-chips-per-buy" className="text-body-sm font-semibold text-fg-tertiary">
              {t('money.chipsPerBuy')}
            </label>
            <TextField
              id="new-game-chips-per-buy"
              type="text"
              inputMode="numeric"
              value={String(chipsPerBuy)}
              onChange={(e) => setChipsPerBuy(Number(e.target.value) || 0)}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {AMOUNT_PRESETS.map((preset) => (
            <SelectionChip
              key={preset}
              label={formatMoney(fromMajor(preset, CURRENCY), { locale, currency: CURRENCY })}
              selected={buyAmountMajor === preset}
              onClick={() => setBuyAmountMajor(preset)}
            />
          ))}
          <SelectionChip
            label={t('newGame.otherAmount')}
            selected={!AMOUNT_PRESETS.includes(buyAmountMajor)}
            onClick={() => document.getElementById('new-game-buy-amount')?.focus()}
          />
        </div>

        <p className="text-body-sm text-fg-secondary">{t('money.chipValue', { value: chipValueLabel })}</p>

        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="flex min-h-tap items-center justify-between rounded-lg border border-line-strong bg-surface-card px-4 text-start"
        >
          <span className="text-body font-semibold">{t('newGame.players')}</span>
          <span className="text-body-sm text-fg-tertiary">
            {totalPlayerCount > 0
              ? t('home.playerCount', { count: totalPlayerCount })
              : t('newGame.noPlayersYet')}
          </span>
        </button>

        {myGroups.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-body-sm font-semibold text-fg-tertiary">{t('newGame.groupLabel')}</span>
            <div className="flex flex-wrap gap-2">
              <SelectionChip
                label={t('newGame.noGroup')}
                selected={groupId === null}
                onClick={() => setGroupId(null)}
              />
              {myGroups.map((group) => (
                <SelectionChip
                  key={group.id}
                  label={group.name}
                  selected={groupId === group.id}
                  onClick={() => setGroupId(group.id)}
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
              id="new-game-private"
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="size-5 accent-accent"
            />
            <label htmlFor="new-game-private" className="text-body font-semibold">
              {t('newGame.privateGame')}
            </label>
            <InfoExplainer content={t('newGame.privateGameExplainer')} />
          </div>
          {isPrivate && (
            <p className="text-body-sm text-fg-tertiary">{t('newGame.privateGameConsequence')}</p>
          )}
        </div>
      </div>

      <AddPlayersSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onCommit={(names, picks) => {
          setPlayerNames((prev) => [...prev, ...names]);
          setAccountPlayers((prev) => [...prev, ...picks]);
        }}
        recentNames={recentNames}
        groupMembers={groupMembers}
      />
    </AppShell>
  );
}
