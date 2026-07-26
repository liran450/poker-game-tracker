# 03 — Data Model

Postgres (Supabase). All money is stored as **integer agorot** (`₪50` → `5000`). All ids are
`uuid`. All timestamps are `timestamptz`.

## Event sourcing

Every mutation to a game is an append-only row in `game_events`. Current state is a fold over
events, cached in denormalised columns on `game_players` for fast reads.

One mechanism buys four features:

| Feature | How it falls out |
|---|---|
| Audit log (#22) | The event stream *is* the log. Render it. |
| Undo | Append the inverse event. Nothing is destroyed. |
| Offline sync ([02](02-architecture.md#offline-first)) | Events are commutative increments, not overwrites — two phones merge cleanly |
| Idempotent retries | `client_event_id` is unique; replaying a push is a no-op |

The cost is one extra table and a trigger. It is worth it.

---

## Tables

### `profiles`
Mirrors `auth.users`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | → `auth.users.id` |
| `display_name` | text | Shown everywhere |
| `avatar_url` | text | From Google, optional |
| `phone` | text | Optional, for `wa.me` links ([05](05-settlement.md#payment-links--reality-check-23)) |
| `stats_visibility` | enum(`group`,`private`) | default `group` |
| `created_at` | timestamptz | |

### `groups` — חבורה
The recurring circle of friends. Scopes quick-add and statistics.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | e.g. `הפוקר של יום חמישי` |
| `created_by` | uuid → profiles | |
| `default_buy_amount` | int | agorot, default 5000 |
| `default_chips_per_buy` | int | default 100 |
| `invite_token` | uuid | join-by-link, revocable |
| `created_at` | timestamptz | |

### `group_members`
| Column | Type | Notes |
|---|---|---|
| `group_id` | uuid → groups | PK part |
| `user_id` | uuid → profiles | PK part |
| `role` | enum(`owner`,`member`) | |
| `joined_at` | timestamptz | |

### `games`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `group_id` | uuid → groups NULL | Games can be group-less |
| `name` | text | default `פוקר — DD.MM.YY` |
| `played_on` | date | |
| `buy_amount` | int | agorot. Immutable once a buy-in exists (see below) |
| `chips_per_buy` | int | Immutable once a buy-in exists |
| `currency` | text | default `ILS` |
| `status` | enum(`setup`,`active`,`settling`,`finished`) | |
| `host_id` | uuid → profiles | |
| `created_by` | uuid → profiles | Never changes; `host_id` does |
| `started_at` | timestamptz | For duration / per-hour stats |
| `ended_at` | timestamptz NULL | |
| `reopen_deadline` | timestamptz NULL | `ended_at + 24h` (#22) |
| `host_last_seen_at` | timestamptz | Powers the abandoned-game takeover rule |
| `unaccounted_agorot` | int | The 🔴 discrepancy assigned to "the house" (#20) |
| `shared_costs_agorot` | int | Optional pizza/tips split — see [08](08-gaps-and-open-questions.md) |
| `notes` | text | |

> **Chip value** is derived, never stored: `chip_value = buy_amount / chips_per_buy`.
> Changing `buy_amount` after buy-ins exist would silently rewrite history, so it is blocked
> once the first buy-in event lands. If the table really does change stakes mid-game, that's a
> new game — or use the per-player custom buy-in escape hatch.

### `game_players`
One person in one game. Registered user **or** guest.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `game_id` | uuid → games | |
| `user_id` | uuid → profiles NULL | NULL ⇒ guest (#21) |
| `display_name` | text | Deduped with `(1)`, `(2)` (#9) |
| `seat_order` | int | List order |
| `joined_at` | timestamptz | Late joiners → accurate per-hour stats |
| `left_at` | timestamptz NULL | Set on settle |
| `buys_count` | int | **Cache** of the event fold |
| `custom_buys_agorot` | int | Non-standard buy-ins, cache |
| `cash_paid_agorot` | int | Cash physically put in the pot (#18), cache |
| `chips_final` | int NULL | Chips at settle |
| `is_settled` | bool | Row grayed out (#15) |
| `settled_at` | timestamptz NULL | |
| `is_removed` | bool | Soft delete; excluded from math, kept in log |

Constraints:
- `unique (game_id, display_name) where is_removed = false` — enforces #9 at the DB level.
- `unique (game_id, user_id) where user_id is not null` — a person can't be in a game twice.

### `game_events`
Append-only. The source of truth.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint identity PK | Server-assigned order |
| `game_id` | uuid → games | |
| `player_id` | uuid → game_players NULL | |
| `actor_id` | uuid → profiles | Who did it |
| `type` | enum, below | |
| `payload` | jsonb | Type-specific |
| `client_event_id` | uuid **unique** | Idempotency for offline retries |
| `client_created_at` | timestamptz | When it happened on the device |
| `created_at` | timestamptz | When the server received it |
| `undone_by` | bigint NULL | Points at the inverse event, for log rendering |

Event types:

```
player_added        player_removed       player_renamed
buy_in_added        buy_in_removed       custom_buy_added
cash_paid_set       buy_in_reassigned
chips_set           player_settled       player_reopened
game_started        game_settling        game_ended        game_reopened
host_changed        viewer_added         viewer_removed
unaccounted_set     transfer_edited      transfer_marked_paid
note
```

A trigger updates the `game_players` caches on insert. Nightly (or on read of a finished game) a
consistency check can re-fold events and assert the caches match — cheap insurance.

### `transfers`
Produced by settlement, then editable (#16, #17).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `game_id` | uuid → games | |
| `from_player_id` | uuid NULL | **NULL = the pot (קופה)** |
| `to_player_id` | uuid NULL | NULL = the pot (money going in, rare) |
| `amount_agorot` | int | |
| `is_manual` | bool | True once a human edited it |
| `order_index` | int | |
| `is_paid` | bool | Optional check-off; feeds a "settles up reliably" stat |
| `paid_at` | timestamptz NULL | |

### `game_viewers` (#5, #14)
| Column | Type |
|---|---|
| `game_id` | uuid → games |
| `user_id` | uuid → profiles |
| `added_by` | uuid → profiles |
| `added_at` | timestamptz |

### `share_links` (#5)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `game_id` | uuid → games | |
| `token` | text unique | 128-bit random, URL-safe |
| `created_by` | uuid | |
| `expires_at` | timestamptz NULL | |
| `revoked_at` | timestamptz NULL | |
| `last_viewed_at` | timestamptz NULL | Lets the host see the link is being used |

### `guest_claims` (#21)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `game_player_id` | uuid → game_players | The guest row being claimed |
| `claimant_user_id` | uuid → profiles | |
| `approved_by` | uuid NULL | Host who approved |
| `status` | enum(`pending`,`approved`,`rejected`) | |

Approval sets `game_players.user_id`, retroactively merging the history into that person's
statistics.

---

## Derived view: `player_game_results`

Everything downstream — settlement and every statistic — reads this one view.

```sql
create view player_game_results as
select
  gp.id                as game_player_id,
  gp.game_id,
  gp.user_id,
  gp.display_name,
  g.group_id,
  g.played_on,
  g.started_at,
  g.ended_at,
  gp.buys_count,
  -- what they owe the game
  gp.buys_count * g.buy_amount + gp.custom_buys_agorot  as owed_agorot,
  gp.cash_paid_agorot,
  -- what their chips are worth
  (gp.chips_final::numeric * g.buy_amount / g.chips_per_buy)::int as cash_out_agorot,
  -- profit/loss for statistics
  (gp.chips_final::numeric * g.buy_amount / g.chips_per_buy)::int
    - (gp.buys_count * g.buy_amount + gp.custom_buys_agorot)      as net_agorot,
  -- what still has to move at settlement (cash already handed over is discharged)
  (gp.chips_final::numeric * g.buy_amount / g.chips_per_buy)::int
    - (gp.buys_count * g.buy_amount + gp.custom_buys_agorot)
    + gp.cash_paid_agorot                                          as settlement_balance_agorot
from game_players gp
join games g on g.id = gp.game_id
where gp.is_removed = false;
```

The distinction between `net_agorot` and `settlement_balance_agorot` is the crux of the whole
money model and is explained in [05](05-settlement.md#the-money-model). Statistics always use
`net_agorot`; settlement always uses `settlement_balance_agorot`.

---

## Row Level Security

Enabled on every table. Helper functions (`SECURITY DEFINER`, `STABLE`):

```sql
is_host(game_id)          -- auth.uid() = games.host_id
is_game_player(game_id)   -- a non-removed game_players row with user_id = auth.uid()
is_game_viewer(game_id)   -- a game_viewers row for auth.uid()
can_read_game(game_id)    -- is_host or is_game_player or is_game_viewer
```

| Table | Read | Write |
|---|---|---|
| `games` | `can_read_game` | `is_host` (and only for allowed status transitions) |
| `game_players` | `can_read_game` | `is_host` |
| `game_events` | `can_read_game` | `is_host`, insert-only — **no update, no delete, ever** |
| `transfers` | `can_read_game` | `is_host` |
| `game_viewers` | `can_read_game` | `is_host` |
| `share_links` | `is_host` | `is_host` |
| `profiles` | `display_name`/`avatar_url` readable to co-members of a shared group; the rest self-only | self |
| `groups`, `group_members` | members | `owner` |
| `guest_claims` | claimant + host | claimant inserts, host approves |

**Anonymous share access** does not use a policy. It uses one RPC:

```sql
create function get_shared_game(p_token text)
returns jsonb language plpgsql security definer as $$ ... $$;
```

It validates the token (exists, not revoked, not expired), stamps `last_viewed_at`, and returns
a *read-only projection* — game header, players, results, transfers, and optionally the audit
log. Anonymous clients never get direct table access, so there is no policy to get wrong. A
matching `subscribe_shared_game` channel, or 15s polling, provides live updates for viewers.

Immutability of the log is enforced with a rule denying `update`/`delete` on `game_events` to
all roles including the host. Undo appends; it does not erase.

---

## Statistics materialisation

Statistics are pure aggregations over `player_game_results` and `games`
([06](06-statistics.md)). Start with plain views — with a few hundred games they are instant.
If they ever get slow, convert to a materialised view refreshed when a game reaches `finished`.
Do not prematurely denormalise.
