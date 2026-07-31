import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { db } from '@core/offline/db';
import { createGame } from '@core/offline/gameActions';
import { minor } from '@core/money';
import { SessionProvider } from '../../hooks/useSession';
import { GamePage } from './GamePage';

function renderGame(gameId: string) {
  return render(
    <SessionProvider>
      <MemoryRouter initialEntries={[`/game/${gameId}`]}>
        <Routes>
          <Route path="/game/:gameId" element={<GamePage />} />
        </Routes>
      </MemoryRouter>
    </SessionProvider>,
  );
}

beforeEach(async () => {
  await Promise.all([
    db.games.clear(),
    db.events.clear(),
    db.outbox.clear(),
    db.recentPlayers.clear(),
    db.meta.clear(),
  ]);
});

describe('<GamePage>', () => {
  it('seats every player created at setup, entirely offline', async () => {
    const { gameId } = await createGame({
      name: 'פוקר — 26.07.26',
      buyAmountMinor: minor(5000),
      chipsPerBuy: 100,
      currencyCode: 'ILS',
      isPrivate: false,
      playerNames: ['מור', 'אורי', 'רני', 'דנה'],
    });

    renderGame(gameId);

    await waitFor(() => expect(screen.getByText('מור')).toBeDefined());
    for (const name of ['אורי', 'רני', 'דנה']) {
      expect(screen.getByText(name)).toBeDefined();
    }
  });

  it('seats an additional player via + שחקן without leaving the page', async () => {
    const { gameId } = await createGame({
      name: 'פוקר — 26.07.26',
      buyAmountMinor: minor(5000),
      chipsPerBuy: 100,
      currencyCode: 'ILS',
      isPrivate: false,
      playerNames: ['מור'],
    });

    renderGame(gameId);
    await waitFor(() => expect(screen.getByText('מור')).toBeDefined());

    await userEvent.click(screen.getByText('game.addPlayer'));
    await userEvent.type(screen.getByRole('textbox', { name: 'addPlayers.newNamePlaceholder' }), 'שי');
    await userEvent.click(screen.getByText('addPlayers.addToList'));
    await userEvent.click(screen.getByRole('button', { name: /addPlayers\.commit/ }));

    await waitFor(() => expect(screen.getByText('שי')).toBeDefined());
  });

  it('renames a guest inline from the row action sheet', async () => {
    const { gameId } = await createGame({
      name: 'פוקר — 26.07.26',
      buyAmountMinor: minor(5000),
      chipsPerBuy: 100,
      currencyCode: 'ILS',
      isPrivate: false,
      playerNames: ['מור'],
    });

    renderGame(gameId);
    await waitFor(() => expect(screen.getByText('מור')).toBeDefined());

    await userEvent.click(screen.getByRole('button', { name: 'players.rowActions' }));
    await userEvent.click(screen.getByText('players.rename'));
    const field = screen.getByLabelText('players.renameLabel');
    await userEvent.clear(field);
    await userEvent.type(field, 'הכריש');
    await userEvent.click(screen.getByText('ui.save'));

    await waitFor(() => expect(screen.getByText('הכריש')).toBeDefined());
  });

  it('removing a player re-resolves the (1) suffix on the remaining duplicate', async () => {
    const { gameId } = await createGame({
      name: 'פוקר — 26.07.26',
      buyAmountMinor: minor(5000),
      chipsPerBuy: 100,
      currencyCode: 'ILS',
      isPrivate: false,
      playerNames: ['מור', 'מור'],
    });

    renderGame(gameId);
    await waitFor(() => expect(screen.getByText('מור')).toBeDefined());
    expect(screen.getByText('מור (1)')).toBeDefined();

    // Remove the first "מור" (seat 0) via its row actions.
    const actionButtons = screen.getAllByRole('button', { name: 'players.rowActions' });
    await userEvent.click(actionButtons[0]!);
    await userEvent.click(screen.getByText('players.remove'));

    await waitFor(() => expect(screen.queryByText('מור (1)')).toBeNull());
    expect(screen.getByText('מור')).toBeDefined();
  });
});
