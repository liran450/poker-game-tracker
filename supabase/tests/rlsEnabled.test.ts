import { describe, expect, it } from 'vitest';
import { pool, withTransaction } from './support/db';

// Every live + permanent table from docs/03-data-model.md. If a future migration adds a table
// and forgets `enable row level security`, this list drifting out of sync with pg_class's
// actual table list is itself a failure — see the first assertion below.
const EXPECTED_TABLES = [
  'profiles',
  'groups',
  'group_members',
  'group_invites',
  'games',
  'game_players',
  'game_events',
  'shared_costs',
  'shared_cost_shares',
  'transfers',
  'game_viewers',
  'share_links',
  'join_requests',
  'player_claims',
  'game_summaries',
  'player_results',
  'transfer_summaries',
].sort();

async function tablesWithRlsOff(): Promise<string[]> {
  const { rows } = await pool.query<{ relname: string }>(
    `select relname from pg_class
     where relnamespace = 'public'::regnamespace
       and relkind = 'r'
       and not relrowsecurity`,
  );
  return rows.map((row) => row.relname);
}

describe('RLS is enabled on every table (docs/02-architecture.md#security-model)', () => {
  it('the schema has exactly the tables docs/03-data-model.md defines', async () => {
    const { rows } = await pool.query<{ relname: string }>(
      `select relname from pg_class
       where relnamespace = 'public'::regnamespace and relkind = 'r'`,
    );
    expect(rows.map((row) => row.relname).sort()).toEqual(EXPECTED_TABLES);
  });

  it('no table has row level security disabled', async () => {
    expect(await tablesWithRlsOff()).toEqual([]);
  });

  it('the check has teeth: it catches a table deliberately left unprotected', async () => {
    // Proves the check above isn't vacuously passing — disable RLS on one real table and
    // confirm the same query used above actually flags it. Runs inside a rolled-back
    // transaction, so nothing here ever really leaves a table unprotected.
    await withTransaction(async (client) => {
      await client.query('alter table shared_costs disable row level security');
      const { rows } = await client.query<{ relname: string }>(
        `select relname from pg_class
         where relnamespace = 'public'::regnamespace
           and relkind = 'r'
           and not relrowsecurity`,
      );
      expect(rows.map((row) => row.relname)).toContain('shared_costs');
    });

    // And the rollback really did restore it — the pooled admin connection sees a clean state.
    expect(await tablesWithRlsOff()).toEqual([]);
  });
});
