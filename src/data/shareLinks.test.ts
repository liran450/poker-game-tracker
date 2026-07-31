import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  createShareLink,
  listShareLinks,
  resolveSharedGame,
  resolveSharedSettlement,
  revokeShareLink,
  rotateShareLink,
  shareLinkUrl,
} from './shareLinks';
import { FakePostgrestClient } from './testSupport/fakePostgrestClient';

function client(fake: FakePostgrestClient): SupabaseClient {
  return fake as unknown as SupabaseClient;
}

describe('shareLinkUrl', () => {
  it('puts the token in the URL fragment, not the query string', () => {
    const url = shareLinkUrl('abc123');
    expect(url).toContain('#/s/abc123');
    expect(url).not.toContain('?token=');
  });
});

describe('createShareLink', () => {
  it('inserts a row with a hex-hashed token and returns a URL carrying the plaintext', async () => {
    const fake = new FakePostgrestClient();
    const { link, url } = await createShareLink('game-1', 'host-1', client(fake));

    const [row] = fake.rows('share_links');
    if (!row) throw new Error('expected a row');
    expect(row.game_id).toBe('game-1');
    expect(row.created_by).toBe('host-1');
    expect(String(row.token_hash)).toMatch(/^\\x[0-9a-f]{64}$/);
    expect(String(row.token_prefix)).toHaveLength(6);

    expect(link.gameId).toBe('game-1');
    expect(url).toContain('#/s/');
    // The plaintext token in the URL is not the same string as the stored hash.
    const token = url.split('#/s/')[1];
    expect(token).not.toContain(String(row.token_hash));
  });

  it('generates a different token (and hash) on every call', async () => {
    const fake = new FakePostgrestClient();
    await createShareLink('game-1', 'host-1', client(fake));
    await createShareLink('game-1', 'host-1', client(fake));
    const [first, second] = fake.rows('share_links');
    if (!first || !second) throw new Error('expected two rows');
    expect(first.token_hash).not.toBe(second.token_hash);
  });
});

describe('listShareLinks / revokeShareLink / rotateShareLink', () => {
  it('lists links for a game and revoking stamps revoked_at', async () => {
    const fake = new FakePostgrestClient();
    const { link } = await createShareLink('game-1', 'host-1', client(fake));

    let links = await listShareLinks('game-1', client(fake));
    expect(links).toHaveLength(1);
    expect(links[0]!.revokedAt).toBeNull();

    await revokeShareLink(link.id, client(fake));
    links = await listShareLinks('game-1', client(fake));
    expect(links[0]!.revokedAt).not.toBeNull();
  });

  it('rotate revokes the previous link and mints a new one', async () => {
    const fake = new FakePostgrestClient();
    const { link: first } = await createShareLink('game-1', 'host-1', client(fake));
    const { link: second } = await rotateShareLink('game-1', 'host-1', first.id, client(fake));

    expect(second.id).not.toBe(first.id);
    const links = await listShareLinks('game-1', client(fake));
    const byId = new Map(links.map((l) => [l.id, l]));
    expect(byId.get(first.id)!.revokedAt).not.toBeNull();
    expect(byId.get(second.id)!.revokedAt).toBeNull();
  });
});

describe('resolveSharedGame / resolveSharedSettlement', () => {
  it('passes the token through to get_shared_game and returns its projection', async () => {
    const fake = new FakePostgrestClient();
    fake.onRpc('get_shared_game', (args) => {
      expect(args.p_token).toBe('tok-123');
      return { data: { kind: 'live', game: { id: 'game-1' }, players: [], sharedCosts: [], viewerCount: 0 }, error: null };
    });
    const result = await resolveSharedGame('tok-123', client(fake));
    expect(result.kind).toBe('live');
  });

  it('propagates a rejection from get_shared_settlement', async () => {
    const fake = new FakePostgrestClient();
    fake.onRpc('get_shared_settlement', () => ({ data: null, error: new Error('not available') }));
    await expect(resolveSharedSettlement('tok-bad', client(fake))).rejects.toThrow('not available');
  });
});
