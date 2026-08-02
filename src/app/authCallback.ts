/**
 * True when the current URL hash looks like a Supabase auth callback
 * fragment (a magic-link/OAuth token, or an auth error) rather than a normal
 * app route. `App` uses this to hold off rendering the hash router's `*`
 * (not-found) fallback while `detectSessionInUrl` is still parsing the token
 * out of the hash — otherwise the not-found screen flashes for a moment
 * before the router settles back on `/`.
 */
export function looksLikeAuthCallback(hash: string): boolean {
  return /access_token=|error_description=|error_code=/.test(hash);
}
