import { createClient, type SupabaseClient, type SupportedStorage } from '@supabase/supabase-js';
import { db } from '@core/offline/db';

/**
 * The session persists across reloads — decided, not a compromise
 * (CLAUDE.md#Security): signing the host out because they backgrounded the
 * app mid-game is unacceptable. IndexedDB over `localStorage` per that same
 * section — a marginal gain, not a defence; the CSP and the XSS rules are
 * what actually matter. Reuses `db.meta` (already a plain string k/v store
 * for `localActorId`) rather than adding a Dexie table for one more thing.
 */
const storage: SupportedStorage = {
  async getItem(key) {
    const record = await db.meta.get(key);
    return record?.value ?? null;
  },
  async setItem(key, value) {
    await db.meta.put({ key, value });
  },
  async removeItem(key) {
    await db.meta.delete(key);
  },
};

/**
 * `null` when the two `VITE_SUPABASE_*` vars aren't configured — true in
 * every environment except a real build with the repo secrets wired in
 * (docs/build/PLAN.md step 12), and in this sandbox, which has no way to
 * reach the real project. Consumers (`useSession`, `SupabaseSyncTransport`)
 * treat `null` as "cloud features unavailable", never throw: the app must
 * stay buildable and the local-only experience must stay fully usable
 * without it (CLAUDE.md's offline-first rule doesn't have a step-12
 * exception).
 */
export const supabase: SupabaseClient | null =
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
    ? createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
        auth: {
          storage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;
