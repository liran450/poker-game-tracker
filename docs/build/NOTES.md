# Notes — what we learned while building

Durable knowledge that outlives a session. [`PROGRESS.md`](PROGRESS.md) says *where we are*; this
file says *what we now know*. It is the mechanism that stops the same mistake being made twice, so
writing to it is part of finishing a step, not an afterthought.

## What belongs here

- **Traps** — something that broke, and why, in enough detail that the fix is obvious next time.
- **Decisions taken during build** that the specification didn't settle, with the reasoning.
- **Environment facts** — versions, flags, quirks of the tooling, things that cost half an hour to
  discover.
- **Retractions** — an entry that turned out to be wrong. Edit it in place and mark it
  `~~struck~~ — superseded: …`. Never silently delete: an entry someone once relied on has to
  stay findable.

## What does not belong here

Status (that's `PROGRESS.md`), product decisions (those are `docs/01`–`docs/10`, and if a build
session changes one, the doc gets edited and the change is noted here), or narration of work that
went fine.

## Format

Newest first, so the file is read top-down. Each entry:

```
### <short imperative title>
**Step N · date · trap | decision | environment | retraction**

What happened, why it matters, and what to do about it.
```

---

## Open questions raised during build

Questions the specification doesn't answer, found while building. Ask the user; don't guess.
`README.md` says every planning question was closed across five review rounds, so anything landing
here is genuinely new — which makes it worth asking rather than quietly inventing an answer.

_(none open — see the settled entry below on session storage.)_

---

## Entries

### No Docker in this sandbox — the Supabase CLI's local stack can't run here
**Step 10 · 2026-07-29 · environment**

`docs/02-architecture.md` and `PLAN.md` both assume "local dev via the Supabase CLI" for
step 10 — `supabase start` spins up Postgres + GoTrue + PostgREST + Studio via Docker Compose.
This sandbox has `docker` installed but no daemon (`/var/run/docker.sock` doesn't exist, and
`service docker start` fails on `ulimit` — no permission to fix that here), so that path is
closed. It also has no real Supabase account/project to fall back on — creating one is a
cloud-resource signup only the repository owner can do.

What *is* available and used instead: `postgresql-16` is installed as a real server (not just
`psql`/`pg_dump` client tools) — `pg_lsclusters` showed a stopped `main` cluster; `service
postgresql start` brings it up, `pg_hba.conf` already allows password auth over TCP on
127.0.0.1/::1. Migrations are hand-authored with Supabase's own timestamp-prefixed filename
convention (`YYYYMMDDHHMMSS_name.sql`) even though the CLI never touched them, so `supabase
link && supabase db push` should accept `supabase/migrations/*.sql` unmodified whenever a real
project exists — nothing here depends on a CLI-specific extension.

`supabase/tests/support/auth-shim.sql` recreates the two things a real Supabase project
provides before any app migration runs — an `auth` schema with `auth.users`/`auth.uid()`/
`auth.role()`, and default privileges granting `anon`/`authenticated` coarse table access so
RLS is the only real gate — and is applied only to the local test database, never to a real
project (which already has both, and reapplying `create schema auth` there would conflict with
the platform's own). CI mirrors this with a plain `postgres:16` service container (GitHub
Actions runs Docker natively even though this sandbox can't) — see `.github/workflows/
deploy.yml`'s `db-tests` job.

**Consequence for "a CI check that supabase/migrations is the single source of schema truth"**
(a step-10 build line, not one of its four exit criteria): the meaningful version of this today
is "the migrations directory alone, applied in order to nothing, reconstitutes a working
schema" — which `supabase/tests/support/globalSetup.ts` proves on every `test:db` run, local or
CI. A real drift check (does the *live* project's schema still match the migrations, i.e. did
someone edit a table from the dashboard?) needs a live project to diff against and has to wait
for step 12.

### Postgres RLS + `RETURNING` can miss a row this same statement just inserted
**Step 10 · 2026-07-29 · trap**

`insert into games (...) returning id` spuriously failed `new row violates row-level security
policy for table "games"` even though the insert's own `with check` (`host_id = auth.uid() and
created_by = auth.uid()`) was obviously true — confirmed directly: the identical boolean
condition, and a separate `select can_read_game(id), is_host(id) from games where …` run as a
follow-up statement in the same transaction, both evaluated `true`. Only the `RETURNING` form
failed; the same insert without `RETURNING` succeeded outright.

Root cause: `games_select` was originally `using (can_read_game(id))`, and `can_read_game` →
`is_host` is a `SECURITY DEFINER` function that re-queries `games` itself (`select 1 from games
where id = p_game_id and host_id = auth.uid()`). For `INSERT ... RETURNING`, Postgres also
evaluates the table's SELECT policy against the new row, and a *separate* nested query inside a
security-definer function evidently doesn't reliably see this same command's own just-inserted
row — a self-referential helper is the specific thing that breaks, not RLS+RETURNING in
general.

**Fix:** for a table's *own* policies, never reference a helper function that re-queries that
same table. `games_select`/`games_update`/`games_delete` now compare `host_id = auth.uid()`
directly (a plain column read off the row already being evaluated, no subquery) and only call
`is_game_player`/`is_game_viewer` for the *other* two clauses — both of those query different,
already-committed tables, which is safe. `is_host`/`can_read_game` remain exactly right for
*other* tables' policies (`game_players`, `game_events`, `shared_costs`, …), where the row being
written and the row `is_host` queries are never the same table. Rule of thumb: a table's own
RLS policies should read its own row's columns directly wherever possible; reach for a
cross-table helper only when the policy genuinely needs a different table.

The identical trap resurfaced for `join_requests_insert`/`player_claims_insert`: both had an
inline `(select group_id from games g where g.id = game_id)`, evaluated under the *caller's*
own (much more restricted) RLS on `games` — and a group member asking to join a game they can't
see yet is exactly a caller who fails `games_select`. Fixed by adding `game_group_id()`, a
`SECURITY DEFINER` helper that looks up a *different* table (`games`, not the policy's own
table), which is the safe case. Same fix for `group_members_insert_owner`'s
`(select created_by from groups …)` → `group_created_by()`, for the same reason (a group's
brand-new creator can't yet pass `groups_select`, since `is_group_member` is false until this
very insert succeeds).

### `game_events`'s cache trigger is scoped to `game_players` only, on purpose
**Step 10 · 2026-07-29 · decision**

`PLAN.md`'s own step-10 wording is narrow — "the game_events trigger maintaining the
game_players caches" — not the other five live tables event payloads also describe
(`shared_costs`, `transfers`, `join_requests`, `player_claims`, `game_viewers`, plus
`games.status`/`host_id`). Read literally and kept that way: `apply_game_event_to_player_cache()`
(an `AFTER INSERT ON game_events` trigger) only handles the event types whose *entire* effect is
a `game_players` column — `player_added` (creates the row), `player_removed`, `player_renamed`,
`nickname_set`, `buy_in_added`/`removed`, `cash_paid_set`, `chips_set`, `player_settled`/
`reopened`, and `claim_approved` (only its `user_id` side-effect).

Everything else stays a **direct write** by whoever calls it — `take_over_host` updates
`games.host_id` itself in the same statement it appends `host_taken_over`, exactly as
`03-data-model.md#host-takeover` describes it ("sets host_id, appends a … event"), not "appends
an event, and something derives `host_id` from it." `decide_join_request` directly inserts the
`game_viewers` row on a viewer approval. The repository layer (step 12) is expected to keep
doing this — write the specific live table *and* append the matching event in the same
transaction — rather than trying to replay the whole event log through triggers for tables that
already hold full current state, not just a scalar cache. `game_players`' handful of columns are
the one case cheap and unambiguous enough to derive purely incrementally from the log.

**Known limitation, out of step 10's scope (confirmed against `PLAN.md`'s own step
dependencies — step 12 owns concurrent merge):** the trigger applies events in **server arrival
order**, not `core/events.ts`'s `clientCreatedAt`-based fold order, and doesn't replicate
`fold()`'s undo-pair *exclusion* — it applies every event's effect cumulatively, including
inverse events, and relies on downstream consumers already filtering on `is_removed`/
`is_settled` for the observable result to match. That's fine for one host pushing their own
outbox in order (all step 10 needs); revisit if step 12's concurrent-multi-device merge exposes
a case where incremental application and fold-with-exclusion actually diverge in something
user-visible.

### `game_events` is "insert-only, no update, no delete, ever" — except one narrow, forward-only RPC
**Step 10 · 2026-07-29 · decision**

`03-data-model.md` states both halves of a real tension: "an undo appends an inverse event and
sets `undone_by` on the original" (implying an update), and separately, in the same document,
that `game_events` is "insert-only — no update, no delete, ever … enforced with a rule denying
update/delete … to all roles including the host." Resolved the same way Postgres resolves it
for any table: **no RLS policy and no grant permits `UPDATE`/`DELETE` on `game_events` for
`anon`/`authenticated`** (`revoke update, delete on game_events from anon, authenticated;`, on
top of RLS's own default-deny with no update/delete policy defined) — that is the literal
"insert-only, no exceptions for any API-facing role" half. `mark_event_undone(original,
inverse)` is a single `SECURITY DEFINER` function, host-only, that performs the one sanctioned
mutation: `undone_by` can move from `null` to a value once, never again (already-linked is a
silent no-op, not an error, so a retried push stays idempotent) and no other column is ever
touched. This is the same shape as `take_over_host` — a narrow, audited escape hatch — not a
general write path.

### `transfers` needs a `party` column — the schema doc predates the house node
**Step 10 · 2026-07-29 · decision**

`03-data-model.md#transfers` has a single nullable `from_player_id`/`to_player_id` pair ("NULL =
the pot"), written before step 8 added a second non-player settlement node (the
house/unaccounted node, `core/settlement.ts`'s `HOUSE_ID`). `core/events.ts`'s `transfer_edited`
payload already moved off that convention for the same reason, in step 9 (see that entry
below) — plain `string` fields carrying `POT_ID`/`HOUSE_ID` sentinels instead of `null`.

Rather than inventing two magic non-null UUID constants to keep `from_player_id uuid` a single
nullable column, `transfers` gained `from_party`/`to_party settlement_party` (`'player' |
'pot' | 'house'`) alongside `from_player_id`/`to_player_id uuid references game_players(id)`,
with a check constraint tying them together (`party = 'player'` iff the id column is set). A
real player reference stays FK-checked; pot/house are named, not smuggled into the uuid space.
Step 12's repository layer will need to map `POT_ID`/`HOUSE_ID` ⇄ `party = 'pot' | 'house',
player_id = null` when it starts writing real `transfers` rows.

### The step-10 RPCs, and what's deliberately *not* one
**Step 10 · 2026-07-29 · decision**

`PLAN.md` names exactly two RPCs for step 10: `take_over_host` and "the join-request path."
Built as three functions plus one trigger, reasoned out as follows — a plain RLS-gated
`INSERT` already covers "ask to join" for a signed-in group member (`join_requests_insert`), so
that's not an RPC at all; a small `AFTER INSERT` trigger on `join_requests`
(`log_join_requested`) appends the matching `join_requested` game_event so the ask still shows
up in the audit log, since a direct table insert wouldn't otherwise produce one.
`decide_join_request(request_id, approve)` is the actual "join-request path" RPC — host-only,
and genuinely needs to be one function since approval atomically creates a `game_players` (via
a `player_added` event, letting the existing trigger seat them) or `game_viewers` row *and*
appends the decision event. `take_over_host` matches `03-data-model.md#host-takeover` directly.
`mark_event_undone` (see the entry above) rounds out the set — not named in `PLAN.md`, but
without it "sets `undone_by`" has no real implementation at all.

**Deliberately not built here** (all step 13's, once `share_links` has real token-validation
logic behind it): the anonymous/share-link variant of asking to join, `find_user_by_username`
(that's step 14's, per its own exit criteria), and any RPC that lets an anonymous caller read or
write anything — `join_requests_insert`/`player_claims_insert` only cover the signed-in,
in-app, same-group path for exactly this reason.

### `profiles_public`: a security-definer view is how column-level privacy actually works under RLS
**Step 10 · 2026-07-29 · decision**

`03-data-model.md#row-level-security` wants `profiles.username`/`display_name`/`avatar_url`
readable to co-members of a shared group, with everything else (phone, locale,
`stats_visibility`, `default_nickname`) self-only. RLS is strictly row-level — a single row
policy can't show one caller the full row and a different caller only three columns of the same
row. The base `profiles` table's own RLS is plain self-only (`id = auth.uid()`); a separate
view, `profiles_public`, declared `with (security_invoker = false)` so it runs as the view
*owner* rather than the caller and therefore isn't blocked by the base table's self-only
policy, does the actual narrowing — its own `where` clause (self, or a shared `group_members`
row) is what enforces "co-members only," not a table policy. `auth.uid()` still correctly
reflects the real caller inside a `security_invoker = false` view since it reads a per-session
GUC, not anything tied to the view's ownership.

### `group_members` has no general INSERT policy — only the creator-becomes-owner exception
**Step 10 · 2026-07-29 · decision**

`03-data-model.md#joining-a-group`: "Rows only ever appear when someone accepts an invite …
Nobody is ever added to a group by someone else's action alone." A permissive INSERT policy for
owner/admin would violate that directly (an admin could insert a member row bypassing the
accept-invite gate). So `group_members` has **no** general INSERT policy at all — every regular
membership row is meant to come from an `accept_invite()`-style `SECURITY DEFINER` RPC, which
step 14 builds. The one necessary exception: a brand-new group needs *someone* to become its
first owner, and there's no invite to accept for that. `group_members_insert_owner` allows
exactly that one row — `role = 'owner' and user_id = auth.uid() and user_id =
group_created_by(group_id)` — tying it to being the group's own creator, enforced together with
the `one_owner_per_group` partial unique index. `group_members_update`/`_delete` are baseline
guards only (nobody can touch a row currently `role = 'owner'`, nobody can set `role = 'owner'`
via a plain update) — step 14's own exit criteria ("no path demotes or removes the owner") is
where this gets its real test coverage, once promotion/demotion RPCs exist to test against.

### Step 10 built all 17 tables, not just the 14 "live" ones — PLAN.md's step 11 is updated to match
**Step 10 · 2026-07-29 · decision**

`03-data-model.md` splits tables into "Live tables" (14, ending at `player_claims`) and
"Permanent tables" (`game_summaries`, `player_results`, `transfer_summaries`) as two separate
sections, and `PLAN.md` assigns the permanent three to step 11. But `03-data-model.md`'s own RLS
table covers all 17 in one list, and CLAUDE.md's non-negotiable is "RLS on every table, no
exceptions" — not "no exceptions, eventually." Rather than leave three tables without RLS until
step 11, all 17 were created and RLS-enabled here, with the permanent three getting exactly the
read policies `03-data-model.md#row-level-security` specifies and **no write policy for any
role** ("Nobody. Written only by `finalize_game()`" — which doesn't exist until step 11 and, per
the doc, runs as the table owner and bypasses RLS entirely regardless of what policies exist).
`PLAN.md`'s step 11 section is edited accordingly: it no longer lists creating these tables as
new work, since they already exist with RLS in place.

### `tsc --noEmit -p .` is not `npm run typecheck` — it silently misses real errors
**Step 9 · 2026-07-29 · trap · environment**

`package.json`'s `typecheck` script is `tsc -b` (project-references build mode — the root
`tsconfig.json` has `"files": []` and only `references`, delegating to `tsconfig.app.json`/
`tsconfig.node.json`). Running `npx tsc --noEmit -p .` instead — which looks equivalent and is the
natural ad hoc command to reach for — does **not** catch errors that `tsc -b` does. Concretely: it
missed `SettlementRoute.tsx` passing `TransferState[]` (fields `fromPlayerId`/`toPlayerId`) where
`computeReconciliation`/`computeSettlementProgress` require `Transfer[]` (fields `fromId`/`toId`) —
a real bug (every reconciliation row silently read "actually assigned" as 0, so the settlement
banner could never reach `הכל שויך ✓`) that sat undetected through several rounds of `tsc --noEmit
-p .` reporting clean, and was only caught by the Playwright e2e test actually exercising the
screen. Isolated confirmation: the same code, checked with `tsc -b --force` against a stripped-down
reproduction, reports the missing-properties error immediately.

**Always run the actual `npm run typecheck` (or `npm run verify`)**, never an ad hoc `tsc` 
invocation, and don't trust a clean ad hoc run as proof of type safety in this repo.

### A `BottomSheet`'s entrance animation makes a Playwright drag miss its target
**Step 9 · 2026-07-29 · trap**

`SlideToConfirm` inside `EndGameConfirmSheet` (a `BottomSheet`) uses real `onPointerDown`/
`onPointerMove` handlers with `setPointerCapture`. Driving it with Playwright — `slider.
boundingBox()` immediately after opening the sheet, then `page.mouse.down()`/`move()`/`up()` at
those coordinates — silently did nothing: no error, `dragging.current` never even flips (confirmed
by a temporary `console.log` in the handler), progress stays 0 forever. Root cause: `BottomSheet`
slides in over 260ms (`--animate-sheet-in`), and `boundingBox()` was called mid-animation — by the
time the real mouse-down event lands, the thumb has already moved to its final resting position, so
the click/drag starts on empty space (or whatever's now behind it) instead. Confirmed by adding
`page.waitForTimeout(400)` before measuring: the exact same drag code then works every time.

**Rule for any future e2e test that measures element geometry right after opening a sheet, a
snackbar, or anything else with an entrance transition:** wait for the animation to settle first —
a fixed wait comfortably longer than the token's duration is enough; Playwright's own
`locator.click()` handles this internally via its actionability checks, but raw `page.mouse`
sequences do not.

### The settlement graph needed a second non-player sentinel, so `transfer_edited` dropped `null`-for-pot
**Step 9 · 2026-07-29 · decision**

`transfer_edited`'s `fromPlayerId`/`toPlayerId` (step 4) were `string | null`, with `null` meaning
the pot — reasonable when the pot was the only non-player party anyone had modelled. Step 8 added a
second one, the house/unaccounted node, with no existing convention for representing it. Rather than
inventing a second special value (`null` for pot, something else for house), the payload's fields
became plain `string`, and `POT_ID`/`HOUSE_ID` (`core/settlement.ts`'s existing sentinel constants,
already structurally distinct from a real player id) are used for both. Nothing outside
`core/events.ts` depended on the old `null` convention yet (confirmed by grep before changing it),
so this was a clean, low-risk rename rather than a real migration.

### Step 3's token extraction missed gradients, glows and elevation shadows
**Step 8 (design audit) · 2026-07-29 · trap · decision**

The repository owner flagged that the built screens don't look as polished as the prototype.
Checked it directly rather than guessing: `tokens.css`'s flat colour/type/radii/spacing values
*are* genuinely lifted from the prototype's real inline styles (`#0E0C09`, `#E9A23C`, `#F4EFE7` all
match exactly) — but a grep of the whole `src/` tree turned up exactly one `gradient` (an SVG
sparkline fill) and zero `box-shadow` outside it, while the prototype uses `linear-gradient`s on
four different card treatments, a colour-matched glow on every "live" status dot, and an elevation
shadow on its toast. Step 3 extracted the palette and missed the surface treatment that gives that
palette its depth — a real gap, not a subjective "make it look nicer."

**Decision (owner):** don't retrofit the already-built screens (Home, NewGame, GamePage, their
sheets) to pick these up now — that's deferred, informally, rather than scheduled for step 17
specifically. The tokens themselves were added immediately (`--gradient-card-*`,
`--shadow-glow-positive`, `--shadow-elevation` in `tokens.css`, documented in
[`11 — Surface treatment`](../11-visual-design.md#surface-treatment)) so that **every screen built
or touched from here on reaches for them** instead of a flat `surface-*` fill where the prototype
uses one of these treatments. Check `11`'s new section before styling a card, an avatar, a status
dot, or an overlay.

**Also decided in the same conversation:** the ~20 states and the light theme
[`11` already recorded as missing](../11-visual-design.md#what-the-design-does-not-cover) are not
to be raised with the owner screen-by-screen as each one comes up. Extend the prototype's
established visual language yourself and let the owner review the result — recorded as a working
convention in `CLAUDE.md`.

### Draining the pot globally first can beat the DP optimum — a real counterexample, not a hunch
**Step 8 · 2026-07-29 · trap**

05-settlement.md's prose reads as a literal two-phase algorithm: "drain the pot first... before
the general algorithm runs, greedily match the pot against the largest creditors," and separately
claims "this never increases the transfer count." Implemented literally (repeatedly match the pot
against whichever creditor is currently largest *across the whole node set*, before running
exact-pair-cancellation/DP on what's left), it produces a concrete counterexample:

```
pot = −₪60, A = +₪50, B = +₪10, C = −₪30, D = +₪30      (all ×100 for minor units)
```

The true optimum is 3 transfers — partition into `{pot, A, B}` (sums to 0, needs 2 transfers) and
`{C, D}` (sums to 0, needs 1) — but draining the pot globally first pulls `D` (the largest
remaining creditor after `A`) into the pot's payments instead, which breaks the `{C, D}` pair and
forces a 4th transfer.

**Fix:** don't drain the pot as a separate pass. Run the DP partition (`core/settlement.ts`'s
`partitionIntoZeroSumGroups`) over *all* nodes uniformly, pot included, then apply "prefer the pot
as payer" only as a tie-break *inside* each group's greedy resolution — pick the pot as the active
debtor every round while it's still alive, before falling back to largest-magnitude. This is
provably safe: for a DP-irreducible (atomic) zero-sum group, greedy always produces exactly
`|group| − 1` transfers regardless of match order (proof sketch: any mid-greedy coincidental
double-zero would imply a smaller zero-sum subset existed in the group's original values, which
contradicts the DP having found the group atomic in the first place) — so reordering *within* a
group to prefer the pot can never cost an extra transfer, unlike reordering *across* groups before
they're even determined. `settlement.test.ts` keeps the counterexample above as a permanent
regression (`computeTransfers — fixed regressions`).

**The general lesson:** when a spec's prose describes an algorithm as two sequential passes, check
whether the second pass's optimality actually depends on the first pass not having run yet, before
implementing it that way.

### The house/unaccounted node's settlement balance is literally `unaccountedMinor`
**Step 8 · 2026-07-29 · decision**

05-settlement.md's safeguard section says "assign to the house — `unaccounted_minor` absorbs the
difference. It becomes a node in the settlement graph so the math closes" but never states the
node's balance formula. Derived it from the invariant the doc *does* state (`Σ balance(p) +
balance(pot) = 0` when chips balance): adding a house node with `balance(house) = unaccountedMinor`
makes the whole graph (players + pot + house) sum to exactly `−(rawDiscrepancy − unaccountedMinor)`
— which is zero precisely when the host has set `unaccountedMinor` to the full raw discrepancy,
i.e. exactly when `core/pot.ts`'s `computePotStatus` reports the banner as green. The two modules
agree on when "balanced" means balanced without importing each other — tested directly in
`settlement.test.ts` ("the house's balance is unaccountedMinor verbatim, and closes the graph").

### `TransferSummarySnapshot` carries ids, not the `from_name`/`to_name` text the DB schema wants
**Step 8 · 2026-07-29 · decision**

03-data-model.md's `transfer_summaries` table stores denormalised display text (`קופה` for the
pot) directly, not a foreign key — reasonable for a table that must still read correctly after the
live rows are purged. But resolving a party id to display text needs player names and i18next (for
the pot/house labels), neither of which `core/settlement.ts` may import under the Purity rule.
`buildGameSnapshot` therefore emits `Transfer`'s own `fromId`/`toId` (a real player id, or the
`POT_ID`/`HOUSE_ID` sentinel) and leaves the id→text resolution to whichever layer actually writes
the DB row — step 11, which has both the player list and the real i18n singleton available. Same
shape decision as `transfer_edited`'s existing `fromPlayerId`/`toPlayerId: string | null` payload
(step 4), just without collapsing the pot case to `null` here since a second sentinel (`HOUSE_ID`)
needed representing too.

### `fold()`'s tie-break is a random UUID compare — stamp a monotonic clock, don't rely on it
**Step 7 · 2026-07-29 · trap**

`fold()` sorts events by `clientCreatedAt`, falling back to `clientEventId` only when two events
tie. `clientEventId` is `crypto.randomUUID()` — a string compare against it has no relationship to
the order the events actually happened in. Millisecond-resolution `Date.now()` ties easily: a
`settlePlayer` immediately followed by `editSettledChips` (a sequence this step's settle-sheet reuse
makes completely ordinary) landed in the same millisecond in a real test run, and the random
tie-break applied `player_settled`'s payload *after* `chips_set`'s — silently reverting the edit.

Fixed at the call site, not in `fold()`: `core/offline/clock.ts`'s `nextTimestamp()` keeps a
module-level `lastMs` and returns `Math.max(Date.now(), lastMs + 1)`, guaranteeing every timestamp
this device stamps is strictly greater than the last. `core/offline/gameActions.ts` uses it for
every `clientCreatedAt`; `createUndoEvent` (`core/events.ts`) now takes an optional explicit
`clientCreatedAt` override so `undoEvent` can supply a monotonic one too, without `core/events.ts`
itself importing anything impure. **`fold()`'s comparator was deliberately left untouched** — it's
one of the two provably-correct modules, and the fix belongs at the (impure, device-local) source of
the timestamps, not in the (pure, deterministic) function that sorts them. Any new event-appending
call site should use `nextTimestamp()`, not bare `new Date().toISOString()`.

### `createUndoEvent`'s generic payload copy can't invert `shared_cost_removed`
**Step 7 · 2026-07-29 · trap**

`createUndoEvent` builds the inverse event by copying the *original* event's payload onto the
*inverse* type. That's safe when the inverse's payload is a subset of the original's — true for
every pair in `INVERSE_TYPES` except one: `shared_cost_removed`'s payload is `{ costId }` alone,
but its inverse (`shared_cost_added`) needs label/amount/payer/split/shares. Undoing a removal
through the generic path would append a `shared_cost_added` event missing all of that, and
`applyEvent` would throw on `Object.entries(undefined)`.

Not fixed generically (that needs `createUndoEvent` to accept an explicit inverse-payload override,
which nothing needed until now). Instead, `core/events.ts` exports `GENERICALLY_REVERSIBLE_TYPES` /
`isGenericallyReversible` — a *narrower* allow-list than `INVERSE_TYPES` — and every "offer undo"
UI (the audit log's long-press-equivalent) is gated on that, not on `INVERSE_TYPES` membership.
`isGenericallyReversible` also excludes every last-writer-wins "set" event (`cash_paid_set`,
`chips_set`, `nickname_set`, `player_renamed`, `unaccounted_set`, `shared_cost_updated`,
`transfer_edited`) for a different reason: none of those are in `INVERSE_TYPES` at all, so
`createUndoEvent` would fall back to re-emitting the *same* type with the *same* payload — a no-op,
not an undo.

### Component tests can't see interpolated i18next content — verified, not assumed
**Step 7 · 2026-07-29 · environment**

`useTranslation()` outside an initialised `i18next` instance (true of every existing component test
— nothing imports `src/i18n/index.ts`) makes `t(key, params)` return the bare `key` string, params
dropped entirely. This was already the working convention (`PlayerActionsSheet.test.tsx` asserts
`screen.getByText('players.rename')`, not real Hebrew) but this step is the first to depend on it
being *exactly* that — confirmed directly with a one-line probe rather than assumed, because two
modules here (`buyInText.ts`, `auditLogText.ts`) compose the actual spec-worded sentence and needed
real verification. Their tests import the real singleton — `import i18next from '@i18n/index'` —
and bind `i18next.t`, which loads the genuine Hebrew bundle and lets the test assert on real
sentences ("מור · קנייה 3 · +100 ז'יטונים · +₪50") instead of raw keys. Every other new component
test in this step follows the existing raw-key convention. **Rule of thumb:** if a module's whole
job is producing the *wording*, test it against the real `i18next` singleton; if a component just
renders `t()` calls, raw-key assertions are correct and sufficient.

### Hebrew currency formatting puts the symbol after the number
**Step 7 · 2026-07-29 · trap**

`Intl.NumberFormat('he', { style: 'currency', currency: 'ILS' }).format(50)` produces `‏50 ‏₪`
(RLM marks, symbol *after* the digits), not `₪50`. `formatMoney`'s own tests already only assert
substrings (`.toContain('50')`, separately `.toContain('−')`) for exactly this reason — a first
draft of this step's component tests asserted a combined `'−₪50'` and failed against the real
formatter. Assert the sign and the digits as separate substrings; never assume symbol-adjacent
placement for Hebrew.

### The pot banner's "still playing" semantics: a build-time reading, not a spec quote
**Step 7 · 2026-07-29 · decision**

05-settlement.md defines `discrepancy = totalBuyIns − totalChips` but every worked example in the
doc is settlement-time, where everyone has a counted chip stack. The banner is shown live, from the
moment the game starts, when most players haven't settled yet and the app has never observed their
chips (chips are only ever entered at `player_settled`/`chips_set`). Treating an unsettled player's
contribution to `totalChips` as *unknown* (and thus red) would paint the banner red for the entire
active phase of every game, which can't be the intent of a "compact and green" persistent banner.

`core/pot.ts` instead treats an unsettled player as neutral: their assumed chip value equals exactly
what they bought, so they contribute zero to the discrepancy either way. Only a *settled* player,
whose chips were actually counted, can push the banner red. This is a considered reading, tested
directly (`core/pot.test.ts` has a fixture with all-unsettled players asserting `isBalanced: true`),
not a literal spec quote — worth confirming against a real game (see PROGRESS.md's step 7 "Left
undone") since it's the one place this step made a call the spec didn't settle.

### Zustand, for real, for the first time
**Step 7 · 2026-07-29 · decision**

`02-architecture.md#frontend-stack` names Zustand for local game state from day one, but nothing
before this step needed cross-component, high-frequency-update state — `dexie-react-hooks`'
`useLiveQuery` covered everything through step 6. The buy-in counter's coalescing-undo window
(`features/game/buyInBatch.ts`) is the first genuine fit: it updates on every tap, is read by
sibling components (the snackbar, the batch bar) that don't share a DOM ancestor worth lifting state
into, and is exactly the "per-tap, frequently-updating" state `CLAUDE.md` says must never go in
Context. `create<BuyInBatchState>(...)` from a `createBuyInBatchStore()` factory (so tests get an
isolated instance with its own timer closure, and production uses one default export). Zero
production-audit impact.

### Hebrew grammar has no gender field to key off — audit log wording is deliberately neutral
**Step 7 · 2026-07-29 · decision**

`07-hebrew-glossary.md`'s own share-text example conjugates by gender ("נסגרה" for דנה, feminine,
vs. "נסגר" for אורי, masculine) — but no event or player-state field carries a gender, and adding
one just for string agreement is out of scope for a money-tracking app. `auditLogText.ts` sidesteps
this by phrasing every action as a gender-neutral noun phrase ("סגירה עם 120 ז'יטונים", "פתיחה
מחדש", "הצטרפות למשחק") rather than a conjugated verb — the same trick the spec's own buy-in
examples already use ("קנייה 3" is a noun, not "he bought"). Keep this pattern for any future
audit-log or activity-feed string; don't introduce a conjugated verb without a real gender field to
key it off.

### Hebrew pluralization needs `_two`, not just `_one`/`_other`
**Step 6 · 2026-07-29 · trap**

`Intl.PluralRules('he').select(n)` returns **three** categories that actually occur for integers:
`one` for 1, `two` for 2, `other` for everything else (0, 3, 4, … 100). i18next resolves a
pluralized `t(key, { count })` call by looking up `key_<category>`; if a key defines `_one` and
`_other` but not `_two`, then `count === 2` resolves to nothing and i18next prints the **raw key**
onto the screen. This is silent in code and in unit tests that don't render with a real i18next
instance — it only showed up when the step-6 flow was driven in an actual browser (`addPlayers
.commit` literally rendered instead of `הוסף 2 שחקנים`).

Fix: whenever a key is split into `_one`/`_other` for Hebrew, it needs `_two` as well (usually with
the same text as `_other` — "הוסף 2 שחקנים" is grammatically fine, Hebrew's "two" category is a
distinct plural *form*, not different wording, for most everyday sentences). `src/i18n/
pluralization.test.ts` now fails the build if a future `_one`/`_other` pair ships without a `_two`.
**A key that is never split at all (no `_one`/`_other`/`_two` suffix) is always safe regardless of
count** — i18next only attempts plural resolution when at least one suffixed variant exists for
that base — so the simplest fix for a string that doesn't need real singular/plural wording is to
not split it, per the existing `gallery.playerCountLabel` precedent.

### Local actor id stands in for a real account until step 12
**Step 6 · 2026-07-29 · decision**

Every event needs a non-null `actorId`, and every game needs a `hostId`, but there are no accounts
until step 12. `core/offline/localIdentity.ts` mints a random UUID once per device, persists it in
a new `meta` Dexie table (IndexedDB, not `localStorage` — consistent with the session-storage
preference in `CLAUDE.md`, though this id carries no privilege of its own so the choice is
consistency, not defence), and `createGame` stamps it as both the actor on every event and, via a
`host_changed` event fired at creation, the game's host. This is a build-time engineering decision,
not a product one — nothing user-facing depends on this id's shape, and step 12 replaces it with a
real profile id behind the same seam (`gameActions.ts`) without touching anything above it.

### Fake timers hang fake-indexeddb
**Step 6 · 2026-07-29 · trap**

`vi.useFakeTimers()` combined with a Dexie call against `fake-indexeddb` hangs — the fake
IndexedDB's internal scheduling apparently depends on real timers/microtasks that fake timers
intercept, and once one test times out without reaching `vi.useRealTimers()`, every subsequent
test's `beforeEach` (which itself touches Dexie) hangs too, cascading a single failure into the
whole file. Hit this trying to control `lastPlayedAt` ordering in `recentPlayers.test.ts`. Fix:
never use fake timers in a test that touches `db.*` — seed explicit timestamps directly via
`bulkPut`/`put` instead of manipulating the system clock.

### The core/ purity lint rule was scoped too wide
**Step 5 · 2026-07-29 · trap**

Step 1's `no-restricted-imports` rule banning React/Supabase/Dexie/UI imports was written against
`src/core/**/*.ts` — everything under `core/`. But `CLAUDE.md`'s actual Purity rule names exactly
two files, `core/settlement.ts` and `core/events.ts`, and `02-architecture.md`'s repository layout
explicitly places the Dexie outbox at `core/offline/`. The wide glob would have made it impossible
to build step 5 inside `core/offline/` at all — it errored on the first `import Dexie` there.

Fixed by narrowing the glob to `src/core/*.ts` (direct children of `core/` only), which still
covers `money.ts`, `settlement.ts` and `events.ts` but excludes any subdirectory. **If a future
step adds another file directly under `core/` that legitimately needs Dexie/React (unlikely, but
possible for a shared type), put it in a subfolder — the direct-children glob is what keeps the two
provably-pure files enforced without also trapping `core/offline/`.**

### fake-indexeddb and dexie-react-hooks added
**Step 5 · 2026-07-29 · environment**

`fake-indexeddb/auto` is imported at the top of `src/test/setup.ts` so Dexie has a real IndexedDB
under Vitest/jsdom (jsdom itself doesn't implement one). `dexie-react-hooks`'s `useLiveQuery` drives
`useSyncState` — no Zustand yet; game/UI state that genuinely needs it arrives with step 6's
screens, per `02-architecture.md#frontend-stack`. Both landed with zero production-audit impact
(`npm audit --omit=dev --audit-level=high` stayed clean).

### `Event.returnValue` is a boolean mirror of `defaultPrevented`, not a settable string
**Step 5 · 2026-07-29 · trap**

The historical `event.returnValue = ''` idiom used by `useBeforeUnloadGuard` still works — assigning
any falsy value sets the cancelled flag — but per the modern spec (and jsdom, correctly) the
*getter* always returns a boolean reflecting `defaultPrevented`, never the string you assigned. A
test asserting `event.returnValue === ''` will fail against a correct implementation; assert
`defaultPrevented`/`returnValue === false` instead.

### Light-theme accent colour is below AA for body text
**Step 3 · 2026-07-28 · trap**

The light-theme accent (`#9a6812`) on surface-app (`#f5f2ee`) is 4.31:1 — below the 4.5:1 WCAG AA
threshold for normal text. On surface-card (`#edeae4`) it drops to 4.01:1. Dark theme passes
comfortably (8.69:1 and 8.06:1 respectively).

This is the design-specified token from `docs/11`. The accent in light theme is used primarily at
heading size (AA-large is 3:1, which it clears) or as button fill (where on-accent text on accent
background passes at 8.4:1). Body-size accent text on these backgrounds should be avoided in light
theme, or the token should be darkened — but that is a design decision, not a code fix.

### Test files need eslint-disable for literal props
**Step 3 · 2026-07-28 · trap**

The `local/no-literal-jsx-text` rule correctly flags literal strings in `title`, `label`, and
similar props — but in test files these are test data, not user-facing text. The fix is a file-level
`/* eslint-disable local/no-literal-jsx-text */` after the imports. This is not a hole in the rule;
it's working as designed. The rule's job is to catch literals in production components, and the
disable comment is the right opt-out for tests.

### The pseudo-locale hijacked every English device
**Step 1 · 2026-07-28 · trap**

Registering `en-XA` in `supportedLngs` alongside `i18next-browser-languagedetector` meant that a
phone reporting `en-US` booted **into the pseudo-locale** — pseudo-translated Hebrew, in LTR, as the
real UI. i18next's `getBestMatchFromCodes` falls back from `en-US` to `en`, finds no exact match,
and then accepts any supported tag sharing the language part. `en-XA` shares it.

The e2e smoke test caught it on the first run, which is the argument for having written it.

Fix: **the language detector is gone**. With exactly one shipping language there is nothing to
detect, so the locale is resolved explicitly — `?lang=` or a value this app itself stored, dev-only
— and the pseudo bundle is excluded from production builds entirely (verified: `en-XA` does not
appear in `dist/`). Real detection comes back when a second real language ships, and whoever adds it
must not re-introduce this: **never put a pseudo or partial locale in `supportedLngs` next to a
detector.**

### eslint-plugin-i18next silently ignores arrow components
**Step 1 · 2026-07-28 · trap**

`i18next/no-literal-string` reports JSX returned from a function *declaration* and says nothing
about `export const Page = () => <p>שלום</p>`. Half of any React codebase is arrow components, so
the rule would have looked enforced while enforcing nothing — the worst failure mode for a guard.

Fix: a local rule, `local/no-literal-jsx-text`, covering every component shape plus the attributes
users actually read (`alt`, `title`, `placeholder`, `aria-label`…), with `<Trans>` children exempt.
The plugin stays as a second net. `src/test/lint-rules.test.ts` asserts the arrow case specifically.

**The general lesson, worth applying to every rule added later:** a lint rule is not enforced until
a test proves it fires. Both local rules had holes that only surfaced under test — the Tailwind rule
also missed `clsx('flex', cond && 'pr-3')`, because a `CallExpression > Literal` selector only sees
direct children and the class was nested inside a `LogicalExpression`.

### react-router: use `react-router`, not `react-router-dom`
**Step 1 · 2026-07-28 · environment**

`react-router-dom` tops out at 7.18.1 and every 7.x from 7.12.0 carries an unpatched high advisory
(RSC-mode CSRF). The patched line is `react-router` **8.3.0** — v8 folded the `-dom` package in and
stopped publishing it.

Note the trap: `npm audit fix` proposes downgrading to 7.11.0, which made things **worse** — it
re-opened several advisories fixed in 7.18.0. Always read the version ranges rather than trusting
the suggested fix. Result: `react-router@8` and a clean production audit.

### TypeScript is pinned to 5.9.3 on purpose
**Step 1 · 2026-07-28 · environment**

TypeScript's latest is 7.0.2, but `typescript-eslint@8.65.0` declares `typescript >=4.8.4 <6.1.0`,
so TS 6 and 7 have no type-aware linting yet. Lint enforcement is load-bearing here, so TypeScript
is pinned exactly (`"typescript": "5.9.3"`, no caret) rather than floating. Revisit when
typescript-eslint ships TS 7 support; do not bump it casually.

### CI audits production dependencies, not the dev tree
**Step 1 · 2026-07-28 · decision**

`vite-plugin-pwa@1.3.0` (latest) pulls `workbox-build`, which drags in 8 packages with high
advisories — `ejs`, `jake`, `brace-expansion`, `minimatch` and friends. There is no upgrade: the
plugin is already current. All 8 are **build-time only** and absent from the production tree
(verified with `npm ls --omit=dev`).

So `npm run verify` gates on `npm audit --omit=dev --audit-level=high`, which must stay clean. Dev
advisories are visible in a plain `npm audit` but do not fail the build — a gate nobody can pass
gets disabled, and then nothing is gated. Re-check when vite-plugin-pwa updates workbox.

### Smaller environment facts
**Step 1 · 2026-07-28 · environment**

- **stylelint autofix strips `-webkit-text-size-adjust`**, which iOS Safari — a primary target —
  still needs. `property-no-vendor-prefix` is off for that reason; don't turn it back on.
- **Playwright**: the sandbox ships Chromium build 1194 while `@playwright/test@1.62` wants 1234,
  and downloading is not an option here. `playwright.config.ts` points at `/opt/pw-browsers/chromium`
  when it exists and otherwise lets Playwright resolve its own, so CI is unaffected.
- **Tailwind v4's `@theme` gives both halves for free**: each token becomes a utility *and* a CSS
  custom property, which is exactly the "one definition, two consumers" that `CLAUDE.md` asks for.
  No separate mirror file is needed.
- **The CSP is injected at build only.** Vite's dev server needs inline scripts for HMR, so a policy
  loose enough for dev would be a policy nobody tested. Dev has no CSP; the built output has the
  strict one, and the e2e test asserts the real build raises no violations.

### Session persists across reloads; XSS gets the whole security budget
**Step 0 · 2026-07-28 · decision**

Settled by the owner, closing the open question this file previously carried. Signing the host out
mid-game because they backgrounded the app is unacceptable, so **the session persists** — IndexedDB
preferred over `localStorage`, though that preference is a marginal gain and not a defence, since
both are readable by any script on the origin. The airtight option (httpOnly cookies) needs a
server, and we deliberately don't have one.

**The consequence is the important half:** if a script runs on our origin it takes the session, so
XSS is *the* security problem in this app and the effort goes there rather than into storage
theatre. That made the CSP a real step-1 deliverable rather than a nice-to-have — a
`<meta http-equiv>` tag, because GitHub Pages can't set headers, with `script-src 'self'` and no
`unsafe-inline`/`unsafe-eval`. Two earlier decisions are what make a policy that strict actually
hold: self-hosted fonts (no Google Fonts request) and no inline styles. The full rule set is in
`CLAUDE.md` under Security.

### Tailwind first, SCSS module as the fallback
**Step 0 · 2026-07-28 · decision · supersedes an earlier reversal**

Doc 02 always specified Tailwind. A preference for SCSS modules briefly replaced it, then the owner
restored Tailwind as the default with SCSS modules as the fallback — reach for a module when
Tailwind can't express something (keyframes, complex selectors, vendor pseudo-elements) or when the
component needs real CSS work anyway. Docs 02 and 09 are back to their original wording; this entry
exists so the round trip doesn't look like drift.

The lasting consequence is that **the RTL guard now needs both halves**: an ESLint rule over
physical Tailwind utilities (`ml-`, `mr-`, `left-`…) *and* a stylelint rule over physical CSS
properties in whatever SCSS exists. Enforcing only one leaves the other side unguarded. A third
rule bans the `style` prop, which the CSP also depends on.

### Four collisions between the prototype and the spec — spec wins in all four
**Step 0 · 2026-07-28 · trap**

The design landed and `docs/11-visual-design.md` was extracted from it. Four places where building
the prototype faithfully would break a spec'd rule, listed here because they are easy to reproduce
by accident and all four are invisible in a screenshot:

1. The `−` on the buy counter is **44×44px**; the floor is 48px. Grow it and grow `+` alongside it —
   the asymmetry is meant to be relative weight, not an undersized decrement.
2. Rubik is loaded from **Google Fonts**; `02` requires a self-hosted subset.
3. The prototype is one file of inline styles with hardcoded Hebrew. Lifting its markup would
   bypass `i18next`, `<Money>` and the event model at once.
4. Physical CSS (`left`/`right`) throughout — fine in a permanently-RTL mock, fatal under the
   pseudo-locale.

None of the four changes how anything looks, which is why the resolution is always "adapt the
design", never "revisit the spec". Full detail in
[`../11-visual-design.md`](../11-visual-design.md#collisions-with-the-spec).

Also worth knowing: the prototype already gets two things right that are easy to lose —
`font-variant-numeric:tabular-nums` on every numeral, and `direction:ltr; unicode-bidi:isolate` on
money. That is the `<Money>` rule, already proven in situ.

### The mockup decides appearance; the spec decides behaviour
**Step 0 · 2026-07-28 · decision**

The poker tracker design from Claude Design is the chosen visual direction, and its assets belong
in `docs/design/` with `docs/11-visual-design.md` written from them. `docs/10-design-brief.md`
stays as the brief that asked for it — it leaves the palette and typeface explicitly open, which is
exactly the hole the design fills, and step 3 could not otherwise start from anything firmer than
"deep amber or teal".

The rule that matters, because a future session will otherwise faithfully reproduce a mockup and
break a spec'd rule doing it: **the design is authoritative for colour, type, spacing, density,
iconography and motion; `docs/01`–`docs/09` are authoritative for what a control does, where it
lives, what it's called, and which states exist.** The predictable collisions — dropdowns vs bottom
sheets, a floating action button vs the bottom action bar, colour-only win/loss, and any label that
drifts from the glossary in `07` — are enumerated in `docs/design/README.md`. A mockup is also
silent on ~40 of the states `10` requires; silence there is a gap to fill in the design's language,
never a decision that the state isn't needed.

### `/design-sync` runs the other way, and not from here
**Step 0 · 2026-07-28 · environment**

`/design-sync` uploads an existing compiled component library *to* Claude Design so its agent
builds with real components. It does not pull a design *from* Claude Design into a repo, and this
repo has no components to upload until step 3. Separately, `DesignSync` cannot authorise in a web
session — it wants an interactive terminal — so design assets arrive either through Claude Design's
"Send to Claude Code Web", which seeds them into the workspace, or by being exported and committed
by hand. Worth re-reading after step 3, when syncing the real components up becomes genuinely
useful.

### Sequencing: the offline app before the database
**Step 0 · 2026-07-28 · decision**

`09-roadmap.md` puts the Supabase project and first migration in M0 and cloud sync in M3. This
plan instead builds the entire offline app (steps 1–9) before touching Postgres (steps 10–11).

Why: the schema's shape is dictated by the event model, and the event model is the thing most
likely to be adjusted once real screens are built against it. Writing migrations first means
rewriting them; writing them after step 9 means writing them once, from a design that has already
survived a real game night. The one thing that genuinely cannot wait — the keep-alive cron, which
`02-architecture.md` warns must not be discovered the night of a game — is still explicitly part
of step 10, and step 10 comes long before any game depends on the network.

The dependency this creates is recorded in both directions: `core/events.ts` (step 4) fixes the
event-type union, and step 10's Postgres enum must match it character for character. Step 10's
exit criteria include a test that reads both and asserts they agree, so the two cannot drift.

### Two rules to read before building anything
**Step 0 · 2026-07-28 · decision**

From `README.md`, restated because everything else keys off them and a session that gets these
wrong will build the wrong thing several steps deep:

- **Into a group:** an owner or admin invites you by exact username, and *you* accept. There is no
  invite link and no other path.
- **Into a game:** either the host's share link, or — if you're already in the group — you ask and
  the host approves. Both paths end in host approval. Adding someone to a game never adds them to
  the group.

---

### Zod v4 discriminatedUnion type assertion
**Step 4 · 2026-07-28 · trap**

`z.discriminatedUnion` in zod v4 expects a tuple type `[ZodObject, ZodObject, ...ZodObject[]]`
built from its internal `$ZodLooseShape` type. When the variants are built dynamically via
`.map()`, TypeScript cannot prove the tuple shape, so a `as unknown as [...]` cast is needed. This
is purely a type-level issue — the runtime works correctly. The cast references
`z.core.$ZodLooseShape`, which is a stable public API surface in zod 4.x.

### Event count: spec says 30, reality is 31
**Step 4 · 2026-07-28 · decision**

`03-data-model.md` says "~30 event types" but the actual table lists 31 distinct types (the `note`
event is present in the table but may have been excluded from the count). The `EVENT_TYPES` array
is the single source of truth; the spec's "~30" is treated as approximate. All 31 types are
implemented and tested.
