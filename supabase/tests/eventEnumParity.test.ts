import { describe, expect, it } from 'vitest';
import { EVENT_TYPES } from '../../src/core/events';
import { pool } from './support/db';

describe('game_event_type enum parity (docs/build/PLAN.md step 10 exit criterion)', () => {
  it('matches core/events.ts EVENT_TYPES exactly, character for character', async () => {
    const { rows } = await pool.query<{ enumlabel: string }>(
      `select e.enumlabel
       from pg_enum e
       join pg_type t on t.oid = e.enumtypid
       where t.typname = 'game_event_type'
       order by e.enumsortorder`,
    );

    const postgresTypes = rows.map((row) => row.enumlabel);

    expect(postgresTypes).toEqual([...EVENT_TYPES]);
    expect(postgresTypes.length).toBe(31);
  });
});
