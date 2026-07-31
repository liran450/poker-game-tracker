import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { decideClaim, listPendingClaims, submitClaimInApp, submitClaimViaLink } from './claims';
import { FakePostgrestClient } from './testSupport/fakePostgrestClient';

function client(fake: FakePostgrestClient): SupabaseClient {
  return fake as unknown as SupabaseClient;
}

describe('listPendingClaims', () => {
  it('returns only pending claims for the game', async () => {
    const fake = new FakePostgrestClient();
    fake.seed('player_claims', [
      {
        id: 'c1',
        game_id: 'g1',
        game_player_id: 'p1',
        claimant_user_id: 'u1',
        status: 'pending',
        created_at: '2026-07-31T00:00:00Z',
      },
      {
        id: 'c2',
        game_id: 'g1',
        game_player_id: 'p2',
        claimant_user_id: 'u2',
        status: 'rejected',
        created_at: '2026-07-31T00:00:00Z',
      },
    ]);

    const result = await listPendingClaims('g1', client(fake));
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('c1');
  });
});

describe('submitClaimInApp', () => {
  it('inserts a claim row', async () => {
    const fake = new FakePostgrestClient();
    await submitClaimInApp('g1', 'p1', 'u1', client(fake));
    const [row] = fake.rows('player_claims');
    if (!row) throw new Error('expected a row');
    expect(row.game_id).toBe('g1');
    expect(row.game_player_id).toBe('p1');
    expect(row.claimant_user_id).toBe('u1');
  });
});

describe('submitClaimViaLink / decideClaim', () => {
  it('calls submit_claim_via_link and returns the claim id', async () => {
    const fake = new FakePostgrestClient();
    fake.onRpc('submit_claim_via_link', (args) => {
      expect(args.p_token).toBe('tok');
      expect(args.p_game_player_id).toBe('p1');
      return { data: 'claim-1', error: null };
    });
    const id = await submitClaimViaLink('tok', 'p1', client(fake));
    expect(id).toBe('claim-1');
  });

  it('decideClaim propagates a rejection with the generic message', async () => {
    const fake = new FakePostgrestClient();
    fake.onRpc('decide_claim', () => ({ error: new Error('not available') }));
    await expect(decideClaim('claim-1', true, client(fake))).rejects.toThrow('not available');
  });
});
