import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import {
  getActorId,
  getCurrentProfileId,
  getLocalActorId,
  resetIdentityCacheForTests,
  setCurrentProfileId,
} from './localIdentity';

beforeEach(async () => {
  await db.meta.clear();
  resetIdentityCacheForTests();
});

describe('getLocalActorId', () => {
  it('mints one random id and persists it across calls', async () => {
    const first = await getLocalActorId();
    const second = await getLocalActorId();
    expect(first).toEqual(second);
    expect(first).toHaveLength(36);
  });

  it('survives a fresh in-memory cache by reading back from db.meta', async () => {
    const minted = await getLocalActorId();
    resetIdentityCacheForTests();
    expect(await getLocalActorId()).toEqual(minted);
  });
});

describe('getCurrentProfileId / setCurrentProfileId', () => {
  it('is null before any profile is set', async () => {
    expect(await getCurrentProfileId()).toBeNull();
  });

  it('persists a set id across a fresh in-memory cache', async () => {
    await setCurrentProfileId('profile-1');
    resetIdentityCacheForTests();
    expect(await getCurrentProfileId()).toEqual('profile-1');
  });

  it('clears back to null on sign-out', async () => {
    await setCurrentProfileId('profile-1');
    await setCurrentProfileId(null);
    resetIdentityCacheForTests();
    expect(await getCurrentProfileId()).toBeNull();
  });
});

describe('getActorId', () => {
  it('falls back to the device-local id before any profile is set', async () => {
    const localId = await getLocalActorId();
    expect(await getActorId()).toEqual(localId);
  });

  it('prefers the signed-in profile id once one is set', async () => {
    await getLocalActorId();
    await setCurrentProfileId('profile-1');
    expect(await getActorId()).toEqual('profile-1');
  });

  it('falls back to the device id again after sign-out', async () => {
    const localId = await getLocalActorId();
    await setCurrentProfileId('profile-1');
    await setCurrentProfileId(null);
    expect(await getActorId()).toEqual(localId);
  });
});
