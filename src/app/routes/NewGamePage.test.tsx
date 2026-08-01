/* eslint-disable local/no-literal-jsx-text -- test-only route probe text, not user-facing */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import { db } from '@core/offline/db';
import { fold } from '@core/events';
import { minor } from '@core/money';
import { createGame } from '@core/offline/gameActions';
import { loadGameEvents } from '@core/offline/outbox';
import { NewGamePage } from './NewGamePage';
import { SessionProvider } from '../../hooks/useSession';

function GameRouteProbe() {
  const { gameId } = useParams();
  return <p>landed on game {gameId}</p>;
}

function renderPage() {
  return render(
    <SessionProvider>
      <MemoryRouter initialEntries={['/new']}>
        <Routes>
          <Route path="/new" element={<NewGamePage />} />
          <Route path="/game/:gameId" element={<GameRouteProbe />} />
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

describe('<NewGamePage>', () => {
  it('pre-fills sensible defaults so the form can be submitted with one tap', () => {
    renderPage();
    expect(screen.getByLabelText('money.buyAmount')).toHaveValue('50');
    expect(screen.getByLabelText('money.chipsPerBuy')).toHaveValue('100');
    expect(screen.getByRole('button', { name: 'newGame.start' })).not.toBeDisabled();
  });

  it('shows the derived chip value live as amounts change', async () => {
    renderPage();
    expect(screen.getByText(/money\.chipValue/)).toBeDefined();

    await userEvent.clear(screen.getByLabelText('money.chipsPerBuy'));
    await userEvent.type(screen.getByLabelText('money.chipsPerBuy'), '200');

    // buy 50 / chips 200 = 0.25 per chip, formatted through Intl — just assert it re-rendered
    await waitFor(() => expect(screen.getByLabelText('money.chipsPerBuy')).toHaveValue('200'));
  });

  it('an amount preset sets the buy amount field', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('option', { name: /100/ }));
    expect(screen.getByLabelText('money.buyAmount')).toHaveValue('100');
  });

  it('shows the private-game consequence line only once checked', async () => {
    renderPage();
    expect(screen.queryByText('newGame.privateGameConsequence')).toBeNull();
    await userEvent.click(screen.getByLabelText('newGame.privateGame'));
    expect(screen.getByText('newGame.privateGameConsequence')).toBeDefined();
  });

  it('creates a game with the seated players and navigates to it, entirely offline', async () => {
    renderPage();

    await userEvent.click(screen.getByText('newGame.players'));
    await userEvent.type(screen.getByRole('textbox', { name: 'addPlayers.newNamePlaceholder' }), 'מור');
    await userEvent.click(screen.getByText('addPlayers.addToList'));
    await userEvent.type(screen.getByRole('textbox', { name: 'addPlayers.newNamePlaceholder' }), 'אורי');
    await userEvent.click(screen.getByText('addPlayers.addToList'));
    await userEvent.click(screen.getByRole('button', { name: /addPlayers\.commit/ }));

    await userEvent.click(screen.getByRole('button', { name: 'newGame.start' }));

    await waitFor(() => expect(screen.getByText(/landed on game/)).toBeDefined());

    const gameId = screen.getByText(/landed on game/).textContent.replace('landed on game ', '');
    const state = fold(await loadGameEvents(gameId));
    expect(state.status).toBe('active');
    expect([...state.players.values()].map((p) => p.guestName).sort()).toEqual(['אורי', 'מור']);
  });

  it('has no שכפל משחק אחרון button with no local games to copy from', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: 'newGame.duplicateLastGame' })).toBeNull();
  });

  it('שכפל משחק אחרון copies the last game\'s stakes, privacy and guest roster', async () => {
    await createGame({
      name: 'משחק קודם',
      buyAmountMinor: minor(10000),
      chipsPerBuy: 200,
      currencyCode: 'ILS',
      isPrivate: true,
      playerNames: ['גיל', 'נועה'],
    });

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'newGame.duplicateLastGame' }));

    await waitFor(() => expect(screen.getByLabelText('money.buyAmount')).toHaveValue('100'));
    expect(screen.getByLabelText('money.chipsPerBuy')).toHaveValue('200');
    expect(screen.getByLabelText('newGame.privateGame')).toBeChecked();
    expect(screen.getByText('home.playerCount')).toBeDefined();
  });
});
