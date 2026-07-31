import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import {
  actAs,
  actAsAdmin,
  createGame,
  createProfile,
  expectRejection,
  withTransaction,
} from './support/db';
import { buildGameSnapshot, HOUSE_ID, POT_ID, type Transfer } from '../../src/core/settlement';
import { minor, type Minor } from '../../src/core/money';

interface GameSummaryRow {
  player_count: number;
  duration_minutes: number;
  total_buy_ins_minor: number;
  total_cash_pot_minor: number;
  unaccounted_minor: number;
  shared_costs_minor: number;
  finished_at: string;
}

interface PlayerResultRow {
  id: string;
  display_name: string;
  buys_count: number;
  owed_minor: number;
  cash_paid_minor: number;
  chips_final: number;
  cash_out_minor: number;
  net_minor: number;
  shared_costs_share_minor: number;
  minutes_played: number;
  settled_position: number | null;
}

interface TransferSummaryRow {
  order_index: number;
  amount_minor: number;
  from_name: string;
  to_name: string;
}

interface CountRow {
  count: string;
}

function sharesMap(entries: Record<string, number>): ReadonlyMap<string, Minor> {
  return new Map(Object.entries(entries).map(([id, v]) => [id, minor(v)]));
}

/** Appends a game_event as admin, mirroring the shape the real trigger expects. */
async function appendEvent(
  client: PoolClient,
  gameId: string,
  actorId: string,
  playerId: string | null,
  type: string,
  payload: Record<string, unknown>,
  clientCreatedAt: string,
): Promise<void> {
  await client.query(
    `insert into game_events (
       game_id, player_id, actor_id, type, payload, client_event_id, client_created_at
     ) values ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
    [gameId, playerId, actorId, type, JSON.stringify(payload), randomUUID(), clientCreatedAt],
  );
}

async function addPlayerWithPayload(
  client: PoolClient,
  gameId: string,
  actorId: string,
  payload: { userId: string | null; guestName: string | null; nickname: string | null; seatOrder: number },
  clientCreatedAt: string,
): Promise<string> {
  const playerId = randomUUID();
  await appendEvent(client, gameId, actorId, playerId, 'player_added', payload, clientCreatedAt);
  return playerId;
}

/**
 * The full fixture used by both the SQL and TS builders, so
 * "SQL snapshot and TS snapshot agree" (docs/build/PLAN.md step 11) is an actual comparison and
 * not two independently-guessed expectations.
 *
 * Rani (registered, no nickname) and two guests both named "Dana" (to exercise
 * core/players.ts's per-game dedup — the second "Dana" must land on "Dana (1)"), a shared cost
 * paid by Rani and split evenly three ways, and a manually-edited transfer list that exercises
 * every settlement_party (player, pot, house) as both sender and receiver, plus one
 * zero-amount ("deleted") transfer that must be excluded from the result.
 */
async function buildFixture(client: PoolClient) {
  const host = await createProfile(client, { username: 'host_user', displayName: 'Host' });
  const rani = await createProfile(client, { username: 'rani', displayName: 'Rani' });
  const gameId = await createGame(client, host.id, {
    name: 'Fixture Game',
    buyAmountMinor: 5000,
    chipsPerBuy: 100,
  });

  const startedAt = '2026-07-01T18:00:00.000Z';
  const endedAt = '2026-07-01T20:05:00.000Z'; // 125 minutes later
  const p1LeftAt = '2026-07-01T19:00:00.000Z'; // Rani settles after 60 minutes

  await actAsAdmin(client);
  await client.query(
    'update games set played_on = $2, started_at = $3, unaccounted_minor = 500 where id = $1',
    [gameId, '2026-07-01', startedAt],
  );

  const p1 = await addPlayerWithPayload(
    client,
    gameId,
    host.id,
    { userId: rani.id, guestName: null, nickname: null, seatOrder: 0 },
    startedAt,
  );
  const p2 = await addPlayerWithPayload(
    client,
    gameId,
    host.id,
    { userId: null, guestName: 'Dana', nickname: null, seatOrder: 1 },
    startedAt,
  );
  const p3 = await addPlayerWithPayload(
    client,
    gameId,
    host.id,
    { userId: null, guestName: 'Dana', nickname: null, seatOrder: 2 },
    startedAt,
  );

  // Rani: 2 buy-ins, ₪100 cash paid, 120 chips, settles after 60 minutes.
  await appendEvent(client, gameId, host.id, p1, 'buy_in_added', {}, startedAt);
  await appendEvent(client, gameId, host.id, p1, 'buy_in_added', {}, startedAt);
  await appendEvent(client, gameId, host.id, p1, 'cash_paid_set', { amountMinor: 10000 }, startedAt);
  await appendEvent(
    client,
    gameId,
    host.id,
    p1,
    'player_settled',
    { chipsFinal: 120, settledAt: p1LeftAt },
    p1LeftAt,
  );

  // Dana #1 (p2): 1 buy-in, 180 chips, never settles.
  await appendEvent(client, gameId, host.id, p2, 'buy_in_added', {}, startedAt);
  await appendEvent(client, gameId, host.id, p2, 'chips_set', { chips: 180 }, startedAt);

  // Dana #2 (p3): 1 buy-in, 0 chips, never settles.
  await appendEvent(client, gameId, host.id, p3, 'buy_in_added', {}, startedAt);
  await appendEvent(client, gameId, host.id, p3, 'chips_set', { chips: 0 }, startedAt);

  // Shared cost: ₪30 paid by Rani, split evenly three ways (₪10 each) — clean division, no
  // residue rounding to replicate here.
  const costId = randomUUID();
  await client.query(
    `insert into shared_costs (id, game_id, label, amount_minor, paid_by_player_id, split_mode)
     values ($1, $2, 'Pizza', 3000, $3, 'equal')`,
    [costId, gameId, p1],
  );
  await client.query(
    `insert into shared_cost_shares (cost_id, game_player_id, amount_minor) values
       ($1, $2, 1000), ($1, $3, 1000), ($1, $4, 1000)`,
    [costId, p1, p2, p3],
  );

  // Transfers: player -> player, pot -> player, player -> house, plus one zeroed-out
  // ("deleted") row that must not survive into transfer_summaries.
  await client.query(
    `insert into transfers (game_id, from_party, from_player_id, to_party, to_player_id, amount_minor, order_index)
     values
       ($1, 'player', $2, 'player', $3, 3000, 0),
       ($1, 'pot', null, 'player', $4, 1000, 1),
       ($1, 'player', $4, 'house', null, 500, 2),
       ($1, 'player', $3, 'player', $2, 0, 3)`,
    [gameId, p1, p2, p3],
  );

  await client.query('update games set status = \'finished\', ended_at = $2 where id = $1', [
    gameId,
    endedAt,
  ]);

  return { host, rani, gameId, p1, p2, p3, startedAt, endedAt, p1LeftAt };
}

describe('chips_to_money_minor (mirrors core/money.ts#chipsToMoney/bankersRound)', () => {
  it.each([
    // [chips, buyAmountMinor, chipsPerBuy, expected]
    [120, 5000, 100, 6000], // exact, no rounding
    [1, 50, 4, 12], // 12.5, floor already even -> rounds down
    [3, 50, 4, 38], // 37.5, floor odd -> rounds up to the even neighbour
    [1, 100, 3, 33], // 33.33..., ordinary round-down
    [2, 100, 3, 67], // 66.67..., ordinary round-up
    [7, 33, 6, 38], // 38.5, floor even -> rounds down
  ])('chips=%i buy=%i perBuy=%i -> %i', async (chips, buy, perBuy, expected) => {
    await withTransaction(async (client) => {
      const { rows } = await client.query('select chips_to_money_minor($1, $2, $3) as result', [
        chips,
        buy,
        perBuy,
      ]);
      expect(Number(rows[0].result)).toBe(expected);
    });
  });
});

describe('finalize_game (docs/build/PLAN.md step 11)', () => {
  it('agrees with core/settlement.ts#buildGameSnapshot on a shared fixture', async () => {
    await withTransaction(async (client) => {
      const { host, gameId, p1, p2, p3, startedAt, endedAt, p1LeftAt } = await buildFixture(client);

      await actAs(client, 'authenticated', host.id);
      await client.query('select finalize_game($1)', [gameId]);
      await actAsAdmin(client);

      // --- Build the same snapshot in TS, from the same inputs ---
      const transfersOverride: Transfer[] = [
        { fromId: p1, toId: p2, amountMinor: minor(3000) },
        { fromId: POT_ID, toId: p3, amountMinor: minor(1000) },
        { fromId: p3, toId: HOUSE_ID, amountMinor: minor(500) },
      ];
      const snapshot = buildGameSnapshot(
        {
          gameId,
          groupId: null,
          name: 'Fixture Game',
          playedOn: '2026-07-01',
          currency: 'ILS',
          buyAmountMinor: minor(5000),
          chipsPerBuy: 100,
          isPrivate: false,
          locationName: null,
          finishedAt: endedAt,
          durationMinutes: 125,
          unaccountedMinor: minor(500),
          sharedCosts: [
            {
              id: 'cost-1',
              amountMinor: minor(3000),
              paidByPlayerId: p1,
              shares: sharesMap({ [p1]: 1000, [p2]: 1000, [p3]: 1000 }),
            },
          ],
          players: [
            {
              id: p1,
              seatOrder: 0,
              userId: p1,
              guestName: null,
              displayName: 'Rani',
              buysCount: 2,
              cashPaidMinor: minor(10000),
              chipsFinal: 120,
              joinedAt: startedAt,
              leftAt: p1LeftAt,
              settledPosition: 1,
            },
            {
              id: p2,
              seatOrder: 1,
              userId: null,
              guestName: 'Dana',
              displayName: 'Dana',
              buysCount: 1,
              cashPaidMinor: minor(0),
              chipsFinal: 180,
              joinedAt: startedAt,
              leftAt: null,
              settledPosition: null,
            },
            {
              id: p3,
              seatOrder: 2,
              userId: null,
              guestName: 'Dana',
              displayName: 'Dana (1)',
              buysCount: 1,
              cashPaidMinor: minor(0),
              chipsFinal: 0,
              joinedAt: startedAt,
              leftAt: null,
              settledPosition: null,
            },
          ],
        },
        () => 'unused',
        transfersOverride,
      );

      // --- Read back what finalize_game() wrote ---
      const { rows: summaryRows } = await client.query<GameSummaryRow>(
        'select * from game_summaries where game_id = $1',
        [gameId],
      );
      expect(summaryRows).toHaveLength(1);
      const summary = summaryRows[0];

      expect(summary.player_count).toBe(snapshot.summary.playerCount);
      expect(summary.duration_minutes).toBe(snapshot.summary.durationMinutes);
      expect(Number(summary.total_buy_ins_minor)).toBe(snapshot.summary.totalBuyInsMinor);
      expect(Number(summary.total_cash_pot_minor)).toBe(snapshot.summary.totalCashPotMinor);
      expect(Number(summary.unaccounted_minor)).toBe(snapshot.summary.unaccountedMinor);
      expect(Number(summary.shared_costs_minor)).toBe(snapshot.summary.sharedCostsMinor);

      const { rows: resultRows } = await client.query<PlayerResultRow>(
        'select * from player_results where game_id = $1 order by display_name',
        [gameId],
      );
      expect(resultRows).toHaveLength(3);
      const byName = new Map(resultRows.map((r) => [r.display_name, r]));
      expect([...byName.keys()].sort()).toEqual(['Dana', 'Dana (1)', 'Rani']);

      const tsByName = new Map(
        snapshot.playerResults.map((r) => [r.displayName, r]),
      );

      for (const [name, sqlRow] of byName) {
        const tsRow = tsByName.get(name)!;
        expect(sqlRow.buys_count).toBe(tsRow.buysCount);
        expect(Number(sqlRow.owed_minor)).toBe(tsRow.owedMinor);
        expect(Number(sqlRow.cash_paid_minor)).toBe(tsRow.cashPaidMinor);
        expect(sqlRow.chips_final).toBe(tsRow.chipsFinal);
        expect(Number(sqlRow.cash_out_minor)).toBe(tsRow.cashOutMinor);
        expect(Number(sqlRow.net_minor)).toBe(tsRow.netMinor);
        expect(Number(sqlRow.shared_costs_share_minor)).toBe(tsRow.sharedCostsShareMinor);
        expect(sqlRow.minutes_played).toBe(tsRow.minutesPlayed);
        expect(sqlRow.settled_position).toBe(tsRow.settledPosition);
      }

      const { rows: transferRows } = await client.query<TransferSummaryRow>(
        'select * from transfer_summaries where game_id = $1 order by order_index',
        [gameId],
      );
      const nameById: Record<string, string> = {
        [p1]: 'Rani',
        [p2]: 'Dana',
        [p3]: 'Dana (1)',
        [POT_ID]: 'קופה',
        [HOUSE_ID]: 'לא מזוהה / הבית',
      };
      expect(transferRows).toHaveLength(snapshot.transfers.length);
      snapshot.transfers.forEach((tsTransfer, i) => {
        const sqlTransfer = transferRows[i];
        expect(sqlTransfer.order_index).toBe(tsTransfer.orderIndex);
        expect(Number(sqlTransfer.amount_minor)).toBe(tsTransfer.amountMinor);
        expect(sqlTransfer.from_name).toBe(nameById[tsTransfer.fromId]);
        expect(sqlTransfer.to_name).toBe(nameById[tsTransfer.toId]);
      });
    });
  });

  it('is idempotent across reopen and re-end', async () => {
    await withTransaction(async (client) => {
      const { host, gameId } = await buildFixture(client);

      await actAs(client, 'authenticated', host.id);
      await client.query('select finalize_game($1)', [gameId]);
      await actAsAdmin(client);

      const firstSummary = (
        await client.query<GameSummaryRow>('select * from game_summaries where game_id = $1', [
          gameId,
        ])
      ).rows[0];
      const firstResultIds = (
        await client.query<{ id: string }>(
          'select id from player_results where game_id = $1 order by id',
          [gameId],
        )
      ).rows.map((r) => r.id);
      const firstTransferCount = (
        await client.query<CountRow>(
          'select count(*) from transfer_summaries where game_id = $1',
          [gameId],
        )
      ).rows[0].count;

      // Reopen, change something, re-end.
      await client.query('update games set status = \'active\' where id = $1', [gameId]);
      await client.query(
        'update game_players set chips_final = 999 where game_id = $1 and chips_final = 120',
        [gameId],
      );
      await client.query(
        'update games set status = \'finished\', ended_at = \'2026-07-01T21:00:00.000Z\' where id = $1',
        [gameId],
      );

      await actAs(client, 'authenticated', host.id);
      await client.query('select finalize_game($1)', [gameId]);
      await actAsAdmin(client);

      const secondSummaryRows = await client.query<GameSummaryRow>(
        'select * from game_summaries where game_id = $1',
        [gameId],
      );
      expect(secondSummaryRows.rows).toHaveLength(1); // no duplicate row
      expect(secondSummaryRows.rows[0].finished_at).not.toEqual(firstSummary.finished_at);

      const secondResultIds = (
        await client.query<{ id: string }>(
          'select id from player_results where game_id = $1 order by id',
          [gameId],
        )
      ).rows.map((r) => r.id);
      expect(secondResultIds).toHaveLength(3); // still exactly 3 rows, not 6
      // Fresh ids each time (delete-then-insert), not a stale-row leftover.
      expect(secondResultIds.sort()).not.toEqual(firstResultIds.sort());

      const secondTransferCount = (
        await client.query<CountRow>(
          'select count(*) from transfer_summaries where game_id = $1',
          [gameId],
        )
      ).rows[0].count;
      expect(secondTransferCount).toBe(firstTransferCount);

      const raniRow = (
        await client.query<{ cash_out_minor: number; net_minor: number }>(
          'select cash_out_minor, net_minor from player_results where game_id = $1 and display_name = \'Rani\'',
          [gameId],
        )
      ).rows[0];
      // chips_final 999 -> cash_out = 999 * 5000 / 100 = 49950
      expect(Number(raniRow.cash_out_minor)).toBe(49950);
    });
  });

  it('rejects a non-host', async () => {
    await withTransaction(async (client) => {
      const { gameId } = await buildFixture(client);
      const stranger = await createProfile(client);

      await actAs(client, 'authenticated', stranger.id);
      const err = await expectRejection(client, () =>
        client.query('select finalize_game($1)', [gameId]),
      );
      expect(err.message).toMatch(/not available|insufficient/i);
    });
  });

  it('rejects a game that is not finished', async () => {
    await withTransaction(async (client) => {
      const host = await createProfile(client);
      const gameId = await createGame(client, host.id);

      await actAs(client, 'authenticated', host.id);
      const err = await expectRejection(client, () =>
        client.query('select finalize_game($1)', [gameId]),
      );
      expect(err.message).toMatch(/not available|insufficient/i);
    });
  });
});
