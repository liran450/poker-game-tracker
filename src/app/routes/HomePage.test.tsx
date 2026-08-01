import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import { fold } from '@core/events';
import { db } from '@core/offline/db';
import {
  addBuyIn,
  beginSettlement,
  createGame,
  finalizeGame,
  settlePlayer,
} from '@core/offline/gameActions';
import { loadGameEvents } from '@core/offline/outbox';
import { minor } from '@core/money';
import { SessionProvider } from '../../hooks/useSession';
import { HomePage } from './HomePage';

beforeEach(async () => {
  await Promise.all([
    db.games.clear(),
    db.events.clear(),
    db.outbox.clear(),
    db.recentPlayers.clear(),
    db.meta.clear(),
    db.snapshots.clear(),
  ]);
});

describe('<HomePage>', () => {
  it('shows the empty state with a working call to action when there are no games', () => {
    render(
      <MemoryRouter>
        <SessionProvider>
          <HomePage />
        </SessionProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText('home.startFirstGame')).toBeDefined();
    expect(screen.getAllByText('home.newGame').length).toBeGreaterThan(0);
  });

  it('lists an active game with its real player count once one exists', async () => {
    await createGame({
      name: 'פוקר — 26.07.26',
      buyAmountMinor: minor(5000),
      chipsPerBuy: 100,
      currencyCode: 'ILS',
      isPrivate: false,
      playerNames: ['מור', 'אורי', 'רני', 'דנה'],
    });

    render(
      <MemoryRouter>
        <SessionProvider>
          <HomePage />
        </SessionProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('פוקר — 26.07.26')).toBeDefined());
    expect(screen.getByText('home.playerCount')).toBeDefined();
  });

  it('lists a finished game under "recent finished games", separately from active games', async () => {
    const { gameId } = await createGame({
      name: 'משחק שהסתיים',
      buyAmountMinor: minor(5000),
      chipsPerBuy: 100,
      currencyCode: 'ILS',
      isPrivate: false,
      playerNames: ['מור', 'אורי'],
    });
    const state = fold(await loadGameEvents(gameId));
    for (const player of state.players.values()) {
      await addBuyIn(gameId, player.id);
      await settlePlayer(gameId, player.id, 100);
    }
    await beginSettlement(gameId);
    await finalizeGame(gameId, {
      name: 'משחק שהסתיים',
      playedOn: '2026-08-01',
      currency: 'ILS',
      isPrivate: false,
    });

    render(
      <MemoryRouter>
        <SessionProvider>
          <HomePage />
        </SessionProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('home.recentGamesTitle')).toBeDefined());
    expect(screen.getByText('משחק שהסתיים')).toBeDefined();
  });

  it('shows the private badge only for private games', async () => {
    await createGame({
      name: 'משחק סודי',
      buyAmountMinor: minor(5000),
      chipsPerBuy: 100,
      currencyCode: 'ILS',
      isPrivate: true,
      playerNames: ['מור'],
    });

    render(
      <MemoryRouter>
        <SessionProvider>
          <HomePage />
        </SessionProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('game.privateBadge')).toBeDefined());
  });
});
