import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { SyncIndicator } from '@components/SyncIndicator';
import type { GameEvent } from '../events';
import { db } from './db';
import { appendEvent, flushOutbox } from './outbox';
import { StubSyncTransport } from './stubTransport';
import { useSyncState } from './useSyncState';

let seq = 0;
function buyIn(gameId: string): GameEvent {
  seq += 1;
  return {
    clientEventId: `evt-${seq}`,
    gameId,
    playerId: 'player-1',
    actorId: 'host-1',
    clientCreatedAt: new Date(Date.UTC(2025, 0, 1) + seq * 1000).toISOString(),
    undoneBy: null,
    type: 'buy_in_added',
    payload: {},
  };
}

function ConnectedIndicator({ gameId }: { gameId: string }) {
  const { state, pendingCount } = useSyncState(gameId);
  return <SyncIndicator state={state} pendingCount={pendingCount} />;
}

beforeEach(async () => {
  await Promise.all([db.games.clear(), db.events.clear(), db.outbox.clear()]);
  seq = 0;
});

describe('useSyncState', () => {
  it('reflects the true pending count from the outbox, not a guess', async () => {
    await appendEvent(buyIn('game-x'));
    await appendEvent(buyIn('game-x'));
    await appendEvent(buyIn('game-x'));

    render(<ConnectedIndicator gameId="game-x" />);

    await waitFor(() => expect(screen.getByText('3')).toBeDefined());
  });

  it('flips to synced once every queued event is pushed', async () => {
    await appendEvent(buyIn('game-y'));
    render(<ConnectedIndicator gameId="game-y" />);
    await waitFor(() => expect(screen.getByText('1')).toBeDefined());

    await flushOutbox(new StubSyncTransport(), 'game-y');

    await waitFor(() => expect(screen.getByRole('button').textContent).toContain('✓'));
  });

  it('shows the failed state once a push has errored', async () => {
    await appendEvent(buyIn('game-z'));
    render(<ConnectedIndicator gameId="game-z" />);
    await waitFor(() => expect(screen.getByText('1')).toBeDefined());

    await flushOutbox(new StubSyncTransport({ failureRate: 1 }), 'game-z');

    await waitFor(() => expect(screen.getByRole('button').textContent).toContain('!'));
  });
});
