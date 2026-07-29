import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';

export const TEST_DB_NAME = 'poker_rls_test';

export function adminConnectionString(databaseName = TEST_DB_NAME): string {
  const base = process.env.SUPABASE_TEST_ADMIN_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/postgres';
  return base.replace(/\/[^/]*$/, `/${databaseName}`);
}

export const pool = new Pool({ connectionString: adminConnectionString() });

/**
 * Runs `fn` inside a transaction that is always rolled back, so fixtures created and RLS
 * probed by `fn` never leak between tests — no truncation step needed between them.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    return await fn(client);
  } finally {
    await client.query('rollback').catch(() => undefined);
    client.release();
  }
}

/** Switches the current transaction to simulate a PostgREST-authenticated request. */
export async function actAs(
  client: PoolClient,
  role: 'anon' | 'authenticated',
  userId: string | null = null,
): Promise<void> {
  await client.query('select set_config($1, $2, true)', ['role', role]);
  await client.query('select set_config($1, $2, true)', ['request.jwt.claim.sub', userId ?? '']);
}

/** Reverts to the admin (postgres) role within the same transaction. */
export async function actAsAdmin(client: PoolClient): Promise<void> {
  await client.query('reset role');
}

/**
 * Runs `fn`, expecting it to reject, without aborting the rest of the enclosing transaction —
 * a plain failed query would otherwise poison every later statement until rollback. Wraps the
 * attempt in a savepoint and rolls back to it on the expected failure.
 */
export async function expectRejection(client: PoolClient, fn: () => Promise<unknown>): Promise<Error> {
  await client.query('savepoint expect_rejection');
  try {
    await fn();
  } catch (err) {
    await client.query('rollback to savepoint expect_rejection');
    return err as Error;
  }
  await client.query('rollback to savepoint expect_rejection');
  throw new Error('expectRejection: the query unexpectedly succeeded');
}

export interface ProfileFixture {
  id: string;
  username: string;
}

/** Inserts a profile (and its backing auth.users row) as admin, bypassing RLS entirely. */
export async function createProfile(
  client: PoolClient,
  overrides: Partial<{ username: string; displayName: string }> = {},
): Promise<ProfileFixture> {
  const id = randomUUID();
  const username = overrides.username ?? `user_${id.slice(0, 8)}`;
  const displayName = overrides.displayName ?? username;
  await client.query('insert into auth.users (id) values ($1)', [id]);
  await client.query(
    'insert into profiles (id, username, display_name) values ($1, $2, $3)',
    [id, username, displayName],
  );
  return { id, username };
}

/** Creates a game directly as admin, with the given profile id as host and creator. */
export async function createGame(
  client: PoolClient,
  hostId: string,
  overrides: Partial<{ name: string; buyAmountMinor: number; chipsPerBuy: number }> = {},
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `insert into games (name, buy_amount_minor, chips_per_buy, host_id, created_by)
     values ($1, $2, $3, $4, $4)
     returning id`,
    [
      overrides.name ?? `Test Game ${randomUUID().slice(0, 8)}`,
      overrides.buyAmountMinor ?? 5000,
      overrides.chipsPerBuy ?? 100,
      hostId,
    ],
  );
  const gameId = rows[0]?.id;
  if (!gameId) throw new Error('createGame: insert returned no id');
  return gameId;
}

/** Appends a player_added event as admin — exercises the same trigger a real host insert would. */
export async function addPlayer(
  client: PoolClient,
  gameId: string,
  actorId: string,
  userId: string | null,
): Promise<string> {
  const playerId = randomUUID();
  await client.query(
    `insert into game_events (
       game_id, player_id, actor_id, type, payload, client_event_id, client_created_at
     ) values ($1, $2, $3, 'player_added', $4::jsonb, $5, now())`,
    [
      gameId,
      playerId,
      actorId,
      JSON.stringify({
        userId,
        guestName: userId ? null : 'Guest',
        nickname: null,
        seatOrder: 0,
      }),
      randomUUID(),
    ],
  );
  return playerId;
}
