import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import { db } from '@core/offline/db';
import { createGame } from '@core/offline/gameActions';
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
