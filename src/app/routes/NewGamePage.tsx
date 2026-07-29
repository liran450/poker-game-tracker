import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { AppShell } from '@components/AppShell';
import { Button } from '@components/shared/Button';
import { TextField } from '@components/shared/TextField';
import { SelectionChip } from '@components/SelectionChip';
import { InfoExplainer } from '@components/InfoExplainer';
import { AddPlayersSheet } from '@features/game/AddPlayersSheet';
import { createGame } from '@core/offline/gameActions';
import { listRecentPlayers } from '@core/offline/recentPlayers';
import { formatChipValue, formatMoney, fromMajor } from '@core/money';

const CURRENCY = 'ILS'; // inherited from the group; not user-visible in v1 (01-product-spec.md#61)
const AMOUNT_PRESETS = [20, 50, 100];

function formatDefaultDate(now: Date): string {
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yy = String(now.getFullYear() % 100).padStart(2, '0');
  return `${dd}.${mm}.${yy}`;
}

export function NewGamePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const locale = i18n.resolvedLanguage ?? 'he';

  const [name, setName] = useState(() =>
    t('newGame.defaultName', { date: formatDefaultDate(new Date()) }),
  );
  const [buyAmountMajor, setBuyAmountMajor] = useState(50);
  const [chipsPerBuy, setChipsPerBuy] = useState(100);
  const [isPrivate, setIsPrivate] = useState(false);
  const [playerNames, setPlayerNames] = useState<string[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const recentNames = useLiveQuery(() => listRecentPlayers().then((r) => r.map((p) => p.name)), []) ?? [];

  const safeChipsPerBuy = chipsPerBuy > 0 ? chipsPerBuy : 1;
  const buyAmountMinor = fromMajor(buyAmountMajor, CURRENCY);
  const chipValueLabel = formatChipValue(buyAmountMinor, safeChipsPerBuy, locale, CURRENCY);
  const canStart = buyAmountMajor > 0 && chipsPerBuy > 0 && !submitting;

  async function handleStart() {
    if (!canStart) return;
    setSubmitting(true);
    const { gameId } = await createGame({
      name: name.trim() || t('newGame.defaultName', { date: formatDefaultDate(new Date()) }),
      buyAmountMinor,
      chipsPerBuy,
      currencyCode: CURRENCY,
      isPrivate,
      playerNames,
    });
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
            {playerNames.length > 0
              ? t('home.playerCount', { count: playerNames.length })
              : t('newGame.noPlayersYet')}
          </span>
        </button>

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
        onCommit={(names) => setPlayerNames((prev) => [...prev, ...names])}
        recentNames={recentNames}
      />
    </AppShell>
  );
}
