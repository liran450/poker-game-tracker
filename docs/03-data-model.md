# 03 — Data Model

Postgres (Supabase). All ids are `uuid`, all timestamps are `timestamptz`.

## Money representation

Money is stored as an **integer in the currency's minor unit** — agorot for ₪, cents for $ —
alongside the game's `currency` code. `₪50` is stored as `5000`.

Columns carry a neutral `_minor` suffix rather than a currency-specific one, because other
currencies are coming later. **Nothing user-facing ever says "minor units" or "agorot"** — the UI,
share text and these documents speak in the currency's own name: shekels, dollars.
See [07](07-hebrew-glossary.md#formatting-conventions).

**Currency is a label, not a conversion.** Changing a game's or a group's currency changes the
symbol and nothing else — `5000` stays `5000`, it just reads as `$50` instead of `₪50`. The app
never converts between currencies and never fetches an exchange rate. A game keeps the label it was
played under; statistics sum the raw numbers and display them in the group's current label, with a
one-line note if a group's history spans more than one
([06](06-statistics.md#scoping)).

## Event sourcing

Every mutation to a live game is an append-only row in `game_events`. Current state is a fold
over events, cached in denormalised columns on `game_players` for fast reads.

One mechanism buys four features:

| Feature | How it falls out |
|---|---|
| Audit log (#22) | The event stream *is* the log. Render it. |
| Undo | Append the inverse event. Nothing is destroyed. |
| Offline sync ([02](02-architecture.md#offline-first)) | Events are commutative increments, not overwrites — two phones merge cleanly |
| Idempotent retries | `client_event_id` is unique; replaying a push is a no-op |

Events are also the largest table by far, and the first thing to be purged — see
[Retention](#retention-and-archiving).

---

## Live tables

These hold an in-progress or recently finished game. They are **not** permanent.

### `profiles`
Mirrors `auth.users`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | → `auth.users.id` |
| `username` | text unique | Stable handle, shown in parentheses after a nickname (see [Naming](#naming-and-nicknames)) |
| `display_name` | text | From Google or chosen at signup |
| `avatar_url` | text | Optional |
| `phone` | text | Optional, for `wa.me` links ([05](05-settlement.md#payment-links--reality-check-23)) |
| `locale` | text | `he` default; the app is built for more languages later |
| `stats_visibility` | enum(`group`,`private`) | default `group` |
| `created_at` | timestamptz | |

### `groups` — חבורה
The recurring circle of friends. Scopes quick-add and **all** statistics — no statistic ever
crosses a group boundary.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | e.g. `הפוקר של יום חמישי` |
| `created_by` | uuid → profiles | |
| `currency` | text | default `ILS` |
| `default_buy_amount_minor` | int | default 5000 |
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

Group membership is what authorises an **emergency host takeover** — see
[Host takeover](#host-takeover).

### `games`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `group_id` | uuid → groups NULL | Group-less games contribute to personal stats only |
| `name` | text | default `פוקר — DD.MM.YY` |
| `played_on` | date | |
| `currency` | text | default `ILS`, inherited from the group |
| `buy_amount_minor` | int | Immutable once a buy-in exists |
| `chips_per_buy` | int | Immutable once a buy-in exists |
| `status` | enum(`setup`,`active`,`settling`,`finished`) | |
| `host_id` | uuid → profiles | Exactly one host, always |
| `created_by` | uuid → profiles | Never changes; `host_id` does |
| `started_at` | timestamptz | |
| `ended_at` | timestamptz NULL | |
| `reopen_deadline` | timestamptz NULL | `ended_at + 24h` (#22) |
| `host_last_synced_at` | timestamptz | Last successful event push from the host's device. Powers the takeover warning |
| `unaccounted_minor` | int | The 🔴 discrepancy assigned to "the house" (#20) |
| `notes` | text | |

> **Chip value** is derived, never stored: `chip_value = buy_amount_minor / chips_per_buy`.
> Changing `buy_amount_minor` after buy-ins exist would silently rewrite history, so it is blocked
> once the first buy-in event lands.

### `game_players`
One person in one game. Registered user **or** guest.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `game_id` | uuid → games | |
| `user_id` | uuid → profiles NULL | NULL ⇒ guest (#21) |
| `guest_name` | text NULL | Guests only; freely editable |
| `nickname` | text NULL | Per-game nickname for a **registered** player — see [Naming](#naming-and-nicknames) |
| `seat_order` | int | List order |
| `joined_at` | timestamptz | Late joiners → accurate per-hour stats |
| `left_at` | timestamptz NULL | Set on settle |
| `buys_count` | int | **Cache** of the event fold |
| `custom_buys_minor` | int | Reserved. Non-standard buy-in amounts are deferred — see [09](09-roadmap.md#explicitly-deferred) |
| `cash_paid_minor` | int | Cash physically put in the pot (#18), editable straight from the row |
| `chips_final` | int NULL | Chips at settle |
| `is_settled` | bool | Row grayed out (#15) |
| `settled_at` | timestamptz NULL | |
| `is_removed` | bool | Soft delete; excluded from math, kept in the log |

Constraints:
- `unique (game_id, user_id) where user_id is not null` — a person can't be in a game twice.
- Display-name uniqueness is enforced in the application on the *rendered* name (below), since
  that name is composed rather than stored in one column.

### Naming and nicknames

The name shown for a player row is composed, not stored:

| Case | Rendered as | Editable |
|---|---|---|
| Guest | `guest_name` | ✅ Free rename — it's just a label |
| Registered, no nickname | `profiles.display_name` | ❌ Only that person can change their own display name |
| Registered, with nickname | `nickname (username)` — e.g. `הכריש (mor_l)` | ✅ Host sets the nickname |

Renaming a registered player therefore never overwrites their identity; it decorates it, and the
username stays visible so nobody can be misrepresented in a game that involves money. Statistics
always key off the profile, never the nickname.

**Nicknames are stored per game but behave as if they persist.** When a player is added, the
nickname field is pre-filled from that person's most recent nickname *in the same group*. Set
`הכריש` once and it reappears every Thursday; change it for one night and only that night changes.
This gets the ergonomics of a persistent nickname with no extra table and no cross-game write.

```sql
-- pre-fill on player_added
select nickname from game_players gp
join games g on g.id = gp.game_id
where gp.user_id = $user and g.group_id = $group and gp.nickname is not null
order by g.played_on desc limit 1;
```

**Duplicates (#9)** apply to the rendered name: a second `מור` becomes `מור (1)`, a third
`מור (2)`. The suffix goes on the *new* entry. Two registered users with the same display name
disambiguate naturally via the username as soon as either is nicknamed. A guest name that collides
with a registered player's name is suffixed like any other duplicate — the app does not try to
guess that they're the same person.

### `game_events`
Append-only. The source of truth for a live game.

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
player_added        player_removed       player_renamed       nickname_set
buy_in_added        buy_in_removed       cash_paid_set        buy_in_reassigned
chips_set           player_settled       player_reopened
shared_cost_added   shared_cost_removed  shared_cost_updated
game_started        game_settling        game_ended           game_reopened
host_changed        host_taken_over      viewer_added         viewer_removed
join_requested      join_approved        join_rejected
unaccounted_set     transfer_edited      note
```

A trigger updates the `game_players` caches on insert.

### `shared_costs`
Pizza, tips, the table's beer.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `game_id` | uuid → games | |
| `label` | text | `פיצה`, `טיפ`, … |
| `amount_minor` | int | |
| `paid_by_player_id` | uuid → game_players NULL | NULL = paid from the pot |
| `split_mode` | enum(`equal`,`custom`) | |
| `created_at` | timestamptz | |

### `shared_cost_shares`
| Column | Type | Notes |
|---|---|---|
| `cost_id` | uuid → shared_costs | |
| `game_player_id` | uuid → game_players | |
| `amount_minor` | int | Computed for `equal`, entered for `custom`. Must sum to the cost |

Shared costs affect **settlement only**, never poker statistics — a player who lost ₪80 at cards
and chipped in ₪20 for pizza lost ₪80 at poker. Math in [05](05-settlement.md#shared-costs).

### `transfers`
Produced by settlement, then editable (#16, #17).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `game_id` | uuid → games | |
| `from_player_id` | uuid NULL | **NULL = the pot (קופה)** |
| `to_player_id` | uuid NULL | NULL = the pot |
| `amount_minor` | int | |
| `is_manual` | bool | True once a human edited it |
| `order_index` | int | |

There is deliberately **no "mark as paid" flag.** People who receive money don't come back into
the app to tick a box, so the data would be wrong more often than right, and a half-filled
checklist is worse than none.

### `game_viewers` (#5, #14)
| Column | Type |
|---|---|
| `game_id` | uuid → games |
| `user_id` | uuid → profiles |
| `added_by` | uuid → profiles NULL — NULL means they joined via the share link |
| `added_at` | timestamptz |

### `share_links` (#5)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `game_id` | uuid → games | |
| `token_hash` | bytea unique | **SHA-256 of the token. The token itself is never stored** |
| `token_prefix` | text | First 6 chars, so the host can tell two links apart in the UI |
| `created_by` | uuid | |
| `created_at` | timestamptz | Expiry is measured from here |
| `revoked_at` | timestamptz NULL | |
| `last_viewed_at` | timestamptz NULL | |
| `view_count` | int | Shown to the host as `3 צופים` |

#### Link security

The requirement is that a link must not be guessable and must not simply be a game id. The design:

- **256-bit token** from a CSPRNG, base64url-encoded to 43 characters. Not derived from the game
  id, not sequential, not a UUID (UUIDv4 gives 122 bits; there's no reason to settle for that
  here).
- **Only a SHA-256 hash is stored.** Lookup is by hash, so a database leak — or a careless
  screenshot of a table — yields nothing usable. The plaintext token exists only in the URL the
  host copied.
- **The token lives in the URL fragment**, not the query string: `…/#/s/<token>`. Fragments are
  never sent to the server, never appear in access logs, and are stripped from `Referer` headers.
  The app already uses a hash router ([02](02-architecture.md#hosting-details)), so this costs
  nothing.
- **Revocable and rotatable.** `בטל קישור` kills it; `צור קישור חדש` issues a fresh token and
  invalidates the old one. Both are one tap in the share sheet.
- **Failed-lookup throttling** in the RPC — after a handful of bad tokens from the same caller,
  back off. Brute-forcing 256 bits is not a real threat; this just keeps enumeration noise out of
  the logs.
- The token never appears in a page title, an analytics event, or the share-text preview.

#### Link lifetime

One token, two lifetimes, evaluated at request time by who is asking:

| Who's opening it | Link works for |
|---|---|
| Anonymous, or a signed-in user who is not in the game's group | **7 days** from creation |
| Signed-in member of the game's group | **30 days** from creation |

This is deliberately a single link rather than two — the host shares one URL into one WhatsApp
group, and each recipient gets the window appropriate to them. Enforcement is server-side in the
RPC, never in the client.

Group members are never actually cut off from their own history: after 30 days they open the game
from the app's history list, which needs no link at all. The expiry only closes the door on people
outside the group.

Expired and revoked links are deleted by the maintenance cron.

**What the link does depends on the game's status:**

| Game status | Link behaviour |
|---|---|
| `active` / `settling` | **Joins the game as a viewer.** A signed-in visitor is added to `game_viewers` so the host can see who's watching, and can be promoted to a player by the host. Anonymous visitors get the same live read-only page without being recorded. Read-only either way — no write path exists for a viewer |
| `finished` | **Settlement view only.** Results and the transfer list, nothing else — no live controls, no audit log, no player management |
| purged or deleted | A results-only archive card, or a plain "this game is no longer available" |

### `join_requests` (#21)

The only thing a guest can actively do: **ask to join a game**. Only the host can approve.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `game_id` | uuid → games | |
| `user_id` | uuid → profiles NULL | Set when the requester is signed in |
| `requested_name` | text | What they want to be called at the table |
| `status` | enum(`pending`,`approved`,`rejected`) | |
| `decided_by` | uuid NULL | The host who decided |
| `created_at`, `decided_at` | timestamptz | |

Flow: someone opens the share link for a live game → `בקש להצטרף למשחק` → the host sees a badge on
the game page and approves or rejects from a sheet. Approval creates a `game_players` row (with
`user_id` if they were signed in, otherwise a guest row). Rejection is silent to everyone but the
requester. Every decision is an event, so it shows in the audit log.

Guests still cannot edit anything, ever — a guest who joins is a player row on someone else's
screen, not an editor. Writes remain host-only
([RLS](#row-level-security)).

> **Note on a dropped feature.** The original brief (#21) also asked for a "claim profile / link
> guest" button so a guest's past games would merge into their statistics once they signed up. That
> is now out: guest rows stay guest rows, and a person's statistics start when their account starts.
> This simplifies the model considerably — no retroactive rewriting of permanent results, and no
> question of who's allowed to approve a claim years later. Flagging it because it was an explicit
> item in the original list; say the word if the merge was wanted after all.

---

## Permanent tables

Written once, when a game reaches `finished`, and **kept forever**. They are the entire basis of
statistics, and they survive both automatic purging and explicit deletion of the game.

### `game_summaries`
| Column | Type | Notes |
|---|---|---|
| `game_id` | uuid PK | Same id as the original game; the `games` row may no longer exist |
| `group_id` | uuid NULL | |
| `name`, `played_on` | text, date | |
| `currency` | text | |
| `buy_amount_minor`, `chips_per_buy` | int | Chip value stays recomputable |
| `player_count` | int | |
| `duration_minutes` | int | |
| `total_buy_ins_minor` | int | |
| `total_cash_pot_minor` | int | |
| `unaccounted_minor` | int | Feeds the long-term "house loss" stat |
| `shared_costs_minor` | int | |
| `finished_at` | timestamptz | |

### `player_results`
One immutable row per player per finished game.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `game_id` | uuid → game_summaries | |
| `group_id` | uuid NULL | Denormalised so statistics never join a purged table |
| `user_id` | uuid → profiles NULL | NULL for a guest. Never backfilled — guest results stay guest results |
| `guest_name` | text NULL | Retained so the row still reads correctly years later |
| `display_name` | text | The name as rendered on the night |
| `buys_count` | int | |
| `owed_minor` | int | |
| `cash_paid_minor` | int | |
| `chips_final` | int | |
| `cash_out_minor` | int | |
| `net_minor` | int | **Poker result only** — excludes shared costs |
| `shared_costs_share_minor` | int | A single amount. Statistics report the total, not what it was spent on |
| `minutes_played` | int | From `joined_at` / `left_at`, for profit-per-hour |
| `settled_position` | int NULL | Order of settling that night |

### `transfer_summaries`
The settlement list, flattened and retained alongside the results so the share text and the
finished-game share link keep working after the live rows are gone.

| Column | Type |
|---|---|
| `game_id` | uuid → game_summaries |
| `from_name`, `to_name` | text (`קופה` for the pot) |
| `from_user_id`, `to_user_id` | uuid NULL — powers the nemesis/patron stat |
| `amount_minor` | int |
| `order_index` | int |

Snapshot writing is one transactional function, `finalize_game(game_id)`, called when the game
ends. Reopening within 24h deletes the snapshot and rewrites it on the next end, so there is never
a stale duplicate.

---

## Retention and archiving

Detailed game data is deleted over time so the free-tier database doesn't fill with rows nobody
will ever look at. Statistics are unaffected, because they read from the permanent tables above
and never from the live ones.

| Tier | Data | Kept for | Why |
|---|---|---|---|
| 1 | `game_summaries`, `player_results`, `transfer_summaries` | **Forever** | The statistics substrate. Tiny — a few hundred bytes per player-game |
| 2 | `games`, `game_players`, `transfers`, `shared_costs` | **90 days** after `finished_at` | Long enough for any real dispute; nobody opens a game from last year |
| 3 | `game_events` | **30 days** after `finished_at` | The audit log only matters while an argument is still live, and it's ~90% of the row count |

These windows are short on purpose. The results card carries everything anyone actually looks back
at — date, players, results, who paid whom — so keeping the raw detail beyond a season buys nothing
and costs the free tier. Share links expire well before tier 2 does (30 days at most), so no link
ever outlives the data behind it.

Rules:

- **A game can only be purged after its snapshot exists.** The purge job asserts this; no
  snapshot, no delete.
- **Explicit deletion by the host follows the same rule.** Deleting a finished game removes tiers
  2 and 3 immediately and keeps tier 1. The confirmation must say so plainly:
  `הנתונים המפורטים יימחקו. הסטטיסטיקה תישמר.`
- Deleting an *unfinished* game deletes everything; there was nothing worth keeping.
- Retention windows are constants in one place, not scattered magic numbers, and are worth
  exposing as group settings later.
- **Offer an export before the first purge**, and let the host export any game at any time
  ([08 A19](08-gaps-and-open-questions.md#a16-data-export)).

Implementation: a `purge_expired_game_data()` SQL function, invoked by the same GitHub Actions
cron that keeps the Supabase project awake ([02](02-architecture.md#database-choice)). No server
required.

A purged game still appears in history as a **results card** — date, players, everyone's result
and the transfer list — just without the row-by-row audit trail.

---

## Statistics source

```sql
-- every statistic in doc 06 reads from here, never from the live tables
select *
from player_results pr
join game_summaries gs on gs.game_id = pr.game_id
where pr.group_id = $1;
```

Start with plain views over these two tables. At the scale of a home game — hundreds of games over
years — they return in milliseconds. Convert to a materialised view refreshed by `finalize_game`
only if a measurement says to.

---

## Row Level Security

Enabled on every table. Helper functions (`SECURITY DEFINER`, `STABLE`):

```sql
is_host(game_id)            -- auth.uid() = games.host_id
is_game_player(game_id)     -- a non-removed game_players row with user_id = auth.uid()
is_game_viewer(game_id)     -- a game_viewers row for auth.uid()
is_group_member(group_id)   -- authorises host takeover and group statistics
can_read_game(game_id)      -- host or player or viewer
```

| Table | Read | Write |
|---|---|---|
| `games` | `can_read_game` | `is_host` (plus the takeover RPC below) |
| `game_players` | `can_read_game` | `is_host` |
| `game_events` | `can_read_game` | `is_host`, insert-only — **no update, no delete, ever** |
| `shared_costs`, `shared_cost_shares` | `can_read_game` | `is_host` |
| `transfers` | `can_read_game` | `is_host` |
| `game_viewers` | `can_read_game` | `is_host`, plus self-insert through the share-link RPC |
| `share_links` | `is_host` | `is_host` |
| `profiles` | `username`, `display_name`, `avatar_url` readable to co-members of a shared group; everything else self-only | self |
| `groups`, `group_members` | members | `owner` |
| `player_results`, `game_summaries`, `transfer_summaries` | `is_group_member(group_id)`, or self for group-less games | **Nobody.** Written only by `finalize_game()` |
| `join_requests` | requester + host | requester inserts (via the share-link RPC); **only the host** may decide |

**Writes are host-only, permanently.** Not a v1 simplification to be relaxed later — one person
holds the pen for the whole night. Players and viewers have no write path to any game table, and
the only two exceptions are narrow, audited RPCs: `take_over_host` (below) and a join request,
which creates nothing until the host approves it.

### Host takeover

A host's phone dies mid-game and control has to move **immediately** — waiting is not acceptable.

```sql
create function take_over_host(p_game_id uuid) returns void
  security definer as $$ ... $$;
```

Authorised for any signed-in **member of the game's group** (or, for a group-less game, any
registered player in it). No waiting period. The function sets `host_id`, appends a
`host_taken_over` event naming the actor, and the previous host's device shows a banner telling
them they are no longer the host.

The client shows a warning before calling it:
`ודאו שהמכשיר של המנהל הנוכחי סונכרן — שינויים שלא נשלחו עלולים ללכת לאיבוד.`
together with the host's last sync time from `host_last_synced_at`
(`סונכרן לאחרונה לפני 4 דקות`). Unsynced events from the old host that arrive later are **still
accepted** — they're append-only and idempotent, so nothing is lost provided their phone
eventually reconnects. The warning exists because they might never reconnect.

A takeover is **announced, not just logged**: everyone with the game open — players, viewers and
the outgoing host — gets a banner naming who took control, alongside the `host_taken_over` log
entry. The action is instant and ungated, so visibility is the guardrail.

### Anonymous share access

No table policy. One RPC per mode, both `SECURITY DEFINER`, both taking the plaintext token and
looking it up by `sha256(token)`:

1. Hash the token; find the link; reject if missing, revoked, or past the caller's window
   (7 days for anyone outside the group, 30 for a group member — see
   [Link lifetime](#link-lifetime)).
2. Stamp `last_viewed_at`, bump `view_count`.
3. Return the projection for the game's status.

- `get_shared_game(token)` — live games. Read-only projection: header, players, results, activity.
  A signed-in caller is also inserted into `game_viewers` so the host sees who's watching, and may
  submit a `join_requests` row.
- `get_shared_settlement(token)` — finished games. Results and transfers only, sourced from
  `transfer_summaries` so it keeps working after the live rows are purged.

Anonymous clients never get direct table access, so there is no policy to get wrong. Every rejection
returns the same generic "not available" shape regardless of cause — expired, revoked, wrong token
or no such game — so the RPC can't be used to probe which game ids exist.

Log immutability is enforced with a rule denying `update`/`delete` on `game_events` to all roles
including the host. Undo appends; it does not erase. Only `purge_expired_game_data()`, running as
the table owner, may delete.
