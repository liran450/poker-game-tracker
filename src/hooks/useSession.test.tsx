import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
/* eslint-disable local/no-literal-jsx-text -- test-only probe labels, not user-facing copy */
import { db } from '@core/offline/db';
import { getCurrentProfileId, resetIdentityCacheForTests } from '@core/offline/localIdentity';

const authMocks = vi.hoisted(() => ({
  isCloudConfigured: vi.fn(() => true),
  getCurrentUser: vi.fn(),
  onAuthUserChange: vi.fn(),
  signInWithGoogle: vi.fn(),
  signInWithMagicLink: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('@data/auth', () => authMocks);

const profileMocks = vi.hoisted(() => ({
  getProfile: vi.fn(),
  createProfile: vi.fn(),
}));
vi.mock('@data/profiles', () => ({
  ...profileMocks,
  UsernameTakenError: class UsernameTakenError extends Error {},
}));

const migrationMocks = vi.hoisted(() => ({ migrateAllLocalGames: vi.fn(() => Promise.resolve()) }));
vi.mock('@data/localGameMigration', () => migrationMocks);

const { SessionProvider, useSession } = await import('./useSession');

function Probe() {
  const session = useSession();
  return (
    <dl>
      <dt>loading</dt>
      <dd data-testid="loading">{String(session.loading)}</dd>
      <dt>user</dt>
      <dd data-testid="user">{session.user?.id ?? 'none'}</dd>
      <dt>needsProfile</dt>
      <dd data-testid="needsProfile">{String(session.needsProfile)}</dd>
      <dt>profile</dt>
      <dd data-testid="profile">{session.profile?.username ?? 'none'}</dd>
    </dl>
  );
}

let authChangeCallback: (user: { id: string; email: string | null } | null) => void = () => {};

beforeEach(async () => {
  await db.meta.clear();
  resetIdentityCacheForTests();
  vi.clearAllMocks();
  authMocks.isCloudConfigured.mockReturnValue(true);
  authMocks.getCurrentUser.mockResolvedValue(null);
  authMocks.onAuthUserChange.mockImplementation((callback: typeof authChangeCallback) => {
    authChangeCallback = callback;
    return () => {};
  });
});

describe('SessionProvider / useSession', () => {
  it('is not loading and has no user when the cloud is not configured', () => {
    authMocks.isCloudConfigured.mockReturnValue(false);

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );

    expect(screen.getByTestId('loading')).toHaveTextContent('false');
    expect(screen.getByTestId('user')).toHaveTextContent('none');
    expect(authMocks.getCurrentUser).not.toHaveBeenCalled();
  });

  it('resolves loading to false with no user when nobody is signed in', async () => {
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('user')).toHaveTextContent('none');
    expect(screen.getByTestId('needsProfile')).toHaveTextContent('false');
  });

  it('flags needsProfile when a user is signed in but has no profile row yet', async () => {
    profileMocks.getProfile.mockResolvedValue(null);

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));

    authChangeCallback({ id: 'user-1', email: 'dana@example.com' });

    await waitFor(() => expect(screen.getByTestId('needsProfile')).toHaveTextContent('true'));
    expect(screen.getByTestId('user')).toHaveTextContent('user-1');
  });

  it('adopts an existing profile, stamps it as the current actor id, and migrates local games once', async () => {
    profileMocks.getProfile.mockResolvedValue({
      id: 'user-1',
      username: 'dana',
      displayName: 'Dana',
      defaultNickname: null,
    });

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));

    authChangeCallback({ id: 'user-1', email: 'dana@example.com' });

    await waitFor(() => expect(screen.getByTestId('profile')).toHaveTextContent('dana'));
    expect(screen.getByTestId('needsProfile')).toHaveTextContent('false');
    await waitFor(async () => expect(await getCurrentProfileId()).toEqual('user-1'));
    expect(migrationMocks.migrateAllLocalGames).toHaveBeenCalledWith('user-1');
    expect(migrationMocks.migrateAllLocalGames).toHaveBeenCalledTimes(1);
  });

  it('clears the profile and the current actor id on sign-out', async () => {
    profileMocks.getProfile.mockResolvedValue({
      id: 'user-1',
      username: 'dana',
      displayName: 'Dana',
      defaultNickname: null,
    });

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    authChangeCallback({ id: 'user-1', email: null });
    await waitFor(() => expect(screen.getByTestId('profile')).toHaveTextContent('dana'));

    authChangeCallback(null);

    await waitFor(() => expect(screen.getByTestId('profile')).toHaveTextContent('none'));
    expect(screen.getByTestId('user')).toHaveTextContent('none');
    await waitFor(async () => expect(await getCurrentProfileId()).toBeNull());
  });
});
