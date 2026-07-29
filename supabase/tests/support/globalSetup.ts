import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { TEST_DB_NAME, adminConnectionString } from './db';

const here = dirname(fileURLToPath(import.meta.url));
const supabaseRoot = join(here, '..', '..');

/**
 * Runs once before the whole supabase/tests suite (Vitest's globalSetup, a separate process
 * from the test files themselves): rebuilds poker_rls_test from scratch, applies the local
 * auth shim, then every migration in supabase/migrations in filename order — exactly the
 * order a real `supabase db push` would apply them.
 */
export default async function setup(): Promise<void> {
  const maintenance = new Client({ connectionString: adminConnectionString('postgres') });
  await maintenance.connect();
  await maintenance.query(`drop database if exists ${TEST_DB_NAME}`);
  await maintenance.query(`create database ${TEST_DB_NAME}`);
  await maintenance.end();

  const db = new Client({ connectionString: adminConnectionString() });
  await db.connect();

  try {
    const authShim = readFileSync(join(supabaseRoot, 'tests/support/auth-shim.sql'), 'utf8');
    await db.query(authShim);

    const migrationsDir = join(supabaseRoot, 'migrations');
    const files = readdirSync(migrationsDir)
      .filter((name) => name.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      try {
        await db.query(sql);
      } catch (err) {
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`, { cause: err });
      }
    }
  } finally {
    await db.end();
  }
}
