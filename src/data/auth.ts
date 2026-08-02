import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

/**
 * The two providers `02-architecture.md#auth` names: Google (one tap) and
 * email magic link (no password to invent or forget on a phone keyboard).
 * This module is the only place that talks to `supabase.auth` directly —
 * `useSession` (outside `src/data/`) drives the UI from these functions
 * instead of the raw client, matching the repository-layer seam step 12
 * introduced for `SyncTransport`.
 *
 * A domain-local `AppUser` is exported rather than re-exporting supabase-js's
 * own `User`/`Session` types, so nothing outside `src/data/` ever needs to
 * import from `@supabase/supabase-js` to use this module — the lint rule
 * only bans the import, not structurally-compatible types, but there's no
 * reason to tempt it.
 */
export interface AppUser {
  readonly id: string;
  readonly email: string | null;
}

export function isCloudConfigured(): boolean {
  return supabase !== null;
}

function requireClient(client: SupabaseClient | null = supabase): SupabaseClient {
  if (!client) {
    throw new Error(
      'auth: no Supabase client configured (VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY missing)',
    );
  }
  return client;
}

function toAppUser(user: { id: string; email?: string | null } | null | undefined): AppUser | null {
  if (!user) return null;
  return { id: user.id, email: user.email ?? null };
}

/**
 * `window.location.href` on this app always already contains a `#/...` hash
 * route (hash routing — CLAUDE.md, GitHub Pages has no SPA fallback). Handing
 * that straight to Supabase as the redirect target means the session token
 * it appends on return lands as a *second* `#` in the URL; only the first `#`
 * in a URL starts the fragment, so `access_token` ends up merged into the
 * route path instead of parsing as its own key, and `detectSessionInUrl`
 * silently finds nothing. Stripping the hash (and any query string) leaves
 * Supabase's own token fragment as the URL's only `#`, which it can parse.
 */
function authRedirectUrl(): string {
  return window.location.origin + window.location.pathname;
}

/** `null` when cloud sync isn't configured — offline-first has no step-12 exception, never throws. */
export async function getCurrentUser(client: SupabaseClient | null = supabase): Promise<AppUser | null> {
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return toAppUser(data.session?.user);
}

/** Fires once immediately with the current state, then on every sign-in/sign-out. Returns the unsubscribe. */
export function onAuthUserChange(
  callback: (user: AppUser | null) => void,
  client: SupabaseClient | null = supabase,
): () => void {
  if (!client) return () => {};
  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((_event, session) => {
    callback(toAppUser(session?.user));
  });
  return () => subscription.unsubscribe();
}

/** One tap — redirects back to the app's origin (see `authRedirectUrl`, not the current hash route). */
export async function signInWithGoogle(client: SupabaseClient = requireClient()): Promise<void> {
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: authRedirectUrl() },
  });
  if (error) throw error;
}

export async function signInWithMagicLink(
  email: string,
  client: SupabaseClient = requireClient(),
): Promise<void> {
  const { error } = await client.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: authRedirectUrl() },
  });
  if (error) throw error;
}

export async function signOut(client: SupabaseClient = requireClient()): Promise<void> {
  const { error } = await client.auth.signOut();
  if (error) throw error;
}
