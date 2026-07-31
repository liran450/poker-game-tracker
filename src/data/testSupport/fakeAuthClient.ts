/**
 * A minimal in-memory stand-in for the slice of `@supabase/supabase-js`'s
 * `SupabaseClient['auth']` that `src/data/auth.ts` actually uses —
 * `getSession`/`onAuthStateChange`/`signInWithOAuth`/`signInWithOtp`/
 * `signOut`. Same rationale as `fakePostgrestClient.ts`: no live Supabase
 * endpoint is reachable from this environment, so this drives the real
 * `src/data/auth.ts` functions through real control flow instead of
 * asserting "was this method called with these args".
 */

export interface FakeAuthUser {
  readonly id: string;
  readonly email: string | null;
}

type Listener = (event: string, session: { user: FakeAuthUser } | null) => void;

export class FakeAuthClient {
  private session: { user: FakeAuthUser } | null = null;
  private listeners = new Set<Listener>();
  oauthCalls: { provider: string; redirectTo: string | undefined }[] = [];
  otpCalls: { email: string; redirectTo: string | undefined }[] = [];
  signOutCalls = 0;

  /** Test-only: simulates a real sign-in completing (OAuth redirect back, magic link click). */
  emitSignedIn(user: FakeAuthUser): void {
    this.session = { user };
    for (const listener of this.listeners) listener('SIGNED_IN', this.session);
  }

  emitSignedOut(): void {
    this.session = null;
    for (const listener of this.listeners) listener('SIGNED_OUT', null);
  }

  getSession(): Promise<{ data: { session: { user: FakeAuthUser } | null }; error: null }> {
    return Promise.resolve({ data: { session: this.session }, error: null });
  }

  onAuthStateChange(callback: Listener): { data: { subscription: { unsubscribe: () => void } } } {
    this.listeners.add(callback);
    return { data: { subscription: { unsubscribe: () => this.listeners.delete(callback) } } };
  }

  signInWithOAuth(args: {
    provider: string;
    options?: { redirectTo?: string };
  }): Promise<{ error: Error | null }> {
    this.oauthCalls.push({ provider: args.provider, redirectTo: args.options?.redirectTo });
    return Promise.resolve({ error: null });
  }

  signInWithOtp(args: { email: string; options?: { emailRedirectTo?: string } }): Promise<{ error: Error | null }> {
    this.otpCalls.push({ email: args.email, redirectTo: args.options?.emailRedirectTo });
    return Promise.resolve({ error: null });
  }

  signOut(): Promise<{ error: Error | null }> {
    this.signOutCalls += 1;
    this.emitSignedOut();
    return Promise.resolve({ error: null });
  }
}
