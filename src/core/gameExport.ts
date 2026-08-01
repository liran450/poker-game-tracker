import { toMajor, type Minor } from './money';

/**
 * The export file format (08-gaps-and-open-questions.md#a16-data-export,
 * docs/build/PLAN.md step 16): "let the host export any game at any time" —
 * before the first purge, and afterward there is nothing left to export
 * anyway, since the permanent tables are exactly what statistics already
 * reads. Pure and dependency-free like every other `core/` module here: the
 * caller (a local live game, a remote permanent-table read, or an
 * all-history aggregate) is responsible for resolving every name (a
 * player's composed display name, `קופה`/`לא מזוהה / הבית` for the
 * settlement nodes) before handing rows in — this module never sees a raw
 * id, so it never needs a resolver or an i18n import.
 *
 * Money is exported in major units (50, not 5000) — this file is read by a
 * human in a spreadsheet or a text editor, not by this app, so it follows
 * the same "never say agorot/cents" spirit CLAUDE.md holds every user-facing
 * surface to, just applied to a downloaded file instead of a screen.
 */

export interface GameExportPlayerInput {
  readonly displayName: string;
  readonly buysCount: number;
  readonly buyInsMinor: Minor;
  readonly cashPaidMinor: Minor;
  /** `null` while the player hasn't settled yet (an in-progress game's export). */
  readonly chipsFinal: number | null;
  readonly netMinor: Minor | null;
  readonly sharedCostsShareMinor: Minor;
}

export interface GameExportTransferInput {
  readonly fromName: string;
  readonly toName: string;
  readonly amountMinor: Minor;
}

export type GameExportStatus = 'setup' | 'active' | 'settling' | 'finished';

export interface GameExportInput {
  readonly gameId: string;
  readonly name: string;
  readonly status: GameExportStatus;
  /** ISO date, `YYYY-MM-DD`. */
  readonly playedOn: string;
  readonly currency: string;
  /** ISO timestamp, or `null` for a game that hasn't ended yet. */
  readonly finishedAt: string | null;
  readonly players: readonly GameExportPlayerInput[];
  readonly transfers: readonly GameExportTransferInput[];
}

export interface GameExportPlayer {
  readonly displayName: string;
  readonly buysCount: number;
  readonly buyIns: number;
  readonly cashPaid: number;
  readonly chipsFinal: number | null;
  readonly net: number | null;
  readonly sharedCostsShare: number;
}

export interface GameExportTransfer {
  readonly from: string;
  readonly to: string;
  readonly amount: number;
}

export interface GameExportPayload {
  readonly formatVersion: 1;
  readonly exportedAt: string;
  readonly game: {
    readonly id: string;
    readonly name: string;
    readonly status: GameExportStatus;
    readonly playedOn: string;
    readonly currency: string;
    readonly finishedAt: string | null;
  };
  readonly players: readonly GameExportPlayer[];
  readonly transfers: readonly GameExportTransfer[];
}

export function buildGameExportPayload(
  input: GameExportInput,
  now: () => string = () => new Date().toISOString(),
): GameExportPayload {
  return {
    formatVersion: 1,
    exportedAt: now(),
    game: {
      id: input.gameId,
      name: input.name,
      status: input.status,
      playedOn: input.playedOn,
      currency: input.currency,
      finishedAt: input.finishedAt,
    },
    players: input.players.map(
      (p): GameExportPlayer => ({
        displayName: p.displayName,
        buysCount: p.buysCount,
        buyIns: toMajor(p.buyInsMinor),
        cashPaid: toMajor(p.cashPaidMinor),
        chipsFinal: p.chipsFinal,
        net: p.netMinor === null ? null : toMajor(p.netMinor),
        sharedCostsShare: toMajor(p.sharedCostsShareMinor),
      }),
    ),
    transfers: input.transfers.map(
      (t): GameExportTransfer => ({
        from: t.fromName,
        to: t.toName,
        amount: toMajor(t.amountMinor),
      }),
    ),
  };
}

/** A filesystem-safe file name — the game's own name may contain characters a real OS rejects. */
export function gameExportFileName(gameId: string, playedOn: string): string {
  return `poker-game-${playedOn}-${gameId.slice(0, 8)}.json`;
}

export function allHistoryExportFileName(now: () => string = () => new Date().toISOString()): string {
  return `poker-history-${now().slice(0, 10)}.json`;
}
