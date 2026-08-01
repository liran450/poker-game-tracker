import { db } from './db';

const LAST_USED_GROUP_ID_KEY = 'lastUsedGroupId';

/**
 * "Group | חבורה | last used" (01-product-spec.md#61-game-setup-13) — the new-game setup
 * screen's default. Local-only, like every other device preference in `db.meta`; not part of any
 * event, since which group a *future* game defaults to isn't itself game state.
 */
export async function getLastUsedGroupId(): Promise<string | null> {
  const existing = await db.meta.get(LAST_USED_GROUP_ID_KEY);
  return existing?.value ?? null;
}

export async function setLastUsedGroupId(groupId: string | null): Promise<void> {
  if (groupId === null) await db.meta.delete(LAST_USED_GROUP_ID_KEY);
  else await db.meta.put({ key: LAST_USED_GROUP_ID_KEY, value: groupId });
}
