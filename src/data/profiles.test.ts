import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createProfile, getProfile, UsernameTakenError } from './profiles';
import { FakePostgrestClient } from './testSupport/fakePostgrestClient';

function client(fake: FakePostgrestClient): SupabaseClient {
  return fake as unknown as SupabaseClient;
}

function fakeWithUniqueUsername(): FakePostgrestClient {
  const fake = new FakePostgrestClient();
  fake.setUniqueColumns('profiles', ['username']);
  return fake;
}

describe('getProfile', () => {
  it('returns null when no row exists yet', async () => {
    const fake = fakeWithUniqueUsername();
    expect(await getProfile('user-1', client(fake))).toBeNull();
  });

  it('maps the snake_case row to the domain shape', async () => {
    const fake = fakeWithUniqueUsername();
    fake.seed('profiles', [
      { id: 'user-1', username: 'dana', display_name: 'Dana', default_nickname: 'Dani' },
    ]);

    expect(await getProfile('user-1', client(fake))).toEqual({
      id: 'user-1',
      username: 'dana',
      displayName: 'Dana',
      defaultNickname: 'Dani',
    });
  });
});

describe('createProfile', () => {
  it('inserts a row and returns it in the domain shape', async () => {
    const fake = fakeWithUniqueUsername();

    const profile = await createProfile(
      { id: 'user-1', username: 'dana', displayName: 'Dana' },
      client(fake),
    );

    expect(profile).toEqual({ id: 'user-1', username: 'dana', displayName: 'Dana', defaultNickname: null });
    expect(fake.rows('profiles')).toEqual([
      { id: 'user-1', username: 'dana', display_name: 'Dana', default_nickname: null },
    ]);
  });

  it('trims the username, display name and nickname', async () => {
    const fake = fakeWithUniqueUsername();

    const profile = await createProfile(
      { id: 'user-1', username: '  dana  ', displayName: '  Dana  ', defaultNickname: '  Dani  ' },
      client(fake),
    );

    expect(profile).toEqual({ id: 'user-1', username: 'dana', displayName: 'Dana', defaultNickname: 'Dani' });
  });

  it('throws UsernameTakenError, not the raw error, on a unique-constraint collision', async () => {
    const fake = fakeWithUniqueUsername();
    fake.seed('profiles', [
      { id: 'user-1', username: 'dana', display_name: 'Dana', default_nickname: null },
    ]);

    await expect(
      createProfile({ id: 'user-2', username: 'dana', displayName: 'Dana Two' }, client(fake)),
    ).rejects.toThrow(UsernameTakenError);
  });

  it('does not create a row when the username is taken', async () => {
    const fake = fakeWithUniqueUsername();
    fake.seed('profiles', [
      { id: 'user-1', username: 'dana', display_name: 'Dana', default_nickname: null },
    ]);

    await createProfile({ id: 'user-2', username: 'dana', displayName: 'Dana Two' }, client(fake)).catch(
      () => {},
    );

    expect(fake.rows('profiles')).toHaveLength(1);
  });

  it('propagates a non-unique-violation error unchanged', async () => {
    const fake = fakeWithUniqueUsername();
    fake.failNextOperationOn('profiles', 'connection reset');

    await expect(
      createProfile({ id: 'user-1', username: 'dana', displayName: 'Dana' }, client(fake)),
    ).rejects.toThrow('connection reset');
  });
});
