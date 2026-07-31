import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  getCurrentUser,
  isCloudConfigured,
  onAuthUserChange,
  signInWithGoogle,
  signInWithMagicLink,
  signOut,
} from './auth';
import { FakeAuthClient } from './testSupport/fakeAuthClient';

function client(fake: FakeAuthClient): SupabaseClient {
  return { auth: fake } as unknown as SupabaseClient;
}

describe('isCloudConfigured', () => {
  it('is false in this environment — no VITE_SUPABASE_* vars are set for tests', () => {
    expect(isCloudConfigured()).toBe(false);
  });
});

describe('getCurrentUser', () => {
  it('resolves null when no client is configured, without throwing', async () => {
    expect(await getCurrentUser(null)).toBeNull();
  });

  it('resolves null before any sign-in', async () => {
    const fake = new FakeAuthClient();
    expect(await getCurrentUser(client(fake))).toBeNull();
  });

  it('resolves the signed-in user after emitSignedIn', async () => {
    const fake = new FakeAuthClient();
    fake.emitSignedIn({ id: 'user-1', email: 'dana@example.com' });
    expect(await getCurrentUser(client(fake))).toEqual({ id: 'user-1', email: 'dana@example.com' });
  });
});

describe('onAuthUserChange', () => {
  it('is a no-op subscription when no client is configured', () => {
    const calls: unknown[] = [];
    const unsubscribe = onAuthUserChange((user) => calls.push(user), null);
    unsubscribe();
    expect(calls).toEqual([]);
  });

  it('fires on sign-in and sign-out', () => {
    const fake = new FakeAuthClient();
    const calls: unknown[] = [];
    onAuthUserChange((user) => calls.push(user), client(fake));

    fake.emitSignedIn({ id: 'user-1', email: 'dana@example.com' });
    fake.emitSignedOut();

    expect(calls).toEqual([{ id: 'user-1', email: 'dana@example.com' }, null]);
  });

  it('stops firing after unsubscribe', () => {
    const fake = new FakeAuthClient();
    const calls: unknown[] = [];
    const unsubscribe = onAuthUserChange((user) => calls.push(user), client(fake));
    unsubscribe();

    fake.emitSignedIn({ id: 'user-1', email: null });

    expect(calls).toEqual([]);
  });
});

describe('signInWithGoogle', () => {
  it('throws when no client is configured', async () => {
    await expect(signInWithGoogle(undefined as unknown as SupabaseClient)).rejects.toThrow(
      /no Supabase client configured/,
    );
  });

  it('requests the google provider with a redirect back to the current page', async () => {
    const fake = new FakeAuthClient();
    await signInWithGoogle(client(fake));
    expect(fake.oauthCalls).toEqual([{ provider: 'google', redirectTo: window.location.href }]);
  });
});

describe('signInWithMagicLink', () => {
  it('sends a trimmed email through signInWithOtp', async () => {
    const fake = new FakeAuthClient();
    await signInWithMagicLink('  dana@example.com  ', client(fake));
    expect(fake.otpCalls).toEqual([{ email: 'dana@example.com', redirectTo: window.location.href }]);
  });
});

describe('signOut', () => {
  it('calls the client and clears the session', async () => {
    const fake = new FakeAuthClient();
    fake.emitSignedIn({ id: 'user-1', email: null });
    await signOut(client(fake));
    expect(fake.signOutCalls).toEqual(1);
    expect(await getCurrentUser(client(fake))).toBeNull();
  });
});
