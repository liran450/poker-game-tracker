import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
// Real i18next singleton, not a mock — asserting the actual he.json output (docs/build/NOTES.md).
import '@i18n/index';
import { minor } from '@core/money';
import type { PastGameResult } from '@data/gameHistory';
import { PastGameResultsView } from './PastGameResultsView';

function renderView(loadResult: (gameId: string) => Promise<PastGameResult | null>) {
  return render(
    <MemoryRouter>
      <PastGameResultsView gameId="game-1" loadResult={loadResult} />
    </MemoryRouter>,
  );
}

const sampleResult: PastGameResult = {
  summary: {
    gameId: 'game-1',
    groupId: null,
    name: 'פוקר יום חמישי',
    playedOn: '2026-08-01',
    currency: 'ILS',
    buyAmountMinor: minor(5000),
    chipsPerBuy: 100,
    playerCount: 2,
    durationMinutes: 180,
    totalBuyInsMinor: minor(15000),
    totalCashPotMinor: minor(15000),
    unaccountedMinor: minor(0),
    sharedCostsMinor: minor(0),
    isPrivate: false,
    finishedAt: '2026-08-02T02:00:00.000Z',
  },
  players: [
    {
      id: 'pr-1',
      gameId: 'game-1',
      groupId: null,
      isPrivate: false,
      userId: null,
      guestName: 'מור',
      displayName: 'מור',
      buysCount: 2,
      owedMinor: minor(10000),
      cashPaidMinor: minor(10000),
      chipsFinal: 150,
      cashOutMinor: minor(7500),
      netMinor: minor(-2500),
      sharedCostsShareMinor: minor(0),
      minutesPlayed: 180,
      settledPosition: 1,
    },
    {
      id: 'pr-2',
      gameId: 'game-1',
      groupId: null,
      isPrivate: false,
      userId: null,
      guestName: 'רני',
      displayName: 'רני',
      buysCount: 1,
      owedMinor: minor(5000),
      cashPaidMinor: minor(5000),
      chipsFinal: 750,
      cashOutMinor: minor(7500),
      netMinor: minor(2500),
      sharedCostsShareMinor: minor(0),
      minutesPlayed: 180,
      settledPosition: 2,
    },
  ],
  transfers: [
    {
      gameId: 'game-1',
      fromName: 'מור',
      toName: 'רני',
      fromUserId: null,
      toUserId: null,
      amountMinor: minor(2500),
      orderIndex: 0,
    },
  ],
};

describe('<PastGameResultsView>', () => {
  it('shows a loading state, then the game summary once the remote fetch resolves', async () => {
    renderView(() => Promise.resolve(sampleResult));

    expect(screen.getByText('טוען…')).toBeInTheDocument();

    await waitFor(() => expect(screen.getAllByText('מור').length).toBeGreaterThan(0));
    expect(screen.getAllByText('רני').length).toBeGreaterThan(0);
    expect(screen.getByText('יומן הפעילות של משחק זה כבר לא זמין')).toBeInTheDocument();
  });

  it('shows a friendly dead end when the game is not found (purged, or RLS hides it)', async () => {
    renderView(() => Promise.resolve(null));

    await waitFor(() => expect(screen.getByText('המשחק לא נמצא')).toBeInTheDocument());
    expect(
      screen.getByText('המשחק נמחק, פג תוקפו, או שאין לך הרשאה לצפות בו'),
    ).toBeInTheDocument();
  });

  it('re-fetches when gameId changes', async () => {
    const loadResult = vi.fn(() => Promise.resolve(sampleResult));
    const { rerender } = render(
      <MemoryRouter>
        <PastGameResultsView gameId="game-1" loadResult={loadResult} />
      </MemoryRouter>,
    );
    await waitFor(() => expect(loadResult).toHaveBeenCalledWith('game-1'));

    rerender(
      <MemoryRouter>
        <PastGameResultsView gameId="game-2" loadResult={loadResult} />
      </MemoryRouter>,
    );
    await waitFor(() => expect(loadResult).toHaveBeenCalledWith('game-2'));
  });
});
