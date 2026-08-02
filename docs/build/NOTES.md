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

### `db.games` only indexes `updatedAt` — "most recently created" needs an in-memory sort, not `orderBy`
**Step 17 · 2026-08-02 · trap-shaped decision**

`core/offline/db.ts`'s `games` store is `'id, updatedAt'` — no `createdAt` index — and
`appendEvent`'s recency bump (step 6) touches `updatedAt` on *every* event a game gets, not just at
creation. So "the game I started most recently" and "the game I most recently did anything to" are
genuinely different queries, and only the second one is indexed. Hit this building `שכפל משחק אחרון`
(step 17): a naive `db.games.orderBy('updatedAt').last()` would have picked whichever game the host
happened to poke last — including reopening an old one to fix a typo — not the last game actually
played. `getMostRecentGameSetup()` (`core/offline/gameActions.ts`) instead reads the whole table
(`db.games.toArray()`) and sorts by `createdAt` in memory. Fine at this scale — the table is one
user's own local games, never more than a few hundred — but don't reach for
`db.games.orderBy('createdAt')` anywhere; it isn't indexed and Dexie's `orderBy` silently degrades
to a full scan without one, so the *type* looks fine while the query stops meaning what it says.
Proven with a dedicated test (`gameActions.test.ts`) that creates an older game, touches it after a
newer game exists, and asserts the pick still follows `createdAt`.

### `קח ניהול` gets no dedicated ⓘ — the take-over confirm sheet already shows the consequence unconditionally
**Step 17 · 2026-08-02 · decision**

`04-ux-spec.md`'s ⓘ table lists `קח ניהול` among the ten controls needing an explainer, but
`HostControlSheets.tsx#TakeOverHostConfirm` (built in step 13) already renders the exact
consequence — "the current host loses control immediately, and their unsynced changes can be lost
if their phone never reconnects" — as plain, always-visible text in the confirm sheet, not behind
any tap. `04-ux-spec.md#the-invitees-side`'s own pending-invite card sets the precedent for
preferring this: "the consequence line is not optional and not hidden behind the ⓘ — the popover
expands on it, but the card itself says the thing that matters." Adding a redundant ⓘ next to the
`⋯` menu's `קח ניהול` button, on top of a sheet that says the same thing unconditionally one tap
later, would be exactly what `04`'s own ⓘ rules warn against ("never a patch for a label that
should have been clearer", "muted, not decorative" — worth reading literally: a ⓘ whose content the
very next screen already shows without a tap is decoration, not information). Treated as already
satisfied by a stronger mechanism, not skipped — don't add one here without revisiting this
reasoning first.

### `wa.me` payment shortcuts need a real privacy decision before they can be built, not just code
**Step 17 · 2026-08-02 · decision**

`05-settlement.md#payment-links--reality-check-23` wants a `wa.me` link built from *the other
player's* phone number. `profiles.phone` already exists as a column
(`supabase/migrations/20260729120100_profiles.sql`) but is self-only under the current RLS — by
design, per the same migration's own comment, mirroring step 10's `NOTES.md` entry on why
`profiles_public` only ever widens username/display_name/avatar_url. Making `wa.me` links work for
real means widening visibility of a phone number to co-players, which is a materially different
kind of exposure than a username or a stats-visibility flag (step 15's precedent) — a group member
could then look up another member's real phone number through the app, not just their poker
results. That is a call worth the repository owner making explicitly, not one to default into via
a migration written to unblock a checklist item. Nothing was built this session beyond confirming
the gap: there is no phone-number field anywhere in the UI yet either (checked — `AccountPage` has
no such field), so this is a three-part feature (profile UI + a deliberate RLS widening + the
settlement-screen link itself), not a small addition. Copy-to-clipboard, the other half of the same
`Build` bullet, was already done in step 9 (`TransferRow`'s tap-to-copy) and needed nothing further.

### `game_ended`'s push never called `finalize_game()` — every signed-in host's game was missing its permanent snapshot
**Step 16 · 2026-08-02 · trap**

`src/data/supabaseSyncTransport.ts`'s `game_ended` case (written in steps 12/13) only ever updated
`games.status`/`ended_at`/`claim_deadline`/`reopen_deadline` directly. `finalize_game()` — the
`SECURITY DEFINER` function that's the *only* way `game_summaries`/`player_results`/
`transfer_summaries` ever get a row — was called from exactly one place in the whole client:
`localGameMigration.ts`'s one-time "upload a pre-sign-in local game" path. That means every game
played signed-in from the start, ended the normal way, silently never got a permanent snapshot at
all — no error, nothing in any log, just an absent row forever. Every one of step 15's statistics
queries reads *only* from those three tables, so this would have made group/personal statistics
permanently empty for real usage, and would have made every real game permanently unpurgeable
(`purge_expired_game_data()` refuses to touch a game with no snapshot, by design). Found while
building step 16's delete/export/purge-adjacent work, which is exactly the point where "does a
normal game actually get a permanent snapshot" stops being an abstract question.

**Fixed** by calling `client.rpc('finalize_game', { p_game_id })` right after the `games` update in
the same `game_ended` case. Safe for two reasons: the server-side `AFTER INSERT` trigger has
already applied every event earlier in the same push's batch by the time this line runs (game_ended
is processed after the bulk `game_events` upsert, not concurrently with it), and `finalize_game`
itself is idempotent (deletes then rewrites its own three tables), so a retried push after a
partial failure can never double-write or go stale. **`localGameMigration.ts`'s own explicit
`finalize_game` call for an already-finished game is *not* now dead code** — a second migration run
(a re-sign-in) finds an empty outbox, so the `game_ended` case never fires again on that run, and
the explicit call is the only thing that still finalizes it. `localGameMigration.test.ts`'s
assertion was updated to expect two calls, not one, with a comment explaining why — don't "fix" it
back down to one.

**Rule for any future change near this push path:** don't assume a lifecycle event's server-side
effect is "just the direct table write you can see in the `switch` case" — check whether a
permanent-table RPC needs to ride along too, the way `game_ended` now does.

### Deleting a game needed no new RPC — the existing RLS-gated `delete from games` was already the right mechanism
**Step 16 · 2026-08-02 · decision**

Tempting to add a `delete_game()` RPC to match the shape of every other host action
(`take_over_host`, `hand_over_host`, `decide_join_request`, …). Not needed: `games_delete`'s RLS
(`host_id = auth.uid()`) already scopes a plain `client.from('games').delete().eq('id', gameId)`
correctly — a non-host caller's delete simply matches zero rows rather than erroring (the same
"no path, not an error" shape `group_members_delete` already relies on), and every tier-2/3 table
already cascades from `games` (`on delete cascade`, present since `20260729120500_game_events.sql`).
The permanent tier-1 snapshot survives automatically because `game_summaries` was deliberately given
no foreign key back to `games` at all (`20260729120900_permanent_tables.sql`'s own comment: "the
games row may no longer exist once purged"). A pre-existing step-11 SQL test
(`purgeExpiredGameData.test.ts`'s "leaves statistics byte-identical after an explicit deletion of a
finished game") already exercised this exact mechanism before step 16 built any client-facing
delete feature — this step's `src/data/gameDeletion.ts#deleteGame` is a thin client wrapper around
an already-proven, already-simplest path, not a new one. **Don't add a delete RPC "for symmetry"
later** unless a real requirement (an audit log entry for deletions, say) actually needs
server-side logic beyond a plain delete.

### `profiles_public` needs `security_invoker = false` on purpose — don't "fix" it the way `group_player_results` was fixed
**Step 15 · 2026-08-02 · decision**

Step 11's own entry below (`A new view defaults to bypassing the querying user's RLS —
group_player_results shipped that way`) fixed a real security gap by setting
`security_invoker = true` on that view. `profiles_public` looks like the same shape — a view over
an RLS-protected table — and it is tempting to "fix" it the same way. Don't: it is `false` on
purpose, and its own comment has said so since step 10. `profiles_select_self`'s RLS is
`id = auth.uid()` only; a co-member lookup (which is this view's entire reason to exist) needs to
see rows that policy would otherwise hide, so the view runs as its owner and enforces "self or
co-member" itself, in its own `where` clause. Setting `security_invoker = true` here wouldn't close
a gap — it would break every existing co-member lookup (the share sheet's viewer list, the group
member list, and now the statistics leaderboard's `stats_visibility` check), since the view would
start deferring to `profiles_select_self` and return nothing for anyone but the caller themselves.
`get_advisors(type: 'security')` will keep flagging this view as a `security_definer_view` forever;
that specific flag on this specific view is expected, not a regression to chase.

### The `06-statistics.md` spec is silent on two things a real implementation needs a number for — the sample-size denominator, and "biggest night"
**Step 15 · 2026-08-02 · decision**

Two judgment calls made while building `core/statistics.ts`, both documented in `PROGRESS.md`'s
step-15 entry too, recorded here because they're the kind of thing a future session could silently
contradict without realizing it was already decided:

1. **A rate's displayed sample size is always the total games underlying that population, not the
   rate's own post-exclusion denominator.** `06-statistics.md`'s one example (`62% (13 משחקים)`)
   doesn't say whether 13 is "games played" or "wins + losses after zero-exclusion" — the doc's own
   worked win-rate example uses 6 games with no ties, where the two numbers happen to coincide, so
   it never actually disambiguates. Every rate in this codebase (`Rate.sampleSize` in
   `core/statistics.ts`) now uses the former uniformly.
2. **"Biggest night" (06's own per-table stat) is keyed on `game_summaries.total_cash_pot_minor` —
   physical cash handed to the table (05-settlement.md#the-pot-as-a-settlement-node) — not
   `total_buy_ins_minor`.** The column is literally named for the pot, and 06 groups "average pot
   per game, biggest night" under one heading, which reads as one pot-denominated figure rather
   than two different money quantities sharing a table cell.

### `renderPlayerName` needs its resolver argument at every call site, or a registered player's name renders blank
**Step 14 · 2026-08-01 · trap**

`core/players.ts#renderPlayerName(player, getAccountDisplayName?)` has taken an optional resolver
for a registered player's account name since step 4 — optional because nothing had accounts yet.
Steps 12/13 gave `game_players.user_id` real values (a claim, an approved join request), but no
screen ever supplied the resolver: `LiveGameView`, `SettlementRoute` and `SummaryRoute` all called
`renderPlayerName(p)` bare, so any account-linked player rendered with an empty name. Silent and
untested, because component tests never run with `session.cloudConfigured: true` (this sandbox
can't reach a real Supabase project — see below), and no session had manually tested a real
signed-in claim/join-approval end to end either. Found while wiring step 14's group-member
add-players picks, which make this path the *normal* one, not an edge case.

**Fixed uniformly, not per-screen:** `src/hooks/useAccountNames.ts` resolves every player-with-a-
`userId` (not just viewers, which is all `LiveGameView` used to resolve) via `profiles_public`, and
all three screens now pass `(userId) => accountNames.get(userId)`. **Rule for any future screen
that renders a player row:** always pass a resolver. There's no lint rule catching a bare call —
only convention, and this bug is exactly what skipping it costs.

### `insert ... returning` on a table whose own SELECT policy requires membership that doesn't exist yet
**Step 14 · 2026-08-01 · trap (recurrence)**

The exact `games`/`RETURNING` trap documented below under "Postgres RLS + RETURNING can miss a row
this same statement just inserted" recurs for `groups`: `groups_select` is `is_group_member(id)`,
false for a brand-new group until its *own* `group_members` owner row exists, which is a second,
later insert. `insert into groups (...) returning id` therefore fails RLS even though `groups_insert`
itself (`created_by = auth.uid()`) is satisfied — confirmed directly in `supabase/tests/groups.test.ts`
before fixing it. **Fix, matching `ensureGameRowExists`'s existing pattern:** generate the id
client-side (`crypto.randomUUID()` in `src/data/groups.ts#createGroup`, `randomUUID()` in the SQL
test) and insert without `RETURNING` at all, rather than trying to work around the policy. Rule of
thumb restated for a third table now: any table whose own SELECT policy depends on a row this same
transaction hasn't written yet should never rely on `RETURNING` for its own insert.

### A genuinely multi-row `.rpc(...)` result can't chain `.returns<T[]>()` without a `Database` generic
**Step 14 · 2026-08-01 · trap**

Every existing RPC wrapper in `src/data/` calls a function that returns at most one row and chains
`.single().returns<T>()`. `find_user_by_username` and `get_group_live_games` are the first
table-returning (potentially multi-row) RPCs a client wrapper calls. `.rpc(...).returns<T[]>()`
without `.single()` fails to compile — a real supabase-js type error ("Cannot cast single object to
array type") — because this codebase has no `Database` generic in scope (a deliberate choice, not
an oversight), so the builder can't confirm the function returns a set. Destructuring
`const { data, error } = await client.rpc(...)` without any `.returns()` also fails, differently:
`@typescript-eslint/no-unsafe-assignment` on an implicit `any`. **Fix:** cast the *whole* awaited
response in one expression — `const result = (await client.rpc(...)) as { data: T[] | null; error:
Error | null }` — then read `result.data`/`result.error`. See `src/data/groups.ts#findUserByUsername`
for the pattern; use it for any future multi-row RPC wrapper instead of reaching for `.returns()`.

### `group_members_delete`'s RLS matches zero rows instead of raising for a blocked delete
**Step 14 · 2026-08-01 · trap**

`group_members_delete`'s `using` clause is `role <> 'owner' and (is_group_admin_or_owner(group_id)
or user_id = auth.uid())` — for a target row whose `role = 'owner'`, that's `false`, so Postgres
RLS simply excludes the row from the delete's own row set. The statement still succeeds, deleting
zero rows, rather than raising. A test written as `expectRejection(client, () => client.query(
'delete from group_members ...'))` fails with "the query unexpectedly succeeded" — not a bug in
the policy, a wrong assertion shape. **Fix:** assert `result.rowCount === 0` and that the row is
unchanged afterward, not a thrown error. This is the general RLS-on-UPDATE/DELETE shape, not
specific to this table — any future "no path can touch X" test needs the same assertion style
unless the write goes through a `raise exception`-based RPC instead of a plain policy-gated
statement.

### `VITE_*` secrets on the same CI step that runs the test suite let a test reach the real network
**Step 12 (CI, post-merge) · 2026-07-31 · trap**

Wiring `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` into `deploy.yml`'s `npm run verify` step (so
the deployed build embeds real Supabase config) broke CI: `npm run verify` runs `vitest run` as
part of the same `run-s` chain, and Vitest — built on Vite — populates `import.meta.env` straight
from `process.env` at the `VITE_` prefix exactly like a real build does. So the *test* process saw
the real project's URL and anon key too, `src/data/supabaseClient.ts`'s `supabase` singleton
constructed a real `SupabaseClient` instead of staying `null`, and two tests that specifically
assert the *unconfigured* behaviour (`auth.test.ts`'s `isCloudConfigured` and `signInWithGoogle`
"throws when no client is configured", both relying on the real singleton being `null` in a plain
dev/CI environment) instead exercised the real client: `signInWithGoogle`'s default parameter
resolved to the actual project, called `signInWithOAuth` against it for real, and the run crashed
with an unrelated-looking `TypeError` from a stray WebSocket event deep in `undici` — Node's fetch
implementation reacting to a real network response from Supabase's Auth/Realtime endpoint that
nothing in the test was expecting to talk to. Reproduced locally in one command:
`VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... npx vitest run src/data/auth.test.ts` fails
identically outside CI too — this was never CI-specific, just never exercised locally with real
values set.

**The fix is structural, not patching the two assertions:** `deploy.yml`'s `npm run verify` step no
longer carries the secrets at all — the whole point of `verify` is to prove the app builds and
tests pass in a hermetic environment, and that already includes proving the *unconfigured* build
works (which it does, matching every local run in this sandbox). A **separate** step,
`Production build with real Supabase config` (`npm run build` again, gated `if: github.ref ==
'refs/heads/main'`), runs only right before `upload-pages-artifact`, so the secrets exist for
exactly one build invocation and are never visible to `vitest`, `eslint`, or anything else in the
chain. Verified both directions locally: `vitest run` with the vars set reproduces the crash;
`npm run build` alone with the vars set correctly embeds the real origin into the CSP
(`connect-src ... axsftugpsysoxersudwr.supabase.co wss://...`) with nothing else in the pipeline
touching them.

**Rule for any future secret wired into a CI step that also runs tests:** check what *else* runs
in that same step or script chain (`run-s`/`npm-run-all`/`&&` all count) before assuming a secret
scoped to "the build" stays scoped to the build — a test runner built on the same tool the app uses
(Vite/Vitest, but this generalises to anything reading `process.env` ambiently) will see it too. A
test that exercises "the unconfigured/no-credentials path" is exactly the one a stray real secret
breaks, and it can break by actually reaching the network, not just failing an assertion.

### A cancellation flag captured across an `await` narrows to "always" its initial value — use a ref, and expect one more narrowing surprise even then
**Step 12 · 2026-07-31 · trap**

`useSession`'s effect needed the standard React "ignore this async result if the effect already
cleaned up" guard — an `isMounted`/`cancelled`-style flag, set `true` in the effect's cleanup and
checked before every `setState` after an `await`. The obvious `let cancelled = false;` inside the
effect, mutated only in the returned cleanup closure, made **both** `if (cancelled) return;` and
`if (!cancelled) setLoading(false)` report `@typescript-eslint/no-unnecessary-condition` — "always
falsy" / "always truthy" respectively. Not a false alarm about the variable's *declared* type, but
a real artifact of how TypeScript's control-flow narrowing treats a captured `let`: from inside
*this* closure, the only assignment to `cancelled` anywhere in its static analysis is the
initialiser, since the mutation lives in a sibling closure (the cleanup function) this one never
calls — so it narrows `cancelled` to the literal `false` for every read inside this function, dead
branch included, even though the variable is mutated for real by React on unmount.

**Switching the flag to a plain mutable object (`const cancelledRef = { current: false };`, not
even `useRef` — no reactivity needed) fixed the first two checks**, since property-access narrowing
on `.current` isn't captured by the same literal-narrowing pass. But a *third* check, later in the
same closure and **after an `await`** (`if (cancelledRef.current) return;` following
`await syncProfile(...)`), still got flagged — TypeScript's aliased-condition analysis tracked that
nothing textually reachable from this function's own call graph (the awaited `syncProfile`, which
never touches `cancelledRef`) assigns to it, and again narrowed across the await. This one is a
genuine, well-known gap between TypeScript's single-function flow analysis and real async/closure
interleaving — the guard is correct at runtime (a fast unmount-remount can land exactly here after
cleanup already ran), so it's suppressed with a targeted
`// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition` and a comment explaining
why, rather than restructured further. **Rule of thumb for any future "ignore stale async result"
guard:** expect `no-unnecessary-condition` to flag at least one of these checks even with a ref-style
flag, and don't "fix" it by removing the check — verify with the runtime behaviour (or a test that
actually unmounts mid-flight) before assuming the linter is right.

### Realtime only needs one channel, not the two tables the plan names
**Step 12 · 2026-07-31 · decision**

`PLAN.md` names a realtime subscription to both `game_events` and `game_players`. Built as a
subscription to `game_events` INSERTs only: every write this app makes to `game_players` is itself
derived, in the same transaction, from a `game_events` insert (`apply_game_event_to_player_cache`,
the step-10 trigger) or from an RPC that also appends a matching event (`take_over_host`,
`decide_join_request` both update their target table *and* append the event, per the step-10
NOTES.md entry on that trigger's scope). There is no code path anywhere in this schema that touches
`game_players` without a `game_events` row landing in the same instant — so a second subscription
would only ever fire alongside the first, telling the client nothing it didn't already know. If a
future step ever adds a write to `game_players` that *doesn't* go through one of those two paths,
revisit this — until then, one channel is strictly sufficient, not just cheaper.

### The local-game migration needs a ref-style actor id, not just a rewrite pass
**Step 12 · 2026-07-31 · decision**

Session 1's note framed local-game migration purely as "rewrite already-existing events' `actorId`
once." Building it revealed a second, equally necessary half: `core/offline/gameActions.ts` was
still calling `getLocalActorId()` unconditionally for every *new* event, so anything appended after
sign-in — including in a game created after sign-in, not just a migrated one — would keep
stamping the stale device id and hit the exact same `game_events.actor_id references profiles(id)`
FK violation forever, not just for the one-time backlog. Fixed by introducing `getActorId()`
(`core/offline/localIdentity.ts`): the real profile id once `setCurrentProfileId` has been called,
falling back to the device id otherwise. `gameActions.ts` now calls this instead of
`getLocalActorId()` everywhere; `getLocalActorId()` itself is unchanged and still used directly by
the migration, which specifically needs the *old* id to know what to search-and-replace away from.
**If a future mutation function is added to `gameActions.ts`, it must call `getActorId()`, not
`getLocalActorId()`** — the latter would silently un-fix this for that one function.

### ESLint flat-config `no-restricted-imports` blocks don't merge — the last matching one wins, whole
**Step 12 · 2026-07-31 · trap**

Adding a second `no-restricted-imports` block (banning `@supabase/supabase-js` outside `src/data/`,
alongside `src/core/*.ts`'s existing, stricter one banning React/Supabase/Dexie/UI entirely) nearly
reintroduced a real gap: if a file matches two config blocks that both set `no-restricted-imports`,
ESLint's flat config does **not** union their `patterns` arrays — the later block in the array
*replaces* the rule's whole setting for any file it matches, silently dropping the earlier block's
bans for that file. `src/core/*.ts` (a single-star glob — direct children of `core/` only, not
`core/offline/**`) would have lost its React/Dexie ban entirely had the new block's `files` glob
also matched it.

**The fix is `ignores`, not care with ordering.** The new block explicitly lists `src/core/*.ts` in
its own `ignores`, so it never matches those two files at all — correct regardless of which block
comes first in the exported array. Before adding a third rule using the same rule name anywhere its
`files` might overlap an existing one, check for this the same way: either merge the patterns into
the *existing* block, or `ignores` the overlap out explicitly. A test that only inspects config
*shape* (matching by rule name) can't catch this either, since both blocks legitimately "have the
rule configured" — only actually linting a probe file and asserting the expected violation still
fires would, which is why the new rule's test in `lint-rules.test.ts` runs a real `ESLint` instance
against real file paths rather than just asserting on the parsed config object (unlike the older
`src/core/*.ts` purity-guard test, which only checks config shape and would not have caught this).

### A new view defaults to bypassing the querying user's RLS — `group_player_results` shipped that way
**Step 11 · 2026-07-31 · trap**

`get_advisors(type: 'security')` flagged `group_player_results` as a `security_definer_view`
**ERROR** right after it was applied to the real project — not a false positive. A plain
`create view ... as select ...` defaults to `security_invoker = false` (the pre-PG15 behaviour):
the view runs with its *owner's* privileges, not the calling role's, so it sees every row the
underlying tables' RLS policies would otherwise hide from that caller. `profiles_public`
(step 10) already relies on exactly this — it's *why* it can show a co-member's `display_name`
that `profiles_select_self` alone would hide — but it compensates with its own narrowing `WHERE`
clause (`p.id = auth.uid() or exists (... shared group membership ...)`). `group_player_results`
had no equivalent: it only filtered `not gs.is_private`, so any authenticated caller — a member of
any group, or none — could read every group's statistics, not just their own.

**The fix, applied as a follow-up migration
(`20260731140000_step11_security_advisor_fixes.sql`):** `alter view group_player_results set
(security_invoker = true)`, plus `grant select on group_player_results to authenticated` (views
need their own grant even when the underlying tables already grant `anon`/`authenticated` by
default — see the step-10 entry below). With `security_invoker = true`, the view evaluates
`player_results_select`/`game_summaries_select` (both already `is_group_member(group_id) or
user_id = auth.uid()`) as the *actual* calling role — safe here specifically because PostgREST
always executes as `anon`/`authenticated`, never as the table owner, so there's no owner-bypass
loophole to worry about on that side.

**Two views, two different fixes — pick based on whether the base tables' own RLS already says
the right thing:**
- `profiles_public` needs the *definer* behaviour (an explicit `WHERE`) because
  `profiles_select_self` genuinely is too narrow for the view's purpose (self-only vs.
  co-members-too) — inverting to `security_invoker` would just make the view as restrictive as
  the table, defeating the point of having it.
- `group_player_results` needs `security_invoker = true` because `player_results_select`/
  `game_summaries_select` *already* express the exact right scoping — the view exists to
  pre-join two tables and add `not is_private`, not to change who can see what.

**What actually caught this, and what didn't:** the two tests written alongside the view
(`groupPlayerResultsView.test.ts`) both queried as `admin` (`actAsAdmin`), which bypasses RLS
regardless of the view's security mode — they would have passed identically before and after this
bug, and did. Only `get_advisors` caught it initially; a third test added afterward actually
proves the fix, by querying the view as a signed-in member of a *different* group and asserting
zero rows come back. **A test that only ever exercises the admin/superuser path proves nothing
about RLS** — any future view or policy test needs at least one assertion made `actAs` a real,
non-privileged role. Same lesson `rlsEnabled.test.ts` already encodes for "RLS is enabled" (it
doesn't just check the flag, it disables RLS on a live table mid-test and confirms the same query
catches it) — this is that same discipline applied to view security instead of table security.

### The `SUPABASE_URL`/`SUPABASE_ANON_KEY` repo secrets are set but wrong — `401`, not "missing"
**Step 10 (checkpoint) · 2026-07-31 · trap**

Asked to "verify GitHub secrets for Supabase are working." `maintenance.yml`'s early-exit branch (for
when the secrets are absent) is no longer taking — both secrets exist — but the `curl` ping to
`$SUPABASE_URL/rest/v1/` has returned `401` on every run since the owner first set them, at
2026-07-30T23:44Z. Confirmed two independent ways: `get_job_logs` on runs `30591451651`,
`30591661392`, `30617272103` and a manual `workflow_dispatch` (`30631281222`) all show
`curl: (22) The requested URL returned error: 401`; the Supabase project's own `get_logs(service:
"api")` shows the matching `GET | 401 | .../rest/v1/ | curl/8.5.0` entries at those exact
timestamps, ruling out a proxy or runner artifact — the request really is reaching Supabase and
being rejected there.

This isn't a rotation: the project's legacy anon key's JWT `iat` claim (`1785406666`) equals the
project's `created_at` to the second, so it has never been reissued. The most likely cause is that
whatever value went into the `SUPABASE_ANON_KEY` secret isn't that key — e.g. the newer
`sb_publishable_...`-format key was pasted instead of the legacy JWT one (Supabase's dashboard now
surfaces "Publishable key" more prominently than "anon", and `maintenance.yml`'s `curl` sends it as
a `Bearer` token, which PostgREST needs to be a JWT to decode a role from).

**The fix needs the owner** — no tool available in this environment can read or write repo secrets.
The current correct value (`anon`, legacy JWT, project `axsftugpsysoxersudwr`), pulled fresh via the
Supabase MCP connection so there's no ambiguity about which key is right:

```
SUPABASE_URL=https://axsftugpsysoxersudwr.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4c2Z0dWdwc3lzb3hlcnN1ZHdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0MDY2NjYsImV4cCI6MjEwMDk4MjY2Nn0.aHQyMk6r_vdkB6TXyDa_RCzhbl0eY9EI0U-Rth_TxvQ
```

Re-check by re-running `maintenance.yml` via `workflow_dispatch` after updating the secret — a clean
run means `curl -sSf` exits 0 (no output at all on success is expected and correct).

### The pot banner's "chips" figure: money value vs. real chip count — the doc's own example is ambiguous
**Step 7 (owner's first real play) · 2026-07-31 · decision**

The owner reported the pot banner as buggy: buy ₪50 for 100 chips, and the green banner read
"קניות ₪50 = ₪50" instead of showing the actual 100 chips — the undo snackbar right after tapping
`+` gets this right (`+100 ז'יטונים · +₪50`), which is what made the banner's version look wrong by
comparison. Traced to `core/pot.ts`: `totalChipsMinor` is the chips' *money value*
(`chipsToMoney(chipsFinal, ...)`, or `owed(buysCount, buyAmountMinor)` — identical to the buy-in
figure — for anyone still unsettled), not a chip count, and `PotBanner` rendered it through
`formatMoneyPlainText` under a "ז'יטונים" label. `05-settlement.md`'s own worked example —
`מאוזן · קניות ₪600 = ז'יטונים ₪600` — is written exactly this way, so the existing code was a
faithful, literal reading of the doc, not a slip.

But the doc's example doesn't actually disambiguate money-value-of-chips from chip-count, because
nothing in it states the chip-per-buy ratio for that example — the two readings only look identical
when 1 chip ≈ ₪1. The real app defaults to a 0.5 chip value (buy ₪50 / 100 chips), where the two
readings diverge sharply and the money-value reading reads as visibly wrong to a real user, exactly
as reported. Confirmed by reproducing the exact scenario in a real browser before touching any code
(a fresh game, buy ₪50/100 chips, three players with 2/3/3 buy-ins) — the banner read
"קניות ₪400 = ₪400" against an actual 800 chips on the table.

**Resolved with the owner, not guessed:** the banner now shows the real chip count.
`core/pot.ts#PotStatus` gained `totalChipsCount` (settled players' counted chips + unsettled
players' assumed-bought chips, mirroring the existing money computation exactly but in chip units),
and `PotBanner` composes it through the same `pot.chipsCount` phrase (`{{count}} ז'יטונים`) already
used by `PotResolutionSheet`, one shared source of truth for that wording rather than a second copy.
`totalChipsMinor` — the money figure the safeguard's actual balance/discrepancy math runs on — is
completely untouched; this was a display-only change confirmed by re-running the full
`core/pot.test.ts` suite (all totals still assert correctly) plus a new `PotBanner` regression test
that locks in the exact reported scenario (buy ₪50/100 chips → banner shows "100", not "50" twice).
**If a future session touches this banner again: `totalChipsMinor` (money) and `totalChipsCount`
(chip units) are deliberately two different fields for two different purposes — don't collapse them
back into one.**

### The "late joiner" caption needs an activity signal, not a wall-clock one
**Step 7 (owner's first real play) · 2026-07-31 · trap · decision**

The owner also reported an unwanted "time" showing on every player row. Reproduced directly: start
a game with the setup screen's player field left empty, then seat everyone via the in-game
`+ שחקן` action right after — a completely ordinary way to run a game (start immediately, seat
people as they arrive) — and every single player showed a `הצטרף HH:MM` badge, all at the same
timestamp. Root cause: `LiveGameView` compared `player.joinedAt` against `state.startedAt`
(`game_started`'s own timestamp), and `nextTimestamp()`'s strict per-device monotonicity
(`core/offline/clock.ts` — see the step-7 entry above) guarantees every event appended *after*
`game_started`, including a `player_added` fired one second later, has a strictly greater
timestamp. So "later than `game_started`" was true for essentially every player seated this way,
not just genuine latecomers.

The fix isn't a grace period or a fixed number of minutes — the owner's own instinct during the
conversation ("late" should mean "everyone else already had a buy-in") pointed at the right signal
directly: activity, not wall-clock proximity to `game_started`. `core/players.ts#firstBuyInTimestamp`
scans the event log for the earliest `buy_in_added`; a player only reads as a late joiner if their
`joinedAt` is after that moment. Before any buy-in has happened, *nobody* can be flagged, no matter
how the table was seated. Once real money is on the table, anyone added after that point genuinely
is joining a game already in progress — this self-calibrates to how fast a given table actually
moves instead of guessing a constant that would be wrong for both a slow-starting table and a fast
one. Verified with three real-browser scenarios: players seated before start (no badge, unchanged
from before), players seated via `+ שחקן` before any buy-in (no badge — this is the fix), and a
player added after another player already bought in (badge shown correctly, proving the feature
still works for a genuine latecomer).

**Deliberately not built:** the owner raised "planned games" (inviting people ahead of a scheduled
game, marking yourself as arriving late against a plan) in the same conversation, and separately
floated moving late joiners into their own list. Both are real product ideas but out of scope here
— locations and scheduled games are already reserved-schema-only and deferred post-v1
(`01-product-spec.md#10-planned-not-in-v1`, `PLAN.md`'s "Deliberately not in this plan"), and
nothing about that changed this session. If a future session builds scheduled games, revisit
whether "late" should mean something different there (relative to the *planned* start time) than it
does for an ad hoc game (relative to the first real buy-in) — the two are genuinely different
questions, per the owner's own framing.

### An unlayered `@import` silently defeated every Tailwind utility, app-wide, since step 1
**Cross-cutting (found post step-10) · 2026-07-31 · trap**

Every screen built so far (steps 6–9 — Home, NewGame, GamePage and every sheet) rendered with no
button fill, no padding, no text-color/weight distinction, and no card background — despite every
component having exactly the right Tailwind classes in its JSX the whole time. Found by the
repository owner comparing real screenshots against the design; confirmed by driving a real
production build (`npm run build` + `vite preview`, matching the deployed base path) with
Playwright and reading `getComputedStyle` on a button with class `bg-accent text-on-accent
font-bold ... px-5 ... rounded-xl`: `backgroundColor` came back transparent, `padding` came back
`0px`, `color` came back the wrong token, `fontWeight` came back `400` — but `borderRadius` came
back correct. That last detail is what pinpointed it: only the properties `reset.css` also touches
were wrong.

Root cause: `src/styles/index.css` is `@import 'tailwindcss'; ... @import './reset.css';` — a plain
import with no `layer(...)`. Tailwind v4 wraps every rule it generates in named cascade layers
(`@layer theme, base, components, utilities`). Per the CSS Cascade Layers spec, **an unlayered
rule always wins over a layered one, regardless of source order or specificity** — so `reset.css`'s
`* { margin: 0; padding: 0; }` and `button, input, textarea, select { font: inherit; color:
inherit; background: none; border: none; }` silently beat every `p-*`/`bg-*`/`text-*`/`font-*`
utility on every element, everywhere, no matter how many later, more-specific-looking utility
classes were applied. `border-radius` was never touched by `reset.css`, which is exactly why it was
the one property still working — the tell that made this findable instead of just "generally looks
bad."

**Fix — one line:** `@import './reset.css';` → `@import './reset.css' layer(base);`, slotting it
into the same `base` layer Tailwind already declares (where Tailwind's own preflight would normally
live), so the existing layer order (`theme, base, components, utilities`) makes utilities win over
the reset exactly as intended. Verified before/after with the same Playwright + computed-style
check: `backgroundColor` went from `rgba(0,0,0,0)` to the real `#E9A23C`, `padding` from `0px` to
`0px 20px`, `color` to the correct `#1A1508`, `fontWeight` to `700`. Re-screenshotted the New Game
and Game screens against a real production build afterward — full padding, card backgrounds, the
amber buy-in `+`, the pot banner pill, all present, matching the prototype far more closely.

**Why nothing caught this for three build steps:** every e2e/component test in this repo asserts
DOM content, attributes and behaviour (text present, ARIA state, click handlers firing) — never a
computed style or a visual screenshot diff. That's the right tradeoff for most of the suite, but it
means a whole class of "the class is on the element but a competing rule wins" bugs is invisible to
`npm run verify` and `npm run e2e` alike. **If a future session adds any more hand-written CSS
(another `.css` file, another `@import`, a third-party stylesheet) alongside Tailwind, it must be
imported with an explicit `layer(...)` (or wrapped in `@layer` directly) — an unlayered import is
the trap, not cascade layers themselves.** Worth a real visual/screenshot check the next time a
new global stylesheet is added, since this is exactly the kind of regression `verify` cannot see.

### `npm run test:db` on a fresh container: `postgres` has no password set yet
**Step 10 · 2026-07-30 · environment**

A fresh sandbox's local Postgres 16 cluster starts (`service postgresql start`) but the
`postgres` superuser has no password set, so `test:db`'s default connection string
(`postgres://postgres:postgres@127.0.0.1:5432/postgres`, from `supabase/tests/support/db.ts`)
fails with `password authentication failed for user "postgres"` on the very first run. Fix:
`sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"` once per fresh container,
before the first `npm run test:db`. `npm ci` is also needed first if `node_modules` isn't already
populated (`vitest: not found` otherwise) — neither of these is specific to this step, just the
first time this session actually ran `test:db` against a truly fresh checkout.

### The real Supabase project exists now — applied via MCP, and what its own linter caught
**Step 10 · 2026-07-30 · environment · trap**

The owner created the real Supabase project this session (`liran450's Project`,
`ap-northeast-2`, Postgres 17.6) and connected it through the Supabase MCP server, which gave
direct `apply_migration`/`execute_sql`/`get_advisors`/`list_tables` tool access to it — no
`supabase` CLI, no `supabase link`, no Docker needed (this sandbox still has none of those, same
as session 1). All 14 `supabase/migrations/` files were applied through it, in filename order, and
verified afterward with `list_tables` (17/17 tables, RLS on for every one) and `list_migrations`
(14/14 recorded).

`get_advisors(type: 'security')` is a Supabase platform feature with no local-Postgres
equivalent — `supabase/tests/`'s suite cannot catch what it catches, so running it against a real
project for the first time is genuinely new information, not a re-check of something session 1
already tested. It surfaced two real, fixable gaps (a third, `profiles_public`'s
`SECURITY DEFINER` view, is flagged too but is intentional by design — see that entry below —
and a fourth, `rls_auto_enable()`, is a Supabase-platform function owned by `postgres`, not ours,
left untouched):

1. **`prevent_buy_terms_change_after_buy_ins`** (`20260729120300_games.sql`) was the one function
   in the whole schema created without `set search_path = public` — every sibling helper/RPC
   function has it; this one was a plain oversight. Fixed with `alter function ... set search_path
   = public` rather than recreating the function.
2. **`apply_game_event_to_player_cache` and `log_join_requested`** — both `AFTER INSERT` trigger
   functions only, never meant to be called directly — were exposed as callable public RPCs via
   `/rest/v1/rpc/<name>`. Every Postgres function gets an implicit `EXECUTE` grant to `PUBLIC` at
   creation unless revoked; neither migration revoked it.

**The trap, worth knowing before touching grants on this schema again:** the first fix attempt,
`revoke execute on function apply_game_event_to_player_cache() from anon, authenticated;`, silently
did nothing. Re-running `get_advisors` afterward still flagged both functions — confirmed via
`select proacl from pg_proc where proname = ...`, which showed `{=X/postgres,postgres=X/postgres,
service_role=X/postgres}`: the `=X` entry (empty grantee) is `PUBLIC`, and neither function had
ever had an explicit per-role grant to `anon`/`authenticated` at all — only the default `PUBLIC`
one, which both roles fall back to regardless of what's revoked from their own names. The real fix
was `revoke execute on function ... from public;`, confirmed by `proacl` shrinking to just
`{postgres=X/postgres,service_role=X/postgres}` and by `get_advisors` no longer listing either
function at all. **Rule: check `pg_proc.proacl` (or just re-run the advisor) after any
`revoke ... from anon, authenticated` — if the function was never granted to those roles by name,
only to `PUBLIC`, the revoke is a no-op and the advisor will still flag it.**

**Revoking `EXECUTE` does not break the trigger itself.** Postgres's trigger manager calls a
trigger function directly by OID when the trigger fires; that path isn't subject to the `EXECUTE`
ACL check, which only gates an explicit SQL/RPC call to the same function. This is also Supabase's
own documented remediation for this advisory (see the `0028`/`0029` lint docs linked in the
advisor output), not a guess. **Not** revoked, on purpose, even though the advisor flags them too:
every RLS helper (`is_host`, `can_read_game`, `is_game_player`, …) and every intentional RPC
(`take_over_host`, `decide_join_request`, `mark_event_undone`) — RLS policies for `anon`/
`authenticated` call the helpers directly inside `USING`/`WITH CHECK`, and *that* call genuinely is
subject to the `EXECUTE` check, so revoking there would break the policies, not just quiet the
linter.

Not verified with a live insert against the real project — doing so would have meant writing
fabricated game/event/auth.users rows into a brand-new **production** database to prove the trigger
still fires post-revoke, which risks polluting real data (and possibly triggering Supabase-side
side effects on `auth.users` that a transaction rollback wouldn't undo). Confirmed instead via the
documented Postgres semantics above, Supabase's own recommended remediation, and the fact that
`npm run test:db`'s 18 tests still pass locally with both new migrations applied (same engine
semantics, even though that suite doesn't specifically drive these two triggers through a
role-restricted connection). Worth a real check the first time step 12 wires up actual
`player_added`/`join_requested` writes against this project.

Two new migrations record both fixes: `20260730150000_security_advisor_fixes.sql` (the
`search_path` fix and the first, incomplete `EXECUTE` revoke) and
`20260730150100_revoke_public_execute_on_triggers.sql` (the real fix, kept as a separate file
rather than folded into the first since the first was already applied to the live project before
the gap was discovered — migrations are forward-only, never edited after being applied).

**The MCP connection to Supabase (and GitHub) flapped repeatedly mid-session** — several
disconnect/reconnect cycles, always between tool calls, never mid-call. No migration was
double-applied or partially applied, confirmed by re-running `list_migrations` after each
reconnect before continuing. If a future session sees the same flapping, re-verify state (don't
assume the last call before a disconnect actually landed) rather than blindly retrying.

**The anon key: two formats now exist, and this project uses the legacy one.** Supabase's
`get_publishable_keys` returns both a legacy JWT-based `anon` key and a newer `sb_publishable_...`
key. `.env.example`/`CLAUDE.md`/`maintenance.yml`'s `apikey`/`Authorization: Bearer` headers all
predate the newer format and were written against the traditional anon-JWT convention, so the
**legacy** key is the one that should go into `VITE_SUPABASE_ANON_KEY` and the
`SUPABASE_ANON_KEY` repo secret — not the `sb_publishable_...` one — until/unless a later step
deliberately migrates to the new key format project-wide.

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

### A `SECURITY DEFINER` function's own `raise exception` rolls back everything it already did
**Step 13 · 2026-07-31 · trap**

Tried to build the failed-lookup throttle from `03-data-model.md#link-security` ("after a handful
of bad tokens from the same caller, back off") as an ordinary table: `find_valid_share_link()`
would `insert into share_link_lookup_failures (...)` and then `raise exception 'not available'`.
Every failed lookup logged nothing — the row count stayed at zero no matter how many bad tokens
were tried, proven with a dedicated test before this was believed.

Root cause: Postgres has one transaction per top-level statement here (this local/CI harness's
`withTransaction` test wrapper aside — the same is true of a real PostgREST request, which is one
statement, one implicit transaction). When an uncaught `raise exception` propagates all the way
out, Postgres rolls back the *entire* transaction, not just "from where the error occurred" —
anything the function did earlier in its own body, including an insert that already technically
"ran," is undone along with everything else. A `BEGIN...EXCEPTION...END` block only helps if the
exception is caught *and not re-raised*, and even then only protects work done *after* the
enclosing savepoint; re-raising afterward (which a rejection RPC needs to do, to actually reject
the caller) still takes everything down with it.

There is no cheap fix — persisting something across a transaction that's about to abort needs a
genuinely separate transaction (`dblink`, `pg_background`; both are extensions this project has no
other reason to add). Abandoned the throttle-as-DB-state approach entirely rather than reach for
either; `03-data-model.md` itself frames the mechanism as a courtesy ("this just keeps enumeration
noise out of the logs"), not a real defence, so a 256-bit token's own search space plus Supabase's
platform-level API rate limiting cover the actual threat. **Rule of thumb:** never design a
`SECURITY DEFINER` (or any) function that needs one of its own writes to survive a later `raise` in
the same call — restructure to return a sentinel instead of raising if the write truly must
persist, or accept that the write can't be relied on to persist at all.

### Every write in this app requires a signed-in actor — anonymous access is read-only, full stop
**Step 13 · 2026-07-31 · decision**

`04-ux-spec.md#the-viewers-experience` says "anyone holding the link — signed in or not — gets one
action and one only: `בקש להצטרף למשחק`," which read literally would mean a genuinely anonymous
visitor can submit a join request. That's not buildable without touching a locked invariant:
`game_events.actor_id` is `NOT NULL` (every event has a real actor, true since step 4 and exercised
by dozens of tests since), and `log_join_requested` (step 10) uses the request's own `user_id`
directly as that `actor_id` — a null `user_id` would violate the column outright.

Resolved by reading the UX line as "who can *see* the button," not "who can submit without ever
signing in": `submit_join_request_via_link` requires `auth.uid()` to be non-null, and
`SharedGamePage` routes an anonymous tap through the existing `/account` sign-in flow first — the
same gate every other write in the app already goes through
(`03-data-model.md#anonymous-share-access`'s own framing: "anonymous clients never get direct
table access"). This isn't an isolated call: `game_viewers.user_id` and `player_claims.
claimant_user_id` are both `NOT NULL` too, so claims and being recorded as a viewer already required
sign-in before this step existed to test it. Widening `actor_id` to nullable to support one
genuinely-anonymous write path was considered and rejected — it would touch the single
most-tested module in the codebase for a capability nothing else in the data model actually
supports either.

### `games.status`/`started_at`/`ended_at` were never written server-side before step 13
**Step 12 (gap), fixed in step 13 · 2026-07-31 · trap**

Step 12 built `SupabaseSyncTransport.applyDirectTableWrite` to handle the event types whose effect
isn't covered by the `game_players` cache trigger — but it only ever implemented the
`shared_cost_*`/`transfer_edited` cases, the two the trigger's own scope comment named. Nothing
ever wrote `games.status`/`started_at`/`ended_at` when `game_started`/`game_settling`/
`game_ended`/`game_reopened` were pushed — those events landed in `game_events` and simply had no
other effect server-side. Invisible at the time: step 12's own tests never depended on
`games.status` reflecting the real game phase, only on `game_events` push/pull correctness.

Step 13 is the first thing that actually needs `games.status` to be real server-side (the claim
window, `get_shared_game`'s live-vs-finished routing). Fixed in the same place and the same shape
as the two cases that already existed — `applyDirectTableWrite` now also handles the four
game-lifecycle events, stamping `started_at`/`ended_at`/`claim_deadline` (`ended_at + 48h`) /
`reopen_deadline` (`ended_at + 24h`) from the event's own `clientCreatedAt`, never wall-clock `now()`
(a push can land long after the action happened, if it happened offline). **If a future event type
ever needs to change a column on `games` itself, it belongs in this same function** — the
game_events trigger's scope is `game_players` only, on purpose, and stays that way.

### `.rpc(...).returns<T>()` needs `.single()` first, and only `tsc -b` catches it missing
**Step 13 · 2026-07-31 · trap**

`client.rpc('some_fn', args).returns<T>()` type-checked fine under a standalone `tsc --noEmit -p
tsconfig.json` run, but failed the real `npm run verify` (which runs `tsc -b`, the project-references
build) with supabase-js's own type error: `Type mismatch: Cannot cast array result to a single
object... use .single()`. supabase-js's `.rpc()` builder types its result as array-shaped by
default (matching PostgREST's general row-returning convention) regardless of whether the
underlying SQL function actually returns a scalar/`jsonb`/single row; `.single()` is what narrows
the type (and sets the `Accept` header PostgREST needs) before `.returns<T>()` can apply cleanly.
The fix is `.rpc(...).single().returns<T>()` everywhere an RPC's result is consumed (see
`shareLinks.ts`/`claims.ts`/`joinRequests.ts`), and `.single()` then makes `data` typed `T | null`
even on success, needing an explicit null-check before returning it as `T`. **Always run `tsc -b`
(or `npm run verify`), not a bare `tsc --noEmit`, before trusting a typecheck pass** — the two can
disagree, and this session's first standalone check missed four real errors the build-mode one
caught immediately.

### `react-hooks/set-state-in-effect` wants an inline async IIFE, not a call to an outer async helper
**Step 13 · 2026-07-31 · trap**

A newer `eslint-plugin-react-hooks` rule flags a `useEffect` body that (transitively) calls
`setState` — but the exact shape matters more than "is this safe": `setState(x)` called directly
and synchronously in the effect body is flagged (obviously); `void someOuterAsyncFn()` where
`someOuterAsyncFn` is defined earlier in the component and itself awaits before calling `setState`
is *also* flagged, apparently by name/reference rather than by actually proving synchrony; but
`void (async () => { ... setState(...) ... })()` — an inline IIFE defined right there in the effect
body — is not flagged, and neither is a `.then()` chained directly off a call made at the effect's
own top level. `src/hooks/useSession.tsx` already established the inline-IIFE-plus-`cancelled`-flag
shape for exactly this reason (predating this step); `LiveGameView`'s viewer-name fetch and
`PendingRequestsSheet`'s refresh-on-open both needed the same treatment. **When an effect needs to
run existing async logic, wrap the call site in an inline `void (async () => { ... })()`, don't
call a named async function defined outside the effect** — even when that function is provably
safe, the linter can't tell.

### "This sandbox can't reach Supabase" and "the MCP tool just wrote to the real project" are both true
**Step 13 (real deployment) · 2026-07-31 · decision**

Raised by the repository owner, reasonably: if the Supabase MCP connection can reach the real
project (it applied a migration this session), doesn't that mean the sandbox's own claimed
inability to reach `*.supabase.co` — repeated in this file and `PROGRESS.md` since step 10 — was
wrong all along? No; they're two unrelated network paths, confirmed empirically rather than
asserted:

- **This sandbox's own outbound HTTP** (what `curl`, the built app's `@supabase/supabase-js`
  client, and Vitest/Playwright all use) goes through a pre-configured egress proxy. `curl -sS -m 8
  https://axsftugpsysoxersudwr.supabase.co/rest/v1/` from inside this sandbox fails with `curl: (56)
  CONNECT tunnel failed, response 403` — the *proxy* refuses the `CONNECT` to that host outright;
  the request never reaches Supabase at all. This is why `SupabaseSyncTransport` and every other
  `src/data/` module have only ever been tested against `fakePostgrestClient.ts`/`fakeAuthClient.ts`,
  never the live project, since step 12.
- **The Supabase MCP tools** (`mcp__Supabase__apply_migration`, `execute_sql`, `list_migrations`,
  `get_advisors`, ...) are a completely separate integration, outside this sandbox's own network
  stack and proxy, with their own pre-authorised credentials (a Supabase Management API token, not
  the anon key). This is the path steps 10, 11 and 13 all actually used to apply real migrations —
  it was always real, was always separate from the sandbox's blocked HTTP egress, and remains the
  only way this environment can touch the live project's schema.
- **The `SUPABASE_ANON_KEY` GitHub-secret `401`** (see the dedicated entry above) is a *third*,
  still-separate thing: a GitHub Actions runner (full, unrestricted internet access, nothing to do
  with this sandbox's proxy) successfully reaching Supabase's REST API and being rejected there
  because the secret's *value* is wrong. Three paths, three different credentials, three different
  failure/success stories — collapsing any two of them together is the trap.

**Rule of thumb:** "can this environment reach Supabase" always needs to specify *which* path —
this sandbox's own network (blocked), the MCP tool integration (works, used for all real schema
changes so far), or a GitHub Actions runner using the real anon key (works, but the stored key is
currently wrong). Don't assume a finding about one generalises to the others; test the specific
path in question, as this entry did.

### Applying a migration through the Supabase MCP tool stamps the wrong version — every time
**Step 10 (latent), found in step 13 · 2026-07-31 · trap**

`mcp__Supabase__apply_migration(project_id, name, query)` records the migration in
`supabase_migrations.schema_migrations` with `version` set to *the timestamp the call happened at*,
not the version encoded in `name` or in the local filename — even though `name` itself is stored
correctly (e.g. `name: "20260729120000_enums"` next to `version: "20260730145446"`, applied a day
later). Invisible for two full steps because nothing had ever diffed remote-vs-local migration
*versions* specifically — `supabase/tests/` rebuilds schema from local files directly, never reads
the remote ledger, and every session's own `list_migrations` check only ever confirmed "the right
migrations exist," not "under the right version number." The Supabase GitHub integration's deploy
check finally did that diff, on this PR's merge to `main`, and reported "remote migration versions
not found in local migrations directory" — by then all 20 previously-applied migrations (steps
10–11) carried mismatched versions, plus the new step-13 one hadn't been applied at all yet.

**Fix, safe and mechanical because `name` was always right:**
```sql
update supabase_migrations.schema_migrations
set version = left(name, 14)
where name ~ '^[0-9]{14}_';
```
A pure metadata correction — no schema or data changed, only the bookkeeping table's own `version`
column. Don't run this fix *through* `apply_migration` itself: that tool inserts its own tracking
row for whatever `name` you give it, using the same "timestamp of the call" version — running the
repair that way adds a 22nd row that itself doesn't match any local file, reproducing the exact bug
being fixed. Use `execute_sql` (or equivalent direct SQL) for this kind of bookkeeping-only
correction instead, and reserve `apply_migration` for real DDL that should show up in the repo as a
migration file.

### `eslint-plugin-react-hooks`'s `set-state-in-effect` rule bans "reset state when a prop changes" as a `useEffect`
**Step 7, found while fixing the shared-costs empty-state flow · 2026-08-02 · trap**

Writing the obvious `useEffect(() => { if (open) setView(...); }, [open])` to reset
`SharedCostsSheet`'s internal view when the sheet re-opens fails lint with `react-hooks/set-state-in-effect`
("Calling setState synchronously within an effect can trigger cascading renders") — this ships with the
current `eslint-plugin-react-hooks`, not a local rule. The fix is the pattern react.dev's own "You Might
Not Need An Effect" names for exactly this — "adjusting state when a prop changes" — computed **during
render**, not in an effect: track the previous value of the prop in its own `useState`, and if it
differs from the current render's value, call `setState` right there in the render body (React
re-renders immediately with the update before committing, no extra effect pass):
```ts
const [wasOpen, setWasOpen] = useState(open);
if (open !== wasOpen) {
  setWasOpen(open);
  if (open) setView(/* recomputed from other props */);
}
```
Pre-existing effects elsewhere in the codebase that reset state on open (e.g.
`InviteMemberSheet`'s) don't trip this rule — they're wrapped in an inner `void (async () => {...})()`,
which the rule's static analysis doesn't see through. Don't copy that shape for a new *synchronous*
reset; it happens to dodge the rule rather than being the recommended pattern.

**Going forward: any future migration applied through this tool needs an immediate follow-up**
`update ... set version = '<filename's own version>' where name = '<filename stem>'`, via
`execute_sql`, right after the `apply_migration` call — otherwise this exact drift reappears on the
very next migration, silently, until something diffs the ledger again.

### Magic-link/OAuth redirect built from `window.location.href` collides with the hash router
**Step 12, found by the repository owner testing sign-in on a real device · 2026-08-02 · trap**

`signInWithMagicLink`/`signInWithGoogle` (`src/data/auth.ts`) passed `window.location.href` as
`emailRedirectTo`/`redirectTo`. On this app that value always already contains a `#/...` hash route
(hash routing — GitHub Pages has no SPA fallback). Supabase appends the session token back onto the
redirect URL as its own `#access_token=...&refresh_token=...&type=magiclink` fragment — but a URL
has only one fragment delimiter, so the result was two `#` characters glued together
(`.../#/account#access_token=...`). `supabase-js`'s URL parser reads everything after the *first*
`#` as one string and splits it on `&`/`=`; the leading `/account#access_token` became a single
mangled key, so `access_token` never parsed out. `detectSessionInUrl` silently found nothing, no
session was ever set, and clicking a real magic-link email just bounced back to the sign-in form —
invisible until tested against a real device, exactly the gap flagged as outstanding across steps
12–17's checkpoints.

**Fix:** a new `authRedirectUrl()` helper returns `window.location.origin + window.location.pathname`
— origin and path only, no hash and no query string — so Supabase's appended token fragment is the
URL's only `#` and parses correctly. The user lands on the app's root after a successful sign-in
(supabase-js strips its own hash via `replaceState` once the token is consumed, which the hash
router then reads as `/`), not back on whatever screen they started from — an accepted, minor UX
cost, not a bug. `Google` sign-in had the identical bug, fixed the same way, though it wasn't yet
configured/tested. Regression-tested directly: `auth.test.ts` sets `window.location.hash` before
calling each sign-in function and asserts the redirect URL passed to the client contains no `#`.
