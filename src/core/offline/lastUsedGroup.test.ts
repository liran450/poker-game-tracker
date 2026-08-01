import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { getLastUsedGroupId, setLastUsedGroupId } from './lastUsedGroup';

beforeEach(async () => {
  await db.meta.clear();
});

describe('lastUsedGroup', () => {
  it('is null before anything is set', async () => {
    expect(await getLastUsedGroupId()).toBeNull();
  });

  it('remembers the last group set', async () => {
    await setLastUsedGroupId('group-1');
    expect(await getLastUsedGroupId()).toBe('group-1');
  });

  it('clears back to null', async () => {
    await setLastUsedGroupId('group-1');
    await setLastUsedGroupId(null);
    expect(await getLastUsedGroupId()).toBeNull();
  });
});
