import { db } from './db';

const LOCAL_ACTOR_ID_KEY = 'localActorId';

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
