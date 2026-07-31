import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  decideJoinRequest,
  listPendingJoinRequests,
  requestToJoinInApp,
  requestToJoinViaLink,
} from './joinRequests';
import { FakePostgrestClient } from './testSupport/fakePostgrestClient';

function client(fake: FakePostgrestClient): SupabaseClient {
  return fake as unknown as SupabaseClient;
}

describe('listPendingJoinRequests', () => {
  it('returns only pending requests for the game', async () => {
    const fake = new FakePostgrestClient();
    fake.seed('join_requests', [
      {
        id: 'r1',
        game_id: 'g1',
        user_id: 'u1',
        requested_name: 'דנה',
        requested_role: 'player',
        source: 'link',
        status: 'pending',
        created_at: '2026-07-31T00:00:00Z',
      },
      {
        id: 'r2',
        game_id: 'g1',
        user_id: 'u2',
        requested_name: 'רני',
        requested_role: 'player',
        source: 'in_app',
        status: 'approved',
        created_at: '2026-07-31T00:00:00Z',
      },
      {
        id: 'r3',
        game_id: 'g2',
        user_id: 'u3',
        requested_name: 'מור',
        requested_role: 'player',
        source: 'in_app',
        status: 'pending',
        created_at: '2026-07-31T00:00:00Z',
      },
    ]);

    const result = await listPendingJoinRequests('g1', client(fake));
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('r1');
    expect(result[0]!.source).toBe('link');
  });
});

describe('requestToJoinInApp', () => {
  it('inserts an in_app-sourced request', async () => {
    const fake = new FakePostgrestClient();
    await requestToJoinInApp('g1', 'u1', '  דנה  ', 'player', client(fake));
    const [row] = fake.rows('join_requests');
    if (!row) throw new Error('expected a row');
    expect(row.source).toBe('in_app');
    expect(row.requested_name).toBe('דנה');
  });
});

describe('requestToJoinViaLink / decideJoinRequest', () => {
  it('calls submit_join_request_via_link with the trimmed name and returns the request id', async () => {
    const fake = new FakePostgrestClient();
    fake.onRpc('submit_join_request_via_link', (args) => {
      expect(args.p_token).toBe('tok');
      expect(args.p_requested_name).toBe('דנה');
      return { data: 'req-1', error: null };
    });
    const id = await requestToJoinViaLink('tok', '  דנה  ', 'player', client(fake));
    expect(id).toBe('req-1');
  });

  it('decideJoinRequest forwards the approve flag and propagates errors', async () => {
    const fake = new FakePostgrestClient();
    fake.onRpc('decide_join_request', (args) => {
      expect(args.p_approve).toBe(false);
      return { error: null };
    });
    await decideJoinRequest('req-1', false, client(fake));

    fake.onRpc('decide_join_request', () => ({ error: new Error('not available') }));
    await expect(decideJoinRequest('req-2', true, client(fake))).rejects.toThrow('not available');
  });
});
