import { db } from './db';

const LOCAL_ACTOR_ID_KEY = 'localActorId';
const CURRENT_PROFILE_ID_KEY = 'currentProfileId';

let cached: string | null = null;

/**
 * The `actorId` events are stamped with before accounts exist (step 12). A
 * random id, minted once and kept in IndexedDB rather than `localStorage` —
 * consistent with the session-storage preference in CLAUDE.md#Security, even
 * though this id carries no privilege of its own. It has nothing to do with a
 * real profile id and is never meant to survive sign-in as anything but a
 * device fingerprint.
 */
export async function getLocalActorId(): Promise<string> {
  if (cached) return cached;

  const existing = await db.meta.get(LOCAL_ACTOR_ID_KEY);
  if (existing) {
    cached = existing.value;
    return cached;
  }

  const id = crypto.randomUUID();
  await db.meta.put({ key: LOCAL_ACTOR_ID_KEY, value: id });
  cached = id;
  return id;
}

let cachedProfileId: string | null | undefined;

/**
 * The signed-in profile id, once one exists — `null` before sign-in or once
 * signed out. Kept in `db.meta` (not just memory) so a reload mid-session
 * doesn't briefly fall back to the device id and stamp a real event with it;
 * set/cleared by `src/data`'s session logic, which is the only thing that
 * knows whether a real Supabase session is live. `core/offline` never talks
 * to Supabase itself — this is just the local record of the fact.
 */
export async function getCurrentProfileId(): Promise<string | null> {
  if (cachedProfileId !== undefined) return cachedProfileId;
  const existing = await db.meta.get(CURRENT_PROFILE_ID_KEY);
  cachedProfileId = existing?.value ?? null;
  return cachedProfileId;
}

export async function setCurrentProfileId(id: string | null): Promise<void> {
  cachedProfileId = id;
  if (id === null) await db.meta.delete(CURRENT_PROFILE_ID_KEY);
  else await db.meta.put({ key: CURRENT_PROFILE_ID_KEY, value: id });
}

/**
 * The id every new event should be stamped with: the real profile id once
 * signed in, falling back to the device-local id before that (or if signed
 * out again — CLAUDE.md's offline-first rule has no step-12 exception, so a
 * signed-out device must keep working). `gameActions.ts` uses this
 * exclusively now; `getLocalActorId` itself is still called directly by the
 * one-time local-game migration, which needs the *old* device id specifically
 * to know what to rewrite away from.
 */
export async function getActorId(): Promise<string> {
  const profileId = await getCurrentProfileId();
  return profileId ?? getLocalActorId();
}

/** Test-only: clears the in-memory caches so a cleared `db.meta` is actually reflected. */
export function resetIdentityCacheForTests(): void {
  cached = null;
  cachedProfileId = undefined;
}
