import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

/**
 * Share links (03-data-model.md#link-security). Token generation, hashing and the URL fragment
 * all live here, client-side — `share_links_insert`/`_update`/`_delete` (is_host) already let
 * the host write the row directly through plain PostgREST calls, so create/revoke/rotate need no
 * RPC. Only *resolving* a token — reading a game without any row-level access yet — needs the
 * server-side `get_shared_game`/`get_shared_settlement` RPCs
 * (`supabase/migrations/20260731150000_step13_sharing_and_takeover.sql`).
 *
 * The plaintext token is never sent to the server except as the RPC argument used to hash-compare
 * it there; only its SHA-256 hash is ever stored (`share_links.token_hash`). It lives in the URL
 * fragment (`#/s/<token>`), never the query string — CLAUDE.md's "the share token lives in the
 * URL fragment. Never write it into the DOM, a log, or an analytics call."
 */

export interface ShareLink {
  readonly id: string;
  readonly gameId: string;
  readonly tokenPrefix: string;
  readonly createdAt: string;
  readonly revokedAt: string | null;
  readonly lastViewedAt: string | null;
  readonly viewCount: number;
}

interface ShareLinkRow {
  readonly id: string;
  readonly game_id: string;
  readonly token_prefix: string;
  readonly created_at: string;
  readonly revoked_at: string | null;
  readonly last_viewed_at: string | null;
  readonly view_count: number;
}

function toShareLink(row: ShareLinkRow): ShareLink {
  return {
    id: row.id,
    gameId: row.game_id,
    tokenPrefix: row.token_prefix,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
    lastViewedAt: row.last_viewed_at,
    viewCount: row.view_count,
  };
}

function requireClient(client: SupabaseClient | null = supabase): SupabaseClient {
  if (!client) {
    throw new Error(
      'shareLinks: no Supabase client configured (VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY missing)',
    );
  }
  return client;
}

/** 256 bits from a CSPRNG, base64url-encoded — 03-data-model.md#link-security. */
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hashToken(token: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return new Uint8Array(digest);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** `…/#/s/<token>` — the app already uses a hash router, so a fragment costs nothing extra. */
export function shareLinkUrl(token: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}#/s/${token}`;
}

const SHARE_LINK_COLUMNS =
  'id, game_id, token_prefix, created_at, revoked_at, last_viewed_at, view_count';

/** Creates a new link and returns both the row and the one-time plaintext URL to share. */
export async function createShareLink(
  gameId: string,
  createdBy: string,
  client: SupabaseClient = requireClient(),
): Promise<{ link: ShareLink; url: string }> {
  const token = generateToken();
  const tokenHash = toHex(await hashToken(token));

  const { data, error } = await client
    .from('share_links')
    .insert({
      id: crypto.randomUUID(),
      game_id: gameId,
      // pgcrypto's digest() and this hex string represent the same bytes; PostgREST/pg encode a
      // `bytea` insert from a `\x`-prefixed hex string.
      token_hash: `\\x${tokenHash}`,
      token_prefix: token.slice(0, 6),
      created_by: createdBy,
      revoked_at: null,
    })
    .select(SHARE_LINK_COLUMNS)
    .maybeSingle()
    .returns<ShareLinkRow | null>();

  if (error) throw error;
  if (!data) throw new Error('createShareLink: insert returned no row');
  return { link: toShareLink(data), url: shareLinkUrl(token) };
}

export async function listShareLinks(
  gameId: string,
  client: SupabaseClient = requireClient(),
): Promise<ShareLink[]> {
  const { data, error } = await client
    .from('share_links')
    .select(SHARE_LINK_COLUMNS)
    .eq('game_id', gameId)
    .returns<ShareLinkRow[]>();
  if (error) throw error;
  return (data ?? []).map(toShareLink);
}

export async function revokeShareLink(
  linkId: string,
  client: SupabaseClient = requireClient(),
): Promise<void> {
  const { error } = await client
    .from('share_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', linkId);
  if (error) throw error;
}

/** `צור קישור חדש` — revokes the old link (if any) and mints a fresh one in its place. */
export async function rotateShareLink(
  gameId: string,
  createdBy: string,
  previousLinkId: string | null,
  client: SupabaseClient = requireClient(),
): Promise<{ link: ShareLink; url: string }> {
  if (previousLinkId) await revokeShareLink(previousLinkId, client);
  return createShareLink(gameId, createdBy, client);
}

export type SharedGameProjection =
  | { readonly kind: 'finished' }
  | {
      readonly kind: 'live';
      readonly game: {
        readonly id: string;
        readonly name: string;
        readonly status: 'active' | 'settling';
        readonly currency: string;
        readonly buyAmountMinor: number;
        readonly chipsPerBuy: number;
        readonly isPrivate: boolean;
        readonly startedAt: string | null;
        readonly unaccountedMinor: number;
      };
      readonly players: readonly {
        readonly id: string;
        readonly userId: string | null;
        readonly guestName: string | null;
        readonly nickname: string | null;
        readonly seatOrder: number;
        readonly buysCount: number;
        readonly cashPaidMinor: number;
        readonly chipsFinal: number | null;
        readonly isSettled: boolean;
        readonly joinedAt: string;
      }[];
      readonly sharedCosts: readonly {
        readonly id: string;
        readonly label: string;
        readonly amountMinor: number;
        readonly paidByPlayerId: string | null;
        readonly splitMode: 'equal' | 'custom';
      }[];
      readonly viewerCount: number;
    };

export interface SharedSettlementProjection {
  readonly kind: 'settled';
  readonly game: {
    readonly gameId: string;
    readonly name: string;
    readonly playedOn: string;
    readonly currency: string;
    readonly playerCount: number;
    readonly durationMinutes: number;
    readonly isPrivate: boolean;
    readonly finishedAt: string;
  };
  readonly playerResults: readonly {
    readonly id: string;
    readonly userId: string | null;
    readonly guestName: string | null;
    readonly displayName: string;
    readonly buysCount: number;
    readonly owedMinor: number;
    readonly cashPaidMinor: number;
    readonly chipsFinal: number;
    readonly cashOutMinor: number;
    readonly netMinor: number;
    readonly sharedCostsShareMinor: number;
    readonly settledPosition: number | null;
  }[];
  readonly transfers: readonly {
    readonly fromName: string;
    readonly toName: string;
    readonly fromUserId: string | null;
    readonly toUserId: string | null;
    readonly amountMinor: number;
    readonly orderIndex: number;
  }[];
}

/**
 * `get_shared_game` — live games only. A `{kind: 'finished'}` result means the token is valid
 * but the game has since ended; call `resolveSharedSettlement` with the same token next.
 */
export async function resolveSharedGame(
  token: string,
  client: SupabaseClient = requireClient(),
): Promise<SharedGameProjection> {
  const { data, error } = await client
    .rpc('get_shared_game', { p_token: token })
    .single()
    .returns<SharedGameProjection>();
  if (error) throw error;
  if (data === null) throw new Error('resolveSharedGame: rpc returned no row');
  return data;
}

export async function resolveSharedSettlement(
  token: string,
  client: SupabaseClient = requireClient(),
): Promise<SharedSettlementProjection> {
  const { data, error } = await client
    .rpc('get_shared_settlement', { p_token: token })
    .single()
    .returns<SharedSettlementProjection>();
  if (error) throw error;
  if (data === null) throw new Error('resolveSharedSettlement: rpc returned no row');
  return data;
}
